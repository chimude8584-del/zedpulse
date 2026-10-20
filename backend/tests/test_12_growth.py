"""Tests for daily tip + referral growth features (iteration 12)."""
import os
import time
import pytest
import requests

BASE = os.environ["EXPO_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"


def _signup(phone, passcode="1111", name=None, referral=None):
    r = requests.post(f"{API}/auth/signup", json={
        "phone": phone, "passcode": passcode, "name": name, "referral_code": referral
    })
    return r


def _login(phone, passcode):
    return requests.post(f"{API}/auth/login", json={"phone": phone, "passcode": passcode})


# ------------- Daily tip -------------
class TestDailyTip:
    def test_tip_today_public_shape(self):
        r = requests.get(f"{API}/tips/today")
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("id", "category", "title", "body", "date", "index", "total"):
            assert k in j, f"missing {k}"
        assert j["total"] == 63
        assert 0 <= j["index"] < 63
        assert isinstance(j["title"], str) and j["title"]
        assert isinstance(j["body"], str) and j["body"]

    def test_tip_today_deterministic(self):
        a = requests.get(f"{API}/tips/today").json()
        b = requests.get(f"{API}/tips/today").json()
        assert a["index"] == b["index"]
        assert a["id"] == b["id"]
        assert a["date"] == b["date"]


# ------------- Signup referral_code generation -------------
class TestSignupReferral:
    def test_fresh_signup_returns_code(self):
        phone = f"+2607710{int(time.time())%100000:05d}"
        r = _signup(phone, "1111", "Alpha")
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u.get("role") == "user"
        assert u.get("pro_until") in (None,)
        code = u.get("referral_code")
        assert isinstance(code, str) and len(code) == 6 and code == code.upper()

    def test_referral_chain_both_get_pro(self):
        t = int(time.time()) % 100000
        inviter_phone = f"+260771A{t:05d}".replace("A", "1")
        invitee_phone = f"+260771A{t:05d}".replace("A", "2")

        r1 = _signup(inviter_phone, "1111", "Inviter")
        assert r1.status_code == 200, r1.text
        inviter = r1.json()["user"]
        code = inviter["referral_code"]
        assert inviter.get("pro_until") in (None,)

        r2 = _signup(invitee_phone, "2222", "Invitee", referral=code)
        assert r2.status_code == 200, r2.text
        invitee = r2.json()["user"]
        assert invitee.get("pro_until"), "invitee should get pro_until"

        # Check inviter via /referral/me
        tok = r1.json()["token"]
        rm = requests.get(f"{API}/referral/me", headers={"Authorization": f"Bearer {tok}"})
        assert rm.status_code == 200
        jm = rm.json()
        assert jm["code"] == code
        assert jm["is_pro"] is True
        assert jm["invites_count"] >= 1
        assert code in jm["share_text"]
        assert "ZedPulse Pro" in jm["share_text"]
        assert jm.get("pro_until")

    def test_invalid_referral_still_creates_user(self):
        phone = f"+260772A{int(time.time())%100000:05d}".replace("A", "9")
        r = _signup(phone, "1111", "NoRef", referral="ZZZZZZ")
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u.get("pro_until") in (None,)
        assert u.get("referral_code")


# ------------- Login returns referral + pro -------------
class TestLoginFields:
    def test_login_includes_referral_fields(self):
        r = _login("+15550001234", "1234")
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert "referral_code" in u
        assert "pro_until" in u

    def test_seeded_admin_has_backfilled_code(self):
        r = _login("+260000000000", "9999")
        assert r.status_code == 200
        tok = r.json()["token"]
        u = r.json()["user"]
        assert u.get("referral_code"), "admin should have backfilled code"
        rm = requests.get(f"{API}/referral/me", headers={"Authorization": f"Bearer {tok}"})
        assert rm.status_code == 200
        j = rm.json()
        assert j["code"] and len(j["code"]) == 6
        assert "ZedPulse Pro" in j["share_text"]
        assert j["code"] in j["share_text"]


# ------------- Referral/me auth required -------------
class TestReferralMeAuth:
    def test_referral_me_requires_auth(self):
        r = requests.get(f"{API}/referral/me")
        assert r.status_code == 401
