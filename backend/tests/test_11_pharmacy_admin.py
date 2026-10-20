"""Tests for Pharmacy user-submission + Admin dashboard flow.

Covers:
- Admin login (seeded user) returns role=admin
- Signup assigns role=user by default; /auth/me includes role
- GET /api/pharmacy/stockists public, returns 9 seeded pharmacies with contact fields
- POST /api/pharmacy/submit (auth), validations (name<2, missing phone/whatsapp)
- GET /api/pharmacy/submissions/mine (auth) returns only own submissions
- Admin endpoints protected (non-admin => 403)
- Admin stats, list submissions, approve => creates approved pharmacy
- Admin reject
- Admin CRUD pharmacies (add/update/delete)
"""
import requests
import pytest

from .conftest import API

ADMIN_PHONE = "+260000000000"
ADMIN_PASSCODE = "9999"


# ---------- Shared helpers ----------
def _admin_token():
    r = requests.post(f"{API}/auth/login", json={"phone": ADMIN_PHONE, "passcode": ADMIN_PASSCODE}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"].get("role") == "admin", f"admin role missing: {data['user']}"
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def admin_auth():
    token, user = _admin_token()
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


# ---------- Role & auth ----------
class TestRoles:
    def test_admin_login_has_admin_role(self):
        _, user = _admin_token()
        assert user["role"] == "admin"
        assert user["phone"] == ADMIN_PHONE

    def test_signup_default_role_user_and_me(self, fresh_user, auth_headers):
        assert fresh_user["user"].get("role") == "user"
        r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        assert r.json().get("role") == "user"


# ---------- Public stockists ----------
class TestStockistsSeeded:
    def test_stockists_public_shape_contact_fields(self):
        r = requests.get(f"{API}/pharmacy/stockists", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 9, f"expected >=9 approved pharmacies, got {len(data)}"
        for p in data:
            for key in ("id", "name", "note", "phone", "whatsapp", "status"):
                assert key in p, f"missing {key} in {p}"
            assert p["status"] == "approved"
        # Pharmanova should have phone + whatsapp
        pharma = next((p for p in data if p["name"] == "Pharmanova"), None)
        assert pharma is not None
        assert pharma["phone"] and pharma["whatsapp"]


# ---------- User submission flow ----------
class TestUserSubmission:
    def test_submit_requires_auth(self):
        r = requests.post(f"{API}/pharmacy/submit", json={"name": "X", "phone": "+260111"}, timeout=20)
        assert r.status_code == 401

    def test_submit_rejects_short_name(self, auth_headers):
        r = requests.post(f"{API}/pharmacy/submit", json={"name": "A", "phone": "+260111222333"},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 400
        assert "name" in r.json().get("detail", "").lower()

    def test_submit_rejects_missing_phone_and_whatsapp(self, auth_headers):
        r = requests.post(f"{API}/pharmacy/submit", json={"name": "TEST_NoContact", "note": "n/a"},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 400

    def test_submit_success_and_mine_lists_it(self, auth_headers):
        payload = {
            "name": "TEST_SubmittedPharm",
            "branch": "Lusaka East",
            "phone": "+260977111222",
            "whatsapp": "+260977111222",
            "note": "Open 24/7",
        }
        r = requests.post(f"{API}/pharmacy/submit", json=payload, headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True and body["status"] == "pending"
        sid = body["id"]

        mine = requests.get(f"{API}/pharmacy/submissions/mine", headers=auth_headers, timeout=20)
        assert mine.status_code == 200
        items = mine.json()
        assert any(s["id"] == sid for s in items)
        sub = next(s for s in items if s["id"] == sid)
        assert sub["status"] == "pending"
        assert sub["name"] == payload["name"]
        # Branch should be folded into note
        assert "Branch: Lusaka East" in sub["note"]
        # submitted_by/submitter_phone must be stripped from response
        assert "submitted_by" not in sub
        assert "submitter_phone" not in sub

    def test_mine_only_returns_own(self, fresh_user, auth_headers):
        # fresh_user already made at least one submission above (same session).
        # Create a second brand-new user and verify they get an empty list.
        import uuid as _uuid
        phone = f"+1999{_uuid.uuid4().hex[:9].translate(str.maketrans('abcdef', '012345'))}"
        s = requests.post(f"{API}/auth/signup", json={"phone": phone, "passcode": "4321", "name": "TEST_SecondUser"}, timeout=20)
        assert s.status_code == 200
        hdrs = {"Authorization": f"Bearer {s.json()['token']}"}
        r = requests.get(f"{API}/pharmacy/submissions/mine", headers=hdrs, timeout=20)
        assert r.status_code == 200
        assert r.json() == []


# ---------- Admin access control ----------
class TestAdminAccessControl:
    def test_non_admin_gets_403_on_admin_endpoints(self, auth_headers):
        for path in ["/admin/stats", "/admin/submissions?status=pending", "/admin/pharmacies"]:
            r = requests.get(f"{API}{path}", headers=auth_headers, timeout=20)
            assert r.status_code == 403, f"{path} => {r.status_code}"

    def test_missing_token_admin_endpoints(self):
        r = requests.get(f"{API}/admin/stats", timeout=20)
        assert r.status_code == 401


# ---------- Admin endpoints ----------
class TestAdminEndpoints:
    def test_admin_stats(self, admin_auth):
        r = requests.get(f"{API}/admin/stats", headers=admin_auth["headers"], timeout=20)
        assert r.status_code == 200
        data = r.json()
        for key in ("users", "pharmacies", "pending_submissions", "glucose_readings", "bp_readings"):
            assert key in data, f"missing {key} in stats"
            assert isinstance(data[key], int)
        assert data["pharmacies"] >= 9

    def test_admin_list_pending_submissions(self, admin_auth, auth_headers):
        # Ensure at least one pending exists (user may have submitted earlier)
        payload = {"name": "TEST_ForListing", "phone": "+260971000111"}
        s = requests.post(f"{API}/pharmacy/submit", json=payload, headers=auth_headers, timeout=20)
        assert s.status_code == 200
        sid = s.json()["id"]

        r = requests.get(f"{API}/admin/submissions?status=pending", headers=admin_auth["headers"], timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert any(it["id"] == sid for it in items)

    def test_admin_approve_creates_pharmacy(self, admin_auth, auth_headers):
        # Create a submission
        payload = {"name": "TEST_ApproveMe", "phone": "+260971222333", "note": "approval test"}
        s = requests.post(f"{API}/pharmacy/submit", json=payload, headers=auth_headers, timeout=20)
        sid = s.json()["id"]

        r = requests.post(f"{API}/admin/submissions/{sid}/approve", headers=admin_auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        pid = r.json()["pharmacy_id"]
        assert pid

        # Verify it appears in stockists
        st = requests.get(f"{API}/pharmacy/stockists", timeout=20)
        assert any(p["id"] == pid and p["name"] == payload["name"] for p in st.json())

        # Verify submission moved to approved
        subs = requests.get(f"{API}/admin/submissions?status=approved", headers=admin_auth["headers"], timeout=20).json()
        assert any(it["id"] == sid for it in subs)

        # Cleanup - delete the created pharmacy
        d = requests.delete(f"{API}/admin/pharmacies/{pid}", headers=admin_auth["headers"], timeout=20)
        assert d.status_code == 200

    def test_admin_reject_submission(self, admin_auth, auth_headers):
        payload = {"name": "TEST_RejectMe", "whatsapp": "+260971444555"}
        s = requests.post(f"{API}/pharmacy/submit", json=payload, headers=auth_headers, timeout=20)
        sid = s.json()["id"]

        r = requests.post(f"{API}/admin/submissions/{sid}/reject", headers=admin_auth["headers"], timeout=20)
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # Double reject should 404
        r2 = requests.post(f"{API}/admin/submissions/{sid}/reject", headers=admin_auth["headers"], timeout=20)
        assert r2.status_code == 404

    def test_admin_crud_pharmacy(self, admin_auth):
        # Create
        payload = {"name": "TEST_AdminPharm", "phone": "+260977999888", "note": "created by admin"}
        r = requests.post(f"{API}/admin/pharmacies", json=payload, headers=admin_auth["headers"], timeout=20)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        # List includes it
        lst = requests.get(f"{API}/admin/pharmacies", headers=admin_auth["headers"], timeout=20)
        assert lst.status_code == 200
        assert any(p["id"] == pid and p["source"] == "admin" for p in lst.json())

        # Update
        upd = {"name": "TEST_AdminPharm_Updated", "phone": "+260977000000", "whatsapp": "+260977000000", "note": "updated"}
        ru = requests.put(f"{API}/admin/pharmacies/{pid}", json=upd, headers=admin_auth["headers"], timeout=20)
        assert ru.status_code == 200
        # Verify via GET
        lst2 = requests.get(f"{API}/admin/pharmacies", headers=admin_auth["headers"], timeout=20).json()
        pharm = next(p for p in lst2 if p["id"] == pid)
        assert pharm["name"] == "TEST_AdminPharm_Updated"
        assert pharm["whatsapp"] == "+260977000000"

        # Appears in public stockists (approved by default)
        pub = requests.get(f"{API}/pharmacy/stockists", timeout=20).json()
        assert any(p["id"] == pid for p in pub)

        # Delete
        dr = requests.delete(f"{API}/admin/pharmacies/{pid}", headers=admin_auth["headers"], timeout=20)
        assert dr.status_code == 200

        # Verify delete
        pub2 = requests.get(f"{API}/pharmacy/stockists", timeout=20).json()
        assert not any(p["id"] == pid for p in pub2)

        # Second delete => 404
        dr2 = requests.delete(f"{API}/admin/pharmacies/{pid}", headers=admin_auth["headers"], timeout=20)
        assert dr2.status_code == 404

    def test_admin_add_pharmacy_validates_name(self, admin_auth):
        r = requests.post(f"{API}/admin/pharmacies", json={"name": "A"}, headers=admin_auth["headers"], timeout=20)
        assert r.status_code == 400


# ---------- Regression: existing endpoints still work ----------
class TestRegressionCoreEndpoints:
    def test_health(self):
        r = requests.get(f"{API}/", timeout=20)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_clinics(self):
        r = requests.get(f"{API}/clinics", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 10

    def test_pharmacy_items(self):
        r = requests.get(f"{API}/pharmacy/items", timeout=20)
        assert r.status_code == 200
        assert len(r.json()) == 34

    def test_glucose_crud(self, auth_headers):
        # Create
        r = requests.post(f"{API}/readings/glucose", json={"value": 6.2, "context": "fasting"},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 200
        rid = r.json()["id"]
        # List
        lst = requests.get(f"{API}/readings/glucose", headers=auth_headers, timeout=20)
        assert lst.status_code == 200
        assert any(x["id"] == rid for x in lst.json())
        # Delete
        d = requests.delete(f"{API}/readings/glucose/{rid}", headers=auth_headers, timeout=20)
        assert d.status_code == 200

    def test_bp_crud(self, auth_headers):
        r = requests.post(f"{API}/readings/bp", json={"systolic": 128, "diastolic": 82, "pulse": 72},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 200
        rid = r.json()["id"]
        d = requests.delete(f"{API}/readings/bp/{rid}", headers=auth_headers, timeout=20)
        assert d.status_code == 200

    def test_reminders(self, auth_headers):
        r = requests.post(f"{API}/reminders", json={"label": "TEST_Rem", "time": "08:00"},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 200
        rid = r.json()["id"]
        d = requests.delete(f"{API}/reminders/{rid}", headers=auth_headers, timeout=20)
        assert d.status_code == 200

    def test_medications(self, auth_headers):
        r = requests.post(f"{API}/medications", json={"name": "TEST_Med", "dose": "500mg", "times_per_day": 2},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 200
        mid = r.json()["id"]
        d = requests.delete(f"{API}/medications/{mid}", headers=auth_headers, timeout=20)
        assert d.status_code == 200

    def test_share_link_create_revoke(self, auth_headers):
        c = requests.post(f"{API}/share/create", headers=auth_headers, timeout=20)
        assert c.status_code == 200 and c.json().get("token")
        rv = requests.post(f"{API}/share/revoke", headers=auth_headers, timeout=20)
        assert rv.status_code == 200

    def test_report(self, auth_headers):
        r = requests.get(f"{API}/report", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        assert "ZedPulse" in r.json().get("text", "")
