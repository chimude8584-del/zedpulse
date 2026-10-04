import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://vitals-monitor-105.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api_base():
    return API


@pytest.fixture()
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _unique_phone():
    # Keep digits-only to pass normalize_phone length check
    suffix = uuid.uuid4().hex[:9]
    # convert hex chars to digits
    digits = ''.join(c if c.isdigit() else str(ord(c) % 10) for c in suffix)
    return f"+1999{digits}"


@pytest.fixture(scope="session")
def fresh_user():
    """Create a fresh user for the whole session and return credentials + token."""
    phone = _unique_phone()
    passcode = "4567"
    r = requests.post(
        f"{API}/auth/signup",
        json={"phone": phone, "passcode": passcode, "name": "TEST_PytestUser"},
        timeout=20,
    )
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "phone": phone,
        "passcode": passcode,
        "token": data["token"],
        "user": data["user"],
    }


@pytest.fixture()
def auth_headers(fresh_user):
    return {
        "Authorization": f"Bearer {fresh_user['token']}",
        "Content-Type": "application/json",
    }
