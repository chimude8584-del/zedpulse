"""Tests for ZedPulse newly-added endpoints:
- Emergency Contact (GET/POST/DELETE /api/profile/emergency-contact)
- Food Scanner (GET /food/library, POST /food/log, GET /food/scans, POST /food/scan)
- Clinic Finder (GET /clinics with ?city filter)
- Weekly Insights (GET /insights/weekly)
- Auth enforcement (library + clinics are public; everything else requires auth)
"""
import os
import io
import base64

import pytest
import requests

try:
    from PIL import Image
    _HAS_PIL = True
except Exception:
    _HAS_PIL = False


BASE_URL = os.environ.get(
    'EXPO_PUBLIC_BACKEND_URL',
    'https://vitals-monitor-105.preview.emergentagent.com',
).rstrip('/')
API = f"{BASE_URL}/api"


def _make_tiny_jpeg_b64() -> str:
    if _HAS_PIL:
        img = Image.new('RGB', (8, 8), color=(200, 180, 120))
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=50)
        return base64.b64encode(buf.getvalue()).decode()
    # Fallback — a hand-rolled minimal JPEG from PIL output (len ~844)
    return (
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERX"
        "RTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Nj"
        "Y2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAA"
        "AAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAk"
        "M2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKT"
        "lJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QA"
        "HwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdh"
        "cRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hp"
        "anN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk"
        "5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDaooorzzc//9k="
    )


