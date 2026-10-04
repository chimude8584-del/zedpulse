# Stats summary + report
import requests


def test_summary_shape(api_base, auth_headers):
    # Make sure we have at least one reading each
    requests.post(f"{api_base}/readings/glucose", headers=auth_headers,
                  json={"value": 6.0, "context": "fasting"}, timeout=15)
    requests.post(f"{api_base}/readings/bp", headers=auth_headers,
                  json={"systolic": 118, "diastolic": 78}, timeout=15)

    r = requests.get(f"{api_base}/stats/summary", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "glucose" in body and "bp" in body

    g = body["glucose"]
    assert set(["latest", "avg_mmol_l", "in_range_pct", "count"]).issubset(g.keys())
    assert g["count"] >= 1
    assert isinstance(g["avg_mmol_l"], (int, float))

    b = body["bp"]
    assert set(["latest", "avg_systolic", "avg_diastolic", "count"]).issubset(b.keys())
    assert b["count"] >= 1
    assert isinstance(b["avg_systolic"], (int, float))


def test_summary_requires_auth(api_base):
    assert requests.get(f"{api_base}/stats/summary", timeout=15).status_code == 401


def test_report_text(api_base, auth_headers):
    r = requests.get(f"{api_base}/report", headers=auth_headers, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "text" in body and "generated_at" in body
    text = body["text"]
    assert "HEALTH REPORT" in text
    assert "Blood Glucose" in text
    assert "Blood Pressure" in text


def test_report_requires_auth(api_base):
    assert requests.get(f"{api_base}/report", timeout=15).status_code == 401
