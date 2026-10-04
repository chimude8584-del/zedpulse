# Auth flows: signup, duplicate, passcode validation, login, /me
import uuid
import requests


def _phone():
    suffix = uuid.uuid4().hex[:9]
    digits = ''.join(c if c.isdigit() else str(ord(c) % 10) for c in suffix)
    return f"+1888{digits}"


def test_signup_success(api_base):
    phone = _phone()
    r = requests.post(f"{api_base}/auth/signup", json={
        "phone": phone, "passcode": "1234", "name": "TEST_SignupUser"
    }, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["token"]
    assert data["user"]["phone"].endswith(phone[-7:])
    assert data["user"]["name"] == "TEST_SignupUser"
    assert "id" in data["user"]


def test_signup_duplicate_phone(api_base):
    phone = _phone()
    first = requests.post(f"{api_base}/auth/signup", json={
        "phone": phone, "passcode": "1234"
    }, timeout=20)
    assert first.status_code == 200
    dup = requests.post(f"{api_base}/auth/signup", json={
        "phone": phone, "passcode": "1234"
    }, timeout=20)
    assert dup.status_code == 400
    assert "already" in dup.json().get("detail", "").lower()


def test_signup_passcode_too_short(api_base):
    r = requests.post(f"{api_base}/auth/signup", json={
        "phone": _phone(), "passcode": "12"
    }, timeout=20)
    assert r.status_code == 400
    assert "4-8" in r.json().get("detail", "")


def test_signup_passcode_too_long(api_base):
    r = requests.post(f"{api_base}/auth/signup", json={
        "phone": _phone(), "passcode": "123456789"
    }, timeout=20)
    assert r.status_code == 400


def test_signup_passcode_nondigit(api_base):
    r = requests.post(f"{api_base}/auth/signup", json={
        "phone": _phone(), "passcode": "12ab"
    }, timeout=20)
    assert r.status_code == 400


def test_login_success_and_wrong_passcode(api_base):
    phone = _phone()
    passcode = "7777"
    r = requests.post(f"{api_base}/auth/signup", json={
        "phone": phone, "passcode": passcode, "name": "TEST_LoginUser"
    }, timeout=20)
    assert r.status_code == 200

    ok = requests.post(f"{api_base}/auth/login", json={
        "phone": phone, "passcode": passcode
    }, timeout=20)
    assert ok.status_code == 200
    assert ok.json()["token"]

    bad = requests.post(f"{api_base}/auth/login", json={
        "phone": phone, "passcode": "0000"
    }, timeout=20)
    assert bad.status_code == 401

    unknown = requests.post(f"{api_base}/auth/login", json={
        "phone": "+10000000000", "passcode": "1234"
    }, timeout=20)
    assert unknown.status_code == 401


def test_me_requires_token(api_base):
    r = requests.get(f"{api_base}/auth/me", timeout=15)
    assert r.status_code == 401


def test_me_with_token(api_base, fresh_user, auth_headers):
    r = requests.get(f"{api_base}/auth/me", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == fresh_user["user"]["id"]
    assert "passcode_hash" not in body


def test_me_invalid_token(api_base):
    r = requests.get(f"{api_base}/auth/me", headers={"Authorization": "Bearer bogus.token.here"}, timeout=15)
    assert r.status_code == 401
