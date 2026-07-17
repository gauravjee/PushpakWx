"""Iteration 8: Verify weather cache + fallback (wttr.in) fix for 'Weather unavailable'.

Bug context: Open-Meteo daily quota exhausted -> 429 -> 502 to client -> dashboard
rendered 'Weather unavailable'. Fix: MongoDB TTL cache in `wx_cache` + wttr.in fallback
+ same for METAR/TAF.
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    'EXPO_PUBLIC_BACKEND_URL',
    'https://cockpit-conditions.preview.emergentagent.com',
).rstrip('/')
API = f"{BASE_URL}/api"

mongo = MongoClient('mongodb://localhost:27017')['test_database']


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ----- Weather forecast: cache + fallback -----

class TestWeatherForecast:
    JFK_LAT = 40.6413
    JFK_LON = -73.7781

    def test_forecast_200_with_provider(self, api_client):
        # ensure no cache so we actually hit an upstream provider
        mongo.wx_cache.delete_one({"_id": f"forecast:{round(self.JFK_LAT, 2)}:{round(self.JFK_LON, 2)}"})
        r = api_client.get(f"{API}/weather/forecast", params={"lat": self.JFK_LAT, "lon": self.JFK_LON}, timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
        data = r.json()
        # required current fields
        assert "current" in data
        cur = data["current"]
        for k in ("temperature_2m", "wind_speed_10m", "wind_direction_10m", "cloud_cover"):
            assert k in cur and cur[k] is not None, f"missing/None current.{k}"
        # hourly time list present with entries
        assert "hourly" in data and "time" in data["hourly"]
        assert isinstance(data["hourly"]["time"], list) and len(data["hourly"]["time"]) > 0
        # provider label
        assert data.get("_provider") in ("open-meteo", "wttr.in"), f"unexpected provider {data.get('_provider')}"
        # cache label should be present, hit=False on this first call
        assert "_cache" in data and data["_cache"]["hit"] is False

    def test_forecast_cache_hit_on_second_call(self, api_client):
        # First call to populate
        r1 = api_client.get(f"{API}/weather/forecast", params={"lat": self.JFK_LAT, "lon": self.JFK_LON}, timeout=30)
        assert r1.status_code == 200
        # Second call within TTL should be a cache hit
        r2 = api_client.get(f"{API}/weather/forecast", params={"lat": self.JFK_LAT, "lon": self.JFK_LON}, timeout=15)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["_cache"]["hit"] is True, f"expected cache hit, got {d2['_cache']}"
        assert d2["_cache"]["stale"] is False
        # payload should be same shape/values
        assert d2["current"]["temperature_2m"] == r1.json()["current"]["temperature_2m"]

    def test_forecast_different_location(self, api_client):
        # LHR — should also work
        r = api_client.get(f"{API}/weather/forecast", params={"lat": 51.4700, "lon": -0.4543}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "current" in d and "hourly" in d


# ----- METAR / TAF -----

class TestAviationMetarTaf:
    def test_metar_kjfk(self, api_client):
        mongo.wx_cache.delete_one({"_id": "metar:KJFK"})
        r = api_client.get(f"{API}/aviation/metar", params={"icao": "KJFK"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["icao"] == "KJFK"
        # Provider might not have data at odd times, but the shape must hold
        assert "available" in d
        if d["available"]:
            assert isinstance(d.get("raw"), str) and "KJFK" in d["raw"]
        assert "_cache" in d and d["_cache"]["hit"] is False

    def test_metar_cache_hit(self, api_client):
        api_client.get(f"{API}/aviation/metar", params={"icao": "KJFK"}, timeout=30)
        r2 = api_client.get(f"{API}/aviation/metar", params={"icao": "KJFK"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["_cache"]["hit"] is True

    def test_taf_kjfk(self, api_client):
        mongo.wx_cache.delete_one({"_id": "taf:KJFK"})
        r = api_client.get(f"{API}/aviation/taf", params={"icao": "KJFK"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["icao"] == "KJFK"
        assert "available" in d
        assert "_cache" in d and d["_cache"]["hit"] is False

    def test_taf_cache_hit(self, api_client):
        api_client.get(f"{API}/aviation/taf", params={"icao": "KJFK"}, timeout=30)
        r2 = api_client.get(f"{API}/aviation/taf", params={"icao": "KJFK"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["_cache"]["hit"] is True


# ----- Regression: auth + logbook/prefs/favorites -----

def _uniq_email() -> str:
    return f"test_wx8_{uuid.uuid4().hex[:8]}@example.com"


def _register_and_verify(api_client, email: str, password: str = "testpass123") -> str:
    r = api_client.post(f"{API}/auth/register", json={"email": email, "password": password, "full_name": "T8"})
    assert r.status_code == 200, r.text
    doc = mongo.otps.find_one({"email": email, "purpose": "verify"})
    assert doc, "OTP not created"
    code = doc["code"]
    r = api_client.post(f"{API}/auth/verify-email", json={"email": email, "code": code})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return token


class TestRegression:
    def test_auth_flow_and_prefs_and_favorites(self, api_client):
        email = _uniq_email()
        token = _register_and_verify(api_client, email)
        h = {"Authorization": f"Bearer {token}"}
        # me
        r = api_client.get(f"{API}/auth/me", headers=h)
        assert r.status_code == 200 and r.json()["email"] == email
        # prefs default
        r = api_client.get(f"{API}/prefs", headers=h)
        assert r.status_code == 200
        prefs = r.json()
        assert prefs["auto_detect_flight"] is True
        # update prefs
        prefs["wind_unit"] = "kmh"
        r = api_client.put(f"{API}/prefs", headers=h, json=prefs)
        assert r.status_code == 200 and r.json()["wind_unit"] == "kmh"
        # add favorite
        fav = {"icao": "KJFK", "iata": "JFK", "name": "John F Kennedy Intl", "city": "New York",
               "country": "US", "lat": 40.6413, "lon": -73.7781, "elevation_ft": 13}
        r = api_client.post(f"{API}/favorites", headers=h, json=fav)
        assert r.status_code == 200
        fav_id = r.json()["id"]
        r = api_client.get(f"{API}/favorites", headers=h)
        assert r.status_code == 200 and any(f["id"] == fav_id for f in r.json())
        # cleanup
        api_client.delete(f"{API}/favorites/{fav_id}", headers=h)
        api_client.post(f"{API}/auth/delete-account", headers=h, json={"password": "testpass123"})

    def test_flights_create_list_export(self, api_client):
        email = _uniq_email()
        token = _register_and_verify(api_client, email)
        h = {"Authorization": f"Bearer {token}"}
        # tiny flight: JFK area
        t0 = int(time.time() * 1000)
        samples = [
            {"t": t0, "lat": 40.6413, "lon": -73.7781, "alt_ft": 100, "speed_kt": 5, "heading": 90},
            {"t": t0 + 60_000, "lat": 40.6500, "lon": -73.7600, "alt_ft": 2000, "speed_kt": 120, "heading": 90},
            {"t": t0 + 120_000, "lat": 40.6600, "lon": -73.7400, "alt_ft": 3000, "speed_kt": 150, "heading": 90},
        ]
        payload = {
            "started_at": "2026-01-01T00:00:00Z",
            "ended_at": "2026-01-01T00:02:00Z",
            "samples": samples,
            "note": "TEST_flight_iter8",
        }
        r = api_client.post(f"{API}/flights", headers=h, json=payload)
        assert r.status_code == 200, r.text
        fdoc = r.json()
        assert fdoc["distance_nm"] > 0
        fid = fdoc["id"]
        # list
        r = api_client.get(f"{API}/flights", headers=h)
        assert r.status_code == 200 and any(f["id"] == fid for f in r.json())
        # export csv
        r = api_client.get(f"{API}/flights/{fid}/export", headers=h, params={"format": "csv"})
        assert r.status_code == 200 and "timestamp_iso" in r.json()["content"]
        # export geojson
        r = api_client.get(f"{API}/flights/{fid}/export", headers=h, params={"format": "geojson"})
        assert r.status_code == 200 and "FeatureCollection" in r.json()["content"]
        # cleanup
        api_client.delete(f"{API}/flights/{fid}", headers=h)
        api_client.post(f"{API}/auth/delete-account", headers=h, json={"password": "testpass123"})
