"""
Tests for DELETE /api/auth/account (soft delete) — ZedPulse v1.1 polish.

Scope (per review request):
  - 401 without Bearer token
  - After DELETE: GET /api/auth/me with same token => 401
  - After DELETE: POST /api/auth/login with same phone+passcode => 401
  - After DELETE: fresh signup with same original phone succeeds
  - After DELETE: user's glucose/bp/medication/reminder docs still exist in DB
    but have deleted_at set (soft, not hard delete)
  - After DELETE: share_links revoked (public GET /api/share/{old_token} => 404)
  - After DELETE: emergency_contacts entry is removed
"""
import os
import uuid
import asyncio

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from .conftest import API, _unique_phone


# ---------- Mongo direct access for soft-delete verification ----------
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "glucobp_db")


def _db_fetch(coll_name: str, query: dict):
    async def _run():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            db = client[DB_NAME]
            return await db[coll_name].find(query, {"_id": 0}).to_list(100)
        finally:
            client.close()
    return asyncio.get_event_loop().run_until_complete(_run()) if False else asyncio.new_event_loop().run_until_complete(_run())


# ---------- Helpers ----------
def _signup(phone: str, passcode: str = "4567", name: str = "TEST_DelAcct"):
    r = requests.post(
        f"{API}/auth/signup",
        json={"phone": phone, "passcode": passcode, "name": name},
        timeout=20,
    )
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    return r.json()


def _auth(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Fixture: user with full data footprint ----------
@pytest.fixture()
def seeded_user():
    """Create a fresh user and seed glucose, bp, medication, reminder,
    share_link, emergency_contact. Returns dict with creds + ids."""
    phone = _unique_phone()
    passcode = "4567"
    signup = _signup(phone, passcode, name="TEST_DelAcctUser")
    token = signup["token"]
    uid = signup["user"]["id"]
    h = _auth(token)

    # glucose
    gr = requests.post(
        f"{API}/readings/glucose",
        json={"value": 5.5, "unit": "mmol/L", "context": "fasting"},
        headers=h, timeout=20,
    )
    assert gr.status_code == 200, gr.text

    # bp
    br = requests.post(
        f"{API}/readings/bp",
        json={"systolic": 120, "diastolic": 80, "pulse": 70},
        headers=h, timeout=20,
    )
    assert br.status_code == 200, br.text

    # medication
    mr = requests.post(
        f"{API}/medications",
        json={"name": "TEST_Metformin", "dose": "500mg", "schedule": "08:00"},
        headers=h, timeout=20,
    )
    assert mr.status_code == 200, mr.text

    # reminder (schema: label, time HH:MM, kind, enabled)
    rr = requests.post(
        f"{API}/reminders",
        json={"label": "TEST_Reminder", "time": "09:00", "kind": "general"},
        headers=h, timeout=20,
    )
    assert rr.status_code == 200, f"reminder create failed: {rr.status_code} {rr.text}"

    # share link
    sr = requests.post(f"{API}/share/create", headers=h, timeout=20)
    assert sr.status_code == 200, sr.text
    share_token = sr.json()["token"]

    # emergency contact
    ec = requests.post(
        f"{API}/profile/emergency-contact",
        json={"name": "TEST_Mum", "phone": "+260977000000"},
        headers=h, timeout=20,
    )
    assert ec.status_code == 200, ec.text

    return {
        "phone": phone,
        "passcode": passcode,
        "token": token,
        "user_id": uid,
        "share_token": share_token,
    }


# ---------- Tests ----------

class TestDeleteAccount:
    """DELETE /api/auth/account — soft delete behaviour."""

    def test_delete_requires_auth(self):
        """No Bearer token => 401 (or 403)."""
        r = requests.delete(f"{API}/auth/account", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text}"

    def test_delete_invalid_token(self):
        r = requests.delete(
            f"{API}/auth/account",
            headers={"Authorization": "Bearer invalid.token.here"},
            timeout=20,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"

    def test_delete_full_soft_delete_flow(self, seeded_user):
        token = seeded_user["token"]
        phone = seeded_user["phone"]
        passcode = seeded_user["passcode"]
        uid = seeded_user["user_id"]
        share_token = seeded_user["share_token"]
        h = _auth(token)

        # Sanity: /auth/me works before delete
        pre = requests.get(f"{API}/auth/me", headers=h, timeout=20)
        assert pre.status_code == 200, pre.text

        # Perform DELETE
        d = requests.delete(f"{API}/auth/account", headers=h, timeout=20)
        assert d.status_code == 200, f"delete failed: {d.status_code} {d.text}"
        body = d.json()
        assert body.get("ok") is True

        # 1) GET /auth/me with same token => 401
        me = requests.get(f"{API}/auth/me", headers=h, timeout=20)
        assert me.status_code == 401, f"expected 401 after delete, got {me.status_code} {me.text}"

        # 2) Login with same phone+passcode => 401
        lg = requests.post(
            f"{API}/auth/login",
            json={"phone": phone, "passcode": passcode},
            timeout=20,
        )
        assert lg.status_code == 401, f"expected 401 login after delete, got {lg.status_code} {lg.text}"

        # 3) Fresh signup with same phone succeeds
        new = requests.post(
            f"{API}/auth/signup",
            json={"phone": phone, "passcode": "9999", "name": "TEST_Reclaim"},
            timeout=20,
        )
        assert new.status_code == 200, f"re-signup failed: {new.status_code} {new.text}"
        new_user_id = new.json()["user"]["id"]
        assert new_user_id != uid, "new signup should produce different user id"

        # 4) Share link publicly 404
        share_resp = requests.get(f"{API}/share/{share_token}", timeout=20, allow_redirects=False)
        assert share_resp.status_code == 404, \
            f"expected 404 for revoked share link, got {share_resp.status_code}"

        # 5) DB-level soft delete verification
        users = _db_fetch("users", {"id": uid})
        assert len(users) == 1, "user should still exist (soft delete)"
        u = users[0]
        assert "deleted_at" in u and u["deleted_at"], "user.deleted_at must be set"
        assert u.get("phone", "").startswith("deleted-"), \
            f"user.phone must be renamed to deleted-<id>, got {u.get('phone')}"

        glucose = _db_fetch("glucose_readings", {"user_id": uid})
        assert len(glucose) >= 1, "glucose readings should still exist (soft)"
        assert all("deleted_at" in g and g["deleted_at"] for g in glucose), \
            "all glucose readings must have deleted_at"

        bp = _db_fetch("bp_readings", {"user_id": uid})
        assert len(bp) >= 1, "bp readings should still exist (soft)"
        assert all("deleted_at" in b and b["deleted_at"] for b in bp), \
            "all bp readings must have deleted_at"

        meds = _db_fetch("medications", {"user_id": uid})
        assert len(meds) >= 1, "medications should still exist (soft)"
        assert all("deleted_at" in m and m["deleted_at"] for m in meds), \
            "all medications must have deleted_at"

        reminders = _db_fetch("reminders", {"user_id": uid})
        assert len(reminders) >= 1, "reminders should still exist (soft)"
        assert all("deleted_at" in r and r["deleted_at"] for r in reminders), \
            "all reminders must have deleted_at"

        # 6) share_links revoked at DB
        links = _db_fetch("share_links", {"user_id": uid})
        assert len(links) >= 1
        assert all(l.get("revoked") is True for l in links), \
            "all share_links must be revoked"

        # 7) emergency_contacts entry removed
        ec_docs = _db_fetch("emergency_contacts", {"user_id": uid})
        assert len(ec_docs) == 0, "emergency_contacts entry should be hard-deleted"
