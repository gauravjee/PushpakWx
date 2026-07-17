"""Iter6: Verify Prefs.auto_detect_flight backend behavior."""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://cockpit-conditions.preview.emergentagent.com").rstrip("/")
DEMO_EMAIL = "demo@test.com"
DEMO_PASS = "demopass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestPrefsAutoDetect:
    def test_get_prefs_has_field(self, headers):
        r = requests.get(f"{BASE_URL}/api/prefs", headers=headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "auto_detect_flight" in d
        assert isinstance(d["auto_detect_flight"], bool)

    def test_put_prefs_false(self, headers):
        payload = {"wind_unit": "kt", "altitude_unit": "ft", "temp_unit": "C", "auto_detect_flight": False}
        r = requests.put(f"{BASE_URL}/api/prefs", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["auto_detect_flight"] is False
        # Verify persistence
        g = requests.get(f"{BASE_URL}/api/prefs", headers=headers, timeout=15).json()
        assert g["auto_detect_flight"] is False

    def test_put_prefs_true(self, headers):
        payload = {"wind_unit": "kt", "altitude_unit": "ft", "temp_unit": "C", "auto_detect_flight": True}
        r = requests.put(f"{BASE_URL}/api/prefs", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["auto_detect_flight"] is True
        g = requests.get(f"{BASE_URL}/api/prefs", headers=headers, timeout=15).json()
        assert g["auto_detect_flight"] is True

    def test_missing_field_defaults_true(self, headers):
        """Simulate legacy user whose prefs doc lacks auto_detect_flight."""
        c = MongoClient("mongodb://localhost:27017")["test_database"]
        user = c.users.find_one({"email": DEMO_EMAIL})
        assert user is not None
        # remove field from existing prefs
        c.prefs.update_one({"user_id": user["id"]}, {"$unset": {"auto_detect_flight": ""}})
        r = requests.get(f"{BASE_URL}/api/prefs", headers=headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        # Pydantic Prefs model should coerce missing field to default True
        assert d.get("auto_detect_flight") is True, f"Expected default True, got {d}"

    def test_regression_login_still_works(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=15)
        assert r.status_code == 200
        assert "access_token" in r.json()
