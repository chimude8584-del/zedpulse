# Health check — must run first
import requests


def test_root_ok(api_base):
    r = requests.get(f"{api_base}/", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"
    assert "GlucoBP" in body.get("message", "")
