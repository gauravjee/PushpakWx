"""Iter11: Verify Prefs.theme_mode backend behavior + regressions."""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "https://cockpit-conditions.preview.emergentagent.com").rstrip("/")
DEMO_EMAIL = "demo@test.com"
DEMO_PASS = "demopass123"


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class TestThemeModePref:
    def test_get_prefs_has_theme_mode(self, headers):
        r = requests.get(f"{BASE_URL}/api/prefs", headers=headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "theme_mode" in d, f"theme_mode missing in prefs: {d}"
        assert d["theme_mode"] in ("dark", "light", "auto")

    def test_put_theme_light_persists(self, headers):
        payload = {"wind_unit": "kt", "altitude_unit": "ft", "temp_unit": "C", "auto_detect_flight": True, "theme_mode": "light"}
        r = requests.put(f"{BASE_URL}/api/prefs", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["theme_mode"] == "light"
        g = requests.get(f"{BASE_URL}/api/prefs", headers=headers, timeout=15).json()
        assert g["theme_mode"] == "light"

    def test_put_theme_auto_persists(self, headers):
        payload = {"wind_unit": "kt", "altitude_unit": "ft", "temp_unit": "C", "auto_detect_flight": True, "theme_mode": "auto"}
        r = requests.put(f"{BASE_URL}/api/prefs", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["theme_mode"] == "auto"

    def test_put_theme_dark_restore(self, headers):
        payload = {"wind_unit": "kt", "altitude_unit": "ft", "temp_unit": "C", "auto_detect_flight": True, "theme_mode": "dark"}
        r = requests.put(f"{BASE_URL}/api/prefs", json=payload, headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["theme_mode"] == "dark"
        g = requests.get(f"{BASE_URL}/api/prefs", headers=headers, timeout=15).json()
        assert g["theme_mode"] == "dark"


class TestRegressions:
    def test_me(self, headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_weather_dashboard(self, headers):
        r = requests.get(f"{BASE_URL}/api/weather/current?lat=40.7128&lon=-74.0060", headers=headers, timeout=25)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "temperature" in body or "temp_c" in body or "weather" in body or isinstance(body, dict)

    def test_airports_search(self, headers):
        r = requests.get(f"{BASE_URL}/api/airports/search?q=KJFK", headers=headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_logbook_list(self, headers):
        r = requests.get(f"{BASE_URL}/api/flights", headers=headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
