"""Tests for Pharmacy Price Watch (ZedPulse) — public endpoints.

Covers:
- GET /api/pharmacy/items (no auth)
- GET /api/pharmacy/items?category=... filters
- GET /api/pharmacy/items?q=... search
- GET /api/pharmacy/items?category=...&q=... combined
- GET /api/pharmacy/stockists (no auth)
"""
import requests

from .conftest import API


# ---------- /api/pharmacy/items (no filter) ----------

class TestPharmacyItemsAll:
    def test_items_public_no_auth_and_shape(self):
        r = requests.get(f"{API}/pharmacy/items", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # Expected ~34 items
        assert len(data) == 34, f"expected 34 items, got {len(data)}"

        # Validate each item's shape and price constraints
        required_fields = {
            "id", "name", "category", "subcategory", "pack",
            "price_low", "price_high", "note", "available_at",
        }
        valid_categories = {"medication", "testing", "monitor"}
        for item in data:
            missing = required_fields - set(item.keys())
            assert not missing, f"item {item.get('id')} missing {missing}"
            assert item["category"] in valid_categories, item
            assert isinstance(item["available_at"], list)
            assert len(item["available_at"]) >= 1
            assert isinstance(item["price_low"], (int, float))
            assert isinstance(item["price_high"], (int, float))
            assert item["price_low"] > 0, item
            assert item["price_high"] > 0, item
            assert item["price_low"] <= item["price_high"], item

    def test_items_unique_ids(self):
        r = requests.get(f"{API}/pharmacy/items", timeout=20)
        assert r.status_code == 200
        ids = [i["id"] for i in r.json()]
        assert len(ids) == len(set(ids)), "duplicate ids detected"


# ---------- Category filter ----------

class TestPharmacyItemsCategory:
    def test_category_testing(self):
        r = requests.get(f"{API}/pharmacy/items", params={"category": "testing"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 14, f"expected 14 testing items, got {len(data)}"
        assert all(i["category"] == "testing" for i in data)
        names_lower = " ".join(i["name"].lower() for i in data)
        # Spot-check that key testing categories appear
        for keyword in ["glucometer", "strips", "lancets", "ketone", "hba1c", "syring"]:
            assert keyword in names_lower, f"missing '{keyword}' in testing items"

    def test_category_medication(self):
        r = requests.get(f"{API}/pharmacy/items", params={"category": "medication"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 15, f"expected 15 medication items, got {len(data)}"
        assert all(i["category"] == "medication" for i in data)
        subs = {i["subcategory"] for i in data}
        assert "diabetes" in subs and "bp" in subs
        # Spot check both diabetes and BP meds exist
        names_lower = " ".join(i["name"].lower() for i in data)
        assert "metformin" in names_lower
        assert "insulin" in names_lower
        assert "amlodipine" in names_lower
        assert "enalapril" in names_lower

    def test_category_monitor(self):
        r = requests.get(f"{API}/pharmacy/items", params={"category": "monitor"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 5, f"expected 5 monitor items, got {len(data)}"
        assert all(i["category"] == "monitor" for i in data)

    def test_category_all_equals_no_filter(self):
        r_all = requests.get(f"{API}/pharmacy/items", params={"category": "all"}, timeout=20)
        r_none = requests.get(f"{API}/pharmacy/items", timeout=20)
        assert r_all.status_code == 200 and r_none.status_code == 200
        assert len(r_all.json()) == len(r_none.json()) == 34


# ---------- Search (q=) ----------

class TestPharmacyItemsSearch:
    def test_search_metformin(self):
        r = requests.get(f"{API}/pharmacy/items", params={"q": "metformin"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2, f"expected 2 metformin results, got {len(data)}: {[i['id'] for i in data]}"
        ids = {i["id"] for i in data}
        assert ids == {"metformin-500", "metformin-850"}

    def test_search_omron_case_insensitive(self):
        r = requests.get(f"{API}/pharmacy/items", params={"q": "OMRON"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 2
        assert all("omron" in i["name"].lower() for i in data)

    def test_search_combined_category_and_q(self):
        r = requests.get(
            f"{API}/pharmacy/items",
            params={"category": "testing", "q": "strips"},
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1
        for item in data:
            assert item["category"] == "testing"
            assert "strip" in item["name"].lower() or "strip" in item.get("note", "").lower()
        # Must contain glucose + ketone strip entries
        subs = {i["subcategory"] for i in data}
        assert "glucose_strips" in subs
        assert "ketone" in subs

    def test_search_no_match_returns_empty(self):
        r = requests.get(f"{API}/pharmacy/items", params={"q": "nonsense_xyz"}, timeout=20)
        assert r.status_code == 200
        assert r.json() == []


# ---------- Stockists ----------

class TestPharmacyStockists:
    def test_stockists_public_shape(self):
        r = requests.get(f"{API}/pharmacy/stockists", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 9, f"expected 9 stockists, got {len(data)}"
        for entry in data:
            assert "name" in entry and isinstance(entry["name"], str) and entry["name"].strip()
            assert "note" in entry and isinstance(entry["note"], str) and entry["note"].strip()


# ---------- Public access (no Authorization header) ----------

class TestPharmacyNoAuthRequired:
    def test_items_no_auth_header(self):
        # Use a bare session with no auth header
        s = requests.Session()
        r = s.get(f"{API}/pharmacy/items", timeout=20)
        assert r.status_code == 200
        assert "Authorization" not in s.headers

    def test_stockists_no_auth_header(self):
        s = requests.Session()
        r = s.get(f"{API}/pharmacy/stockists", timeout=20)
        assert r.status_code == 200
