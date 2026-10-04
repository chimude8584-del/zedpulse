# Glucose readings: create (classifications), list, delete
import requests


def test_glucose_fasting_in_range(api_base, auth_headers):
    r = requests.post(f"{api_base}/readings/glucose", headers=auth_headers,
                      json={"value": 5.6, "context": "fasting"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "in_range"
    assert data["severity"] == "ok"
    assert data["value"] == 5.6
    assert data["context"] == "fasting"
    assert "id" in data


def test_glucose_random_hypo(api_base, auth_headers):
    r = requests.post(f"{api_base}/readings/glucose", headers=auth_headers,
                      json={"value": 3.5, "context": "random"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "hypo"
    assert r.json()["severity"] == "warning"


def test_glucose_severe_hyper(api_base, auth_headers):
    r = requests.post(f"{api_base}/readings/glucose", headers=auth_headers,
                      json={"value": 15, "context": "random"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "severe_hyper"
    assert body["severity"] == "critical"


def test_glucose_list_contains_created(api_base, auth_headers):
    create = requests.post(f"{api_base}/readings/glucose", headers=auth_headers,
                           json={"value": 6.2, "context": "after_meal", "note": "TEST_note"}, timeout=15)
    assert create.status_code == 200
    created_id = create.json()["id"]

    lst = requests.get(f"{api_base}/readings/glucose", headers=auth_headers, timeout=15)
    assert lst.status_code == 200
    rows = lst.json()
    assert isinstance(rows, list)
    assert any(x["id"] == created_id for x in rows)
    for row in rows:
        assert "_id" not in row


def test_glucose_delete(api_base, auth_headers):
    create = requests.post(f"{api_base}/readings/glucose", headers=auth_headers,
                           json={"value": 7.1, "context": "random"}, timeout=15)
    rid = create.json()["id"]
    d = requests.delete(f"{api_base}/readings/glucose/{rid}", headers=auth_headers, timeout=15)
    assert d.status_code == 200
    assert d.json().get("ok") is True

    # second delete -> 404
    d2 = requests.delete(f"{api_base}/readings/glucose/{rid}", headers=auth_headers, timeout=15)
    assert d2.status_code == 404


def test_glucose_requires_auth(api_base):
    assert requests.post(f"{api_base}/readings/glucose", json={"value": 5.0}, timeout=15).status_code == 401
    assert requests.get(f"{api_base}/readings/glucose", timeout=15).status_code == 401
    assert requests.delete(f"{api_base}/readings/glucose/does-not-exist", timeout=15).status_code == 401
