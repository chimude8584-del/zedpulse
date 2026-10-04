# AI advice endpoint — uses Emergent LLM key, response may be slow
import requests


def test_advice_diet_no_question(api_base, auth_headers):
    r = requests.post(f"{api_base}/advice", headers=auth_headers,
                      json={"kind": "diet"}, timeout=90)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "answer" in body and isinstance(body["answer"], str) and len(body["answer"].strip()) > 0
    assert "id" in body


def test_advice_with_question(api_base, auth_headers):
    r = requests.post(f"{api_base}/advice", headers=auth_headers,
                      json={"question": "what should I eat for lunch?"}, timeout=90)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body.get("answer"), str)
    assert len(body["answer"].strip()) > 10


def test_advice_requires_auth(api_base):
    r = requests.post(f"{api_base}/advice", json={"kind": "diet"}, timeout=15)
    assert r.status_code == 401
