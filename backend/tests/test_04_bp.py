# Blood Pressure classification + list + delete
import requests


def test_bp_normal_120_80(api_base, auth_headers):
    r = requests.post(f"{api_base}/readings/bp", headers=auth_headers,
                      json={"systolic": 120, "diastolic": 80}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    # 120/80: systolic >=120 and systolic <130 and diastolic<80 is false since diastolic==80 triggers stage1
    # Actual logic: systolic<180,>=120 -> but diastolic==80 means stage1. Check what code says.
    # Code order: >=180 crisis; <90 low; >=140 or >=90 stage2; >=130 or >=80 stage1; >=120 elevated; else normal.
    # 120/80: diastolic>=80 -> stage1
    assert data["status"] == "stage1"


def test_bp_stage2_145_92(api_base, auth_headers):
    r = requests.post(f"{api_base}/readings/bp", headers=auth_headers,
                      json={"systolic": 145, "diastolic": 92}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "stage2"


def test_bp_crisis_185_125(api_base, auth_headers):
    r = requests.post(f"{api_base}/readings/bp", headers=auth_headers,
                      json={"systolic": 185, "diastolic": 125}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "crisis"
    assert body["severity"] == "critical"


def test_bp_low_85_55(api_base, auth_headers):
    r = requests.post(f"{api_base}/readings/bp", headers=auth_headers,
                      json={"systolic": 85, "diastolic": 55}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "low"


def test_bp_truly_normal_115_75(api_base, auth_headers):
    r = requests.post(f"{api_base}/readings/bp", headers=auth_headers,
                      json={"systolic": 115, "diastolic": 75, "pulse": 70}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "normal"


def test_bp_list_and_delete(api_base, auth_headers):
    create = requests.post(f"{api_base}/readings/bp", headers=auth_headers,
                           json={"systolic": 130, "diastolic": 85}, timeout=15)
    assert create.status_code == 200
    rid = create.json()["id"]

    lst = requests.get(f"{api_base}/readings/bp", headers=auth_headers, timeout=15)
    assert lst.status_code == 200
    rows = lst.json()
    assert any(x["id"] == rid for x in rows)

    d = requests.delete(f"{api_base}/readings/bp/{rid}", headers=auth_headers, timeout=15)
    assert d.status_code == 200
    assert d.json().get("ok") is True

    d2 = requests.delete(f"{api_base}/readings/bp/{rid}", headers=auth_headers, timeout=15)
    assert d2.status_code == 404


def test_bp_out_of_range_rejected(api_base, auth_headers):
    r = requests.post(f"{api_base}/readings/bp", headers=auth_headers,
                      json={"systolic": 500, "diastolic": 10}, timeout=15)
    assert r.status_code == 400


def test_bp_requires_auth(api_base):
    assert requests.post(f"{api_base}/readings/bp", json={"systolic": 120, "diastolic": 80}, timeout=15).status_code == 401
    assert requests.get(f"{api_base}/readings/bp", timeout=15).status_code == 401