# ---------- Emergency Contact ----------
class TestEmergencyContact:
    def test_auth_required_get(self):
        r = requests.get(f"{API}/profile/emergency-contact", timeout=20)
        assert r.status_code == 401

    def test_auth_required_post(self):
        r = requests.post(f"{API}/profile/emergency-contact",
                          json={"name": "A", "phone": "+260977123456"}, timeout=20)
        assert r.status_code == 401

    def test_auth_required_delete(self):
        r = requests.delete(f"{API}/profile/emergency-contact", timeout=20)
        assert r.status_code == 401

    def test_get_default_null_when_not_set(self, auth_headers):
        # Fresh user — ensure no prior contact
        requests.delete(f"{API}/profile/emergency-contact", headers=auth_headers, timeout=20)
        r = requests.get(f"{API}/profile/emergency-contact", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("name") is None
        assert data.get("phone") is None

    def test_post_empty_name_400(self, auth_headers):
        r = requests.post(f"{API}/profile/emergency-contact",
                          json={"name": "   ", "phone": "+260977123456"},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 400, r.text

    def test_post_short_phone_400(self, auth_headers):
        r = requests.post(f"{API}/profile/emergency-contact",
                          json={"name": "Mum", "phone": "123"},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 400, r.text

    def test_post_valid_zambian_phone_and_upsert(self, auth_headers):
        # First set
        r1 = requests.post(f"{API}/profile/emergency-contact",
                           json={"name": "Mum", "phone": "+260977000111"},
                           headers=auth_headers, timeout=20)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["name"] == "Mum"
        # phone should contain digits (normalize_phone strips non-digits but keeps leading +)
        assert "260977000111" in d1["phone"].replace("+", "")

        # GET returns stored values
        rg = requests.get(f"{API}/profile/emergency-contact", headers=auth_headers, timeout=20)
        assert rg.status_code == 200
        dg = rg.json()
        assert dg["name"] == "Mum"
        assert "260977000111" in dg["phone"].replace("+", "")

        # Upsert — replace with new values
        r2 = requests.post(f"{API}/profile/emergency-contact",
                           json={"name": "Dad", "phone": "+260966222333"},
                           headers=auth_headers, timeout=20)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["name"] == "Dad"
        assert "260966222333" in d2["phone"].replace("+", "")

        # Confirm only one record (upsert replaced) via GET
        rg2 = requests.get(f"{API}/profile/emergency-contact", headers=auth_headers, timeout=20)
        assert rg2.json()["name"] == "Dad"

    def test_delete_removes_contact(self, auth_headers):
        # Ensure one exists first
        requests.post(f"{API}/profile/emergency-contact",
                      json={"name": "Sister", "phone": "+260955123456"},
                      headers=auth_headers, timeout=20)
        rd = requests.delete(f"{API}/profile/emergency-contact", headers=auth_headers, timeout=20)
        assert rd.status_code == 200
        rg = requests.get(f"{API}/profile/emergency-contact", headers=auth_headers, timeout=20)
        assert rg.status_code == 200
        data = rg.json()
        assert data.get("name") is None
        assert data.get("phone") is None


# ---------- Food Library (public) ----------
class TestFoodLibrary:
    def test_library_no_auth_required(self):
        r = requests.get(f"{API}/food/library", timeout=20)
        assert r.status_code == 200, r.text

    def test_library_shape_and_count(self):
        r = requests.get(f"{API}/food/library", timeout=20)
        items = r.json()
        assert isinstance(items, list)
        assert len(items) == 30, f"expected 30 foods, got {len(items)}"
        required_keys = {"name", "portion", "carbs_g", "gi", "tip"}
        for it in items:
            missing = required_keys - set(it.keys())
            assert not missing, f"item missing keys {missing}: {it}"
            assert isinstance(it["name"], str) and it["name"]
            assert isinstance(it["carbs_g"], (int, float))


# ---------- Food Log ----------
class TestFoodLog:
    def test_auth_required(self):
        r = requests.post(f"{API}/food/log", json={"name": "Nshima", "carbs_g": 40}, timeout=20)
        assert r.status_code == 401

    def test_log_saves_entry(self, auth_headers):
        r = requests.post(f"{API}/food/log",
                          json={"name": "TEST_Nshima", "carbs_g": 42.5, "portion": "1 fist"},
                          headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("id")
        assert d["name"] == "TEST_Nshima"
        assert d["carbs_g"] == 42.5
        assert d["portion"] == "1 fist"
        assert "logged_at" in d
        assert "_id" not in d


# ---------- Food Scans ----------
class TestFoodScans:
    def test_auth_required_list(self):
        r = requests.get(f"{API}/food/scans", timeout=20)
        assert r.status_code == 401

    def test_auth_required_scan(self):
        r = requests.post(f"{API}/food/scan", json={"image_base64": "x" * 200}, timeout=20)
        assert r.status_code == 401

    def test_list_scans_empty_for_fresh_user(self, auth_headers):
        r = requests.get(f"{API}/food/scans", headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_scan_rejects_short_base64(self, auth_headers):
        r = requests.post(f"{API}/food/scan",
                          json={"image_base64": "shortdata"},
                          headers=auth_headers, timeout=30)
        assert r.status_code == 400, r.text

    def test_scan_rejects_missing_base64(self, auth_headers):
        r = requests.post(f"{API}/food/scan",
                          json={"image_base64": ""},
                          headers=auth_headers, timeout=30)
        assert r.status_code == 400, r.text

    def test_scan_accepts_tiny_jpeg(self, auth_headers):
        """Full LLM call — contract compliance only, not AI output quality."""
        b64 = _make_tiny_jpeg_b64()
        assert len(b64) > 100
        r = requests.post(f"{API}/food/scan",
                          json={"image_base64": b64, "content_type": "image/jpeg"},
                          headers=auth_headers, timeout=90)
        # KNOWN BUG: backend uses FileContent(content_type='image/jpeg', ...) which
        # litellm/OpenAI treats as application/pdf -> 502. See iteration report RCA.
        # Expected behaviour per spec: 200 with foods/total_carbs_g/… contract.
        assert r.status_code == 200, (
            f"food/scan returned {r.status_code}. "
            f"Likely cause: use ImageContent(image_base64=...) instead of FileContent. "
            f"Body: {r.text[:400]}"
        )
        d = r.json()
        # Contract: these keys must exist (values may be None/empty for non-food image)
        for k in ("foods", "total_carbs_g", "glycemic_load", "diabetes_tips", "zambia_note"):
            assert k in d, f"missing {k} in {d.keys()}"
        assert isinstance(d["foods"], list)
        assert "_id" not in d
        # Should now show up in list
        rl = requests.get(f"{API}/food/scans", headers=auth_headers, timeout=20)
        assert rl.status_code == 200
        assert len(rl.json()) >= 1


# ---------- Clinics (public) ----------
class TestClinics:
    def test_clinics_no_auth_required(self):
        r = requests.get(f"{API}/clinics", timeout=20)
        assert r.status_code == 200

    def test_clinics_all_shape_and_count(self):
        r = requests.get(f"{API}/clinics", timeout=20)
        items = r.json()
        assert isinstance(items, list)
        assert 35 <= len(items) <= 50, f"expected ~40 clinics, got {len(items)}"
        required = {"name", "city", "type", "lat", "lng", "phone"}
        for c in items:
            missing = required - set(c.keys())
            assert not missing, f"clinic missing keys {missing}: {c}"
            assert isinstance(c["lat"], (int, float))
            assert isinstance(c["lng"], (int, float))
            assert str(c["phone"]).startswith("+260")

    def test_clinics_lusaka_filter(self):
        r = requests.get(f"{API}/clinics", params={"city": "Lusaka"}, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert 15 <= len(items) <= 20, f"expected 15–20 Lusaka clinics, got {len(items)}"
        assert all(c["city"] == "Lusaka" for c in items)

    def test_clinics_ndola_filter(self):
        r = requests.get(f"{API}/clinics", params={"city": "Ndola"}, timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 2
        assert all(c["city"] == "Ndola" for c in items)

    def test_clinics_city_case_insensitive(self):
        r = requests.get(f"{API}/clinics", params={"city": "lusaka"}, timeout=20)
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_clinics_unknown_city_returns_empty(self):
        r = requests.get(f"{API}/clinics", params={"city": "Nowhere_" + "zzz"}, timeout=20)
        assert r.status_code == 200
        assert r.json() == []


# ---------- Weekly Insights ----------
class TestWeeklyInsights:
    def test_auth_required(self):
        r = requests.get(f"{API}/insights/weekly", timeout=20)
        assert r.status_code == 401

    def test_shape_for_fresh_user(self, auth_headers):
        r = requests.get(f"{API}/insights/weekly", headers=auth_headers, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("week_start", "week_end", "glucose", "bp", "medications", "tip"):
            assert k in d, f"missing {k} in weekly insights"
        # Nested shape
        for k in ("count", "avg_mmol_l", "in_range_pct"):
            assert k in d["glucose"]
        for k in ("count", "avg_systolic", "avg_diastolic"):
            assert k in d["bp"]
        for k in ("logged", "expected", "adherence_pct"):
            assert k in d["medications"]
        assert isinstance(d["glucose"]["count"], int)
        assert isinstance(d["bp"]["count"], int)
        assert isinstance(d["medications"]["logged"], int)
        assert isinstance(d["tip"], str)  # may be ""

    def test_shape_after_readings(self, auth_headers):
        # Seed one glucose + one bp
        requests.post(f"{API}/readings/glucose",
                      json={"value": 6.4, "context": "fasting", "note": "TEST_wk"},
                      headers=auth_headers, timeout=20)
        requests.post(f"{API}/readings/bp",
                      json={"systolic": 128, "diastolic": 82, "note": "TEST_wk"},
                      headers=auth_headers, timeout=20)
        r = requests.get(f"{API}/insights/weekly", headers=auth_headers, timeout=120)
        assert r.status_code == 200
        d = r.json()
        assert d["glucose"]["count"] >= 1
        assert d["bp"]["count"] >= 1
        assert d["glucose"]["avg_mmol_l"] is not None
        assert d["bp"]["avg_systolic"] is not None
        assert d["bp"]["avg_diastolic"] is not None
