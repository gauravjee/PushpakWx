"""PilotWX backend tests: auth (register/verify/login/forgot/reset/delete),
airports, geocode, weather, favorites, prefs."""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://cockpit-conditions.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

# Mongo direct access (to read OTPs)
mongo = MongoClient('mongodb://localhost:27017')['test_database']


def _uniq_email(tag: str = "user") -> str:
    return f"test_{tag}_{uuid.uuid4().hex[:8]}@example.com"


def _get_otp(email: str, purpose: str) -> str:
    doc = mongo.otps.find_one({"email": email.lower(), "purpose": purpose})
    assert doc, f"No OTP found for {email} purpose={purpose}"
    return doc["code"]


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Health ----------------
class TestHealth:
    def test_root(self, api):
        r = api.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------------- Auth flow ----------------
class TestAuthFlow:
    email = _uniq_email("auth")
    password = "testpass123"
    new_password = "newpass456"
    token = None
    user_id = None

    def test_01_register(self, api):
        r = api.post(f"{API}/auth/register", json={
            "email": self.__class__.email,
            "password": self.__class__.password,
            "full_name": "Test Pilot",
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("requires_verification") is True
        assert j.get("email") == self.__class__.email.lower()
        # OTP exists
        otp_doc = mongo.otps.find_one({"email": self.__class__.email.lower(), "purpose": "verify"})
        assert otp_doc, "OTP for verify should exist after register"
        # User is unverified
        u = mongo.users.find_one({"email": self.__class__.email.lower()})
        assert u and u.get("email_verified") is False

    def test_02_login_blocked_before_verify(self, api):
        r = api.post(f"{API}/auth/login", json={
            "email": self.__class__.email, "password": self.__class__.password,
        })
        assert r.status_code == 403, r.text

    def test_03_verify_invalid_code(self, api):
        r = api.post(f"{API}/auth/verify-email", json={
            "email": self.__class__.email, "code": "000000",
        })
        assert r.status_code == 400

    def test_04_resend_verification(self, api):
        r = api.post(f"{API}/auth/resend-verification", json={"email": self.__class__.email})
        assert r.status_code == 200
        otp_doc = mongo.otps.find_one({"email": self.__class__.email.lower(), "purpose": "verify"})
        assert otp_doc

    def test_05_verify_email_ok(self, api):
        code = _get_otp(self.__class__.email, "verify")
        r = api.post(f"{API}/auth/verify-email", json={
            "email": self.__class__.email, "code": code,
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert "access_token" in j and j.get("user", {}).get("email_verified") is True
        self.__class__.token = j["access_token"]
        self.__class__.user_id = j["user"]["id"]
        u = mongo.users.find_one({"email": self.__class__.email.lower()})
        assert u.get("email_verified") is True

    def test_06_login_after_verify(self, api):
        r = api.post(f"{API}/auth/login", json={
            "email": self.__class__.email, "password": self.__class__.password,
        })
        assert r.status_code == 200
        self.__class__.token = r.json()["access_token"]

    def test_07_me_endpoint(self, api):
        r = api.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {self.__class__.token}"})
        assert r.status_code == 200
        assert r.json()["email"] == self.__class__.email.lower()

    def test_08_forgot_password_generic(self, api):
        # unknown email should still return generic 200
        r = api.post(f"{API}/auth/forgot-password", json={"email": "nobody.test@example.com"})
        assert r.status_code == 200
        # known verified email: OTP should be created
        r2 = api.post(f"{API}/auth/forgot-password", json={"email": self.__class__.email})
        assert r2.status_code == 200
        otp_doc = mongo.otps.find_one({"email": self.__class__.email.lower(), "purpose": "reset"})
        assert otp_doc, "Reset OTP should exist for known verified email"

    def test_09_reset_password(self, api):
        code = _get_otp(self.__class__.email, "reset")
        r = api.post(f"{API}/auth/reset-password", json={
            "email": self.__class__.email, "code": code, "new_password": self.__class__.new_password,
        })
        assert r.status_code == 200
        # login with new password works
        r2 = api.post(f"{API}/auth/login", json={
            "email": self.__class__.email, "password": self.__class__.new_password,
        })
        assert r2.status_code == 200
        self.__class__.token = r2.json()["access_token"]

    def test_10_reset_invalid_code(self, api):
        r = api.post(f"{API}/auth/reset-password", json={
            "email": self.__class__.email, "code": "999999", "new_password": "another123",
        })
        assert r.status_code == 400

    def test_11_delete_account_wrong_password(self, api):
        r = api.post(f"{API}/auth/delete-account",
                     json={"password": "WRONG"},
                     headers={"Authorization": f"Bearer {self.__class__.token}"})
        assert r.status_code == 401

    def test_12_delete_account_success(self, api):
        r = api.post(f"{API}/auth/delete-account",
                     json={"password": self.__class__.new_password},
                     headers={"Authorization": f"Bearer {self.__class__.token}"})
        assert r.status_code == 200
        # verify all data gone
        assert mongo.users.find_one({"email": self.__class__.email.lower()}) is None
        assert mongo.favorites.count_documents({"user_id": self.__class__.user_id}) == 0
        assert mongo.prefs.count_documents({"user_id": self.__class__.user_id}) == 0
        assert mongo.otps.count_documents({"email": self.__class__.email.lower()}) == 0

    def test_13_login_after_delete_fails(self, api):
        r = api.post(f"{API}/auth/login", json={
            "email": self.__class__.email, "password": self.__class__.new_password,
        })
        assert r.status_code == 401


# ---------------- Airports / geocode / weather ----------------
class TestAirportsAndWeather:
    def test_airport_search_jfk(self, api):
        r = api.get(f"{API}/airports/search", params={"q": "JFK"})
        assert r.status_code == 200
        results = r.json().get("results", [])
        icaos = [a["icao"] for a in results]
        assert "KJFK" in icaos

    def test_airport_get_by_icao(self, api):
        r = api.get(f"{API}/airports/KJFK")
        assert r.status_code == 200
        assert r.json()["icao"] == "KJFK"

    def test_airport_not_found(self, api):
        r = api.get(f"{API}/airports/ZZZZ")
        assert r.status_code == 404

    def test_geocode_paris(self, api):
        r = api.get(f"{API}/geocode", params={"q": "Paris"})
        assert r.status_code == 200
        assert isinstance(r.json().get("results"), list)
        assert len(r.json()["results"]) > 0

    def test_weather_forecast(self, api):
        r = api.get(f"{API}/weather/forecast", params={"lat": 40.64, "lon": -73.78})
        assert r.status_code == 200, r.text
        j = r.json()
        assert "current" in j and "hourly" in j
        assert "wind_speed_10m" in j["current"]


# ---------------- Favorites & Prefs (auth) ----------------
class TestFavoritesAndPrefs:
    email = _uniq_email("fav")
    password = "testpass123"
    token = None
    user_id = None
    fav_id = None

    def test_01_signup_and_verify(self, api):
        api.post(f"{API}/auth/register", json={
            "email": self.__class__.email, "password": self.__class__.password, "full_name": "Fav User",
        })
        code = _get_otp(self.__class__.email, "verify")
        r = api.post(f"{API}/auth/verify-email", json={
            "email": self.__class__.email, "code": code,
        })
        assert r.status_code == 200
        self.__class__.token = r.json()["access_token"]
        self.__class__.user_id = r.json()["user"]["id"]

    def _hdr(self):
        return {"Authorization": f"Bearer {self.__class__.token}"}

    def test_02_prefs_default(self, api):
        r = api.get(f"{API}/prefs", headers=self._hdr())
        assert r.status_code == 200
        j = r.json()
        assert j["wind_unit"] == "kt"

    def test_03_prefs_update(self, api):
        r = api.put(f"{API}/prefs", json={"wind_unit": "kmh", "altitude_unit": "m", "temp_unit": "F"},
                    headers=self._hdr())
        assert r.status_code == 200
        # verify persistence via GET
        r2 = api.get(f"{API}/prefs", headers=self._hdr())
        assert r2.json()["wind_unit"] == "kmh"

    def test_04_favorites_add_list_delete(self, api):
        r = api.post(f"{API}/favorites", json={
            "icao": "KJFK", "iata": "JFK", "name": "John F Kennedy Intl",
            "city": "New York", "country": "US", "lat": 40.6413, "lon": -73.7781, "elevation_ft": 13,
        }, headers=self._hdr())
        assert r.status_code == 200, r.text
        self.__class__.fav_id = r.json()["id"]

        r2 = api.get(f"{API}/favorites", headers=self._hdr())
        assert r2.status_code == 200
        assert any(f["id"] == self.__class__.fav_id for f in r2.json())

        r3 = api.delete(f"{API}/favorites/{self.__class__.fav_id}", headers=self._hdr())
        assert r3.status_code == 200

        r4 = api.get(f"{API}/favorites", headers=self._hdr())
        assert not any(f["id"] == self.__class__.fav_id for f in r4.json())

    def test_05_unauth_favorites(self, api):
        r = api.get(f"{API}/favorites")
        assert r.status_code == 401

    def test_99_cleanup(self, api):
        # delete this test account
        api.post(f"{API}/auth/delete-account",
                 json={"password": self.__class__.password},
                 headers=self._hdr())
