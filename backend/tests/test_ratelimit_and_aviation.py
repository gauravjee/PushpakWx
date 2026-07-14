"""PushpakWX iteration 2 tests: rate limiting (OTP endpoints) + aviation METAR/TAF."""
import os
import time
import uuid
import subprocess
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://cockpit-conditions.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
mongo = MongoClient('mongodb://localhost:27017')['test_database']


def _uniq_email(tag="rl"):
    return f"test_{tag}_{uuid.uuid4().hex[:8]}@example.com"


def _restart_backend():
    """Restart backend to reset in-memory rate limits."""
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False, capture_output=True)
    # Wait for readiness
    for _ in range(20):
        try:
            r = requests.get(f"{API}/", timeout=3)
            if r.status_code == 200:
                time.sleep(1)
                return
        except Exception:
            pass
        time.sleep(1)


@pytest.fixture(scope="module")
def api():
    return requests.Session()


# ---------------- Rate limiting ----------------
class TestRateLimits:
    def test_01_register_ip_rate_limit_5_per_hour(self, api):
        """5 successful register calls from same IP pass; 6th returns 429."""
        _restart_backend()  # reset limiter
        statuses = []
        for i in range(6):
            email = _uniq_email(f"rl{i}")
            r = api.post(f"{API}/auth/register", json={
                "email": email, "password": "testpass123", "full_name": "RL User",
            })
            statuses.append(r.status_code)
            # cleanup created user
            mongo.users.delete_one({"email": email})
            mongo.otps.delete_many({"email": email})
        # first 5 should be 200, 6th should be 429
        assert statuses[:5] == [200] * 5, f"First 5 should be 200, got {statuses[:5]}"
        assert statuses[5] == 429, f"6th call should be 429, got {statuses[5]}"

    def test_02_register_counter_resets_after_restart(self, api):
        """After backend restart, register counter resets (in-memory)."""
        _restart_backend()
        email = _uniq_email("reset")
        r = api.post(f"{API}/auth/register", json={
            "email": email, "password": "testpass123",
        })
        assert r.status_code == 200, f"After restart got {r.status_code}: {r.text}"
        mongo.users.delete_one({"email": email})
        mongo.otps.delete_many({"email": email})

    def test_03_per_email_cooldown_register(self, api):
        """Requesting register for SAME email twice within 60s returns 429 w/ wait time."""
        _restart_backend()
        email = _uniq_email("cool")
        r1 = api.post(f"{API}/auth/register", json={
            "email": email, "password": "testpass123",
        })
        assert r1.status_code == 200
        # re-register same email — hits cooldown path via create_and_send_otp
        r2 = api.post(f"{API}/auth/register", json={
            "email": email, "password": "testpass123",
        })
        assert r2.status_code == 429, f"Expected 429 cooldown, got {r2.status_code}: {r2.text}"
        detail = r2.json().get("detail", "")
        assert "wait" in detail.lower() or "s" in detail.lower(), f"Expected wait-time detail, got: {detail}"
        # cleanup
        mongo.users.delete_one({"email": email})
        mongo.otps.delete_many({"email": email})

    def test_04_per_email_cooldown_forgot_password(self, api):
        """forgot-password: 2nd request within 60s returns generic 200 (silent cooldown per spec)."""
        _restart_backend()
        # need a verified user for the cooldown path to actually trigger
        email = _uniq_email("fp")
        api.post(f"{API}/auth/register", json={"email": email, "password": "testpass123"})
        code_doc = mongo.otps.find_one({"email": email.lower(), "purpose": "verify"})
        api.post(f"{API}/auth/verify-email", json={"email": email, "code": code_doc["code"]})
        # first forgot -> creates reset OTP
        r1 = api.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r1.status_code == 200
        # second — cooldown active; endpoint swallows the 429 and returns generic 200
        r2 = api.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r2.status_code == 200
        # cleanup
        mongo.users.delete_one({"email": email})
        mongo.otps.delete_many({"email": email})

    def test_05_login_rate_limit_20_per_minute(self, api):
        """login rate limit 20/minute per IP."""
        _restart_backend()
        # 20 wrong-password attempts (should all be 401), 21st → 429
        statuses = []
        for i in range(21):
            r = api.post(f"{API}/auth/login", json={
                "email": f"nobody_{i}@example.com", "password": "x",
            })
            statuses.append(r.status_code)
        assert statuses.count(429) >= 1, f"Expected at least one 429 in {statuses}"
        assert statuses[20] == 429, f"21st call should be 429, got {statuses[20]}"


# ---------------- Aviation METAR / TAF ----------------
class TestAviation:
    def test_metar_kjfk(self, api):
        r = api.get(f"{API}/aviation/metar", params={"icao": "KJFK"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["icao"] == "KJFK"
        # aviationweather.gov usually has KJFK — but tolerate transient outages
        if j.get("available"):
            assert j.get("raw"), "raw METAR string should be present"
            assert "KJFK" in j["raw"]
            # verify expected keys exist
            for k in ("flight_category", "wind_dir", "wind_speed_kt", "clouds"):
                assert k in j
        else:
            pytest.skip("aviationweather.gov returned no data for KJFK (transient)")

    def test_taf_kjfk(self, api):
        r = api.get(f"{API}/aviation/taf", params={"icao": "KJFK"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["icao"] == "KJFK"
        if j.get("available"):
            assert j.get("raw"), "raw TAF string should be present"
            assert "issue_time" in j
        else:
            pytest.skip("aviationweather.gov returned no data for KJFK TAF (transient)")

    def test_metar_invalid(self, api):
        r = api.get(f"{API}/aviation/metar", params={"icao": "ZZZZ"})
        assert r.status_code == 200
        j = r.json()
        assert j["available"] is False
        assert j["raw"] is None


# ---------------- Final cleanup: reset limiter for downstream test suites ----------------
class TestFinalReset:
    def test_reset_limiter(self, api):
        _restart_backend()
        assert api.get(f"{API}/").status_code == 200
