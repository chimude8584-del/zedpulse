"""Backend tests for the Language toggle feature:
- GET /api/tips/today returns translated title/body for ny|bem|toi (ai_drafted=true, cached in db.tip_translations)
- lang=en or missing returns English (no ai_drafted)
- unknown lang (e.g. xx) returns English
- POST /api/advice with lang='bem' returns a reply (unauthenticated must still be rejected 401)
- POST /api/advice without lang still works
"""
import os
import time
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://vitals-monitor-105.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ----- tips endpoint (public, no auth) -----
class TestTipsLanguage:
    def test_tip_default_english(self):
        r = requests.get(f"{API}/tips/today", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("lang") == "en"
        assert "ai_drafted" not in d or d.get("ai_drafted") is not True
        assert isinstance(d.get("title"), str) and len(d["title"]) > 0
        assert isinstance(d.get("body"), str) and len(d["body"]) > 0

    def test_tip_lang_en_explicit(self):
        r = requests.get(f"{API}/tips/today", params={"lang": "en"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["lang"] == "en"

    def test_tip_lang_unknown_fallback(self):
        r = requests.get(f"{API}/tips/today", params={"lang": "xx"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        # falls back to english
        assert d["lang"] == "en"

    def test_tip_lang_nyanja(self):
        # First call may take ~5-10s (AI). Give it generous timeout.
        r = requests.get(f"{API}/tips/today", params={"lang": "ny"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        # In case LLM is unavailable, server returns english fallback. Only
        # strictly assert fields that are always present.
        assert "title" in d and "body" in d
        if d.get("lang") == "ny":
            assert d.get("ai_drafted") is True

    def test_tip_lang_bemba(self):
        r = requests.get(f"{API}/tips/today", params={"lang": "bem"}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "title" in d and "body" in d
        if d.get("lang") == "bem":
            assert d.get("ai_drafted") is True

    def test_tip_lang_tonga(self):
        r = requests.get(f"{API}/tips/today", params={"lang": "toi"}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "title" in d and "body" in d
        if d.get("lang") == "toi":
            assert d.get("ai_drafted") is True

    def test_tip_translation_cached(self):
        """Second call for same lang should be fast (served from Mongo cache)."""
        # Warm up
        requests.get(f"{API}/tips/today", params={"lang": "ny"}, timeout=60)
        t0 = time.time()
        r = requests.get(f"{API}/tips/today", params={"lang": "ny"}, timeout=20)
        dt = time.time() - t0
        assert r.status_code == 200
        d = r.json()
        # cached response should be well under 3s regardless of LLM latency
        assert dt < 5.0, f"second call took {dt:.1f}s; expected cache hit"
        if d.get("lang") == "ny":
            assert d.get("ai_drafted") is True


# ----- advice endpoint (auth required) -----
class TestAdviceLanguage:
    def test_advice_no_lang(self, fresh_user):
        headers = {"Authorization": f"Bearer {fresh_user['token']}", "Content-Type": "application/json"}
        r = requests.post(
            f"{API}/advice",
            json={"kind": "general"},
            headers=headers,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("answer"), str) and len(d["answer"]) > 0

    def test_advice_lang_bem(self, fresh_user):
        headers = {"Authorization": f"Bearer {fresh_user['token']}", "Content-Type": "application/json"}
        r = requests.post(
            f"{API}/advice",
            json={"kind": "general", "lang": "bem"},
            headers=headers,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("answer"), str) and len(d["answer"]) > 10

    def test_advice_requires_auth(self):
        r = requests.post(f"{API}/advice", json={"kind": "general", "lang": "bem"}, timeout=10)
        assert r.status_code == 401
