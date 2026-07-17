"""PushpakWX logbook feature tests: flights CRUD + exports + isolation."""
import os
import json
import uuid
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://cockpit-conditions.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
mongo = MongoClient('mongodb://localhost:27017')['test_database']

DEMO_EMAIL = "demo@test.com"
DEMO_PASSWORD = "demopass123"


def _login_token(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _register_and_verify(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "full_name": "T"})
    assert r.status_code == 200, r.text
    doc = mongo.otps.find_one({"email": email.lower(), "purpose": "verify"})
    assert doc, "otp missing"
    r2 = requests.post(f"{API}/auth/verify-email", json={"email": email, "code": doc["code"]})
    assert r2.status_code == 200, r2.text
    return r2.json()["access_token"]


def _make_samples():
    # KJFK (40.6413,-73.7781) -> KHPN (41.067,-73.7076), 10 samples, 1s apart, climbing then descending
    t0 = int(datetime.now(timezone.utc).timestamp() * 1000)
    lat1, lon1 = 40.6413, -73.7781
    lat2, lon2 = 41.067, -73.7076
    n = 10
    out = []
    for i in range(n):
        f = i / (n - 1)
        lat = lat1 + (lat2 - lat1) * f
        lon = lon1 + (lon2 - lon1) * f
        alt = 500 + 5000 * (1 - abs(2 * f - 1))  # triangular altitude profile, peak ~5500ft
        spd = 90 + 30 * (1 - abs(2 * f - 1))
        out.append({
            "t": t0 + i * 60000,  # 1 minute apart
            "lat": lat,
            "lon": lon,
            "alt_ft": alt,
            "speed_kt": spd,
            "heading": 20.0,
        })
    return out, t0


@pytest.fixture(scope="module")
def token():
    # ensure demo user exists
    if not mongo.users.find_one({"email": DEMO_EMAIL}):
        _register_and_verify(DEMO_EMAIL, DEMO_PASSWORD)
    return _login_token(DEMO_EMAIL, DEMO_PASSWORD)


@pytest.fixture(scope="module")
def user2_token():
    email = f"test_flt2_{uuid.uuid4().hex[:8]}@example.com"
    tok = _register_and_verify(email, "pw12345678")
    yield tok
    # cleanup
    requests.post(f"{API}/auth/delete-account", json={"password": "pw12345678"},
                  headers={"Authorization": f"Bearer {tok}"})


class TestFlightsCRUD:
    created_id = None

    def test_01_create_flight_valid(self, token):
        samples, t0 = _make_samples()
        payload = {
            "started_at": datetime.fromtimestamp(samples[0]["t"] / 1000, tz=timezone.utc).isoformat(),
            "ended_at": datetime.fromtimestamp(samples[-1]["t"] / 1000, tz=timezone.utc).isoformat(),
            "samples": samples,
            "note": "TEST_flight KJFK->KHPN",
        }
        r = requests.post(f"{API}/flights", json=payload,
                          headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert "id" in j
        TestFlightsCRUD.created_id = j["id"]
        assert j["dep_icao"] == "KJFK", f"expected KJFK dep, got {j.get('dep_icao')}"
        assert j["arr_icao"] == "KHPN", f"expected KHPN arr, got {j.get('arr_icao')}"
        assert j["distance_nm"] > 20 and j["distance_nm"] < 40, f"unexpected distance {j['distance_nm']}"
        assert j["duration_s"] == 9 * 60, f"duration should be 540s, got {j['duration_s']}"
        assert j["max_alt_ft"] >= 4500  # discrete triangle peaks ~4944
        assert j["max_speed_kt"] >= 100
        assert j.get("note") == "TEST_flight KJFK->KHPN"
        assert "_id" not in j

    def test_02_create_flight_too_few_samples(self, token):
        r = requests.post(f"{API}/flights", json={
            "started_at": "2026-01-01T00:00:00Z",
            "ended_at": "2026-01-01T00:00:01Z",
            "samples": [{"t": 1, "lat": 40.6, "lon": -73.8, "alt_ft": 100, "speed_kt": 90, "heading": 10}],
        }, headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 400, r.text

    def test_03_list_flights_no_samples(self, token):
        r = requests.get(f"{API}/flights", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        # find our created one, ensure samples excluded
        target = next((x for x in arr if x["id"] == TestFlightsCRUD.created_id), None)
        assert target is not None
        assert "samples" not in target
        assert target["dep_icao"] == "KJFK" and target["arr_icao"] == "KHPN"

    def test_04_get_flight_detail_has_samples(self, token):
        r = requests.get(f"{API}/flights/{TestFlightsCRUD.created_id}",
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("samples"), list) and len(j["samples"]) == 10
        assert "_id" not in j

    def test_05_export_csv(self, token):
        r = requests.get(f"{API}/flights/{TestFlightsCRUD.created_id}/export",
                         params={"format": "csv"},
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        j = r.json()
        assert j["content_type"] == "text/csv"
        assert j["filename"].endswith(".csv")
        assert j["content"].startswith("timestamp_iso,lat,lon,alt_ft,speed_kt,heading_deg")
        lines = j["content"].split("\n")
        assert len(lines) == 11  # header + 10 rows

    def test_06_export_geojson(self, token):
        r = requests.get(f"{API}/flights/{TestFlightsCRUD.created_id}/export",
                         params={"format": "geojson"},
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        j = r.json()
        assert j["content_type"] == "application/geo+json"
        geo = json.loads(j["content"])
        assert geo["type"] == "FeatureCollection"
        assert len(geo["features"]) == 1
        feat = geo["features"][0]
        assert feat["geometry"]["type"] == "LineString"
        assert len(feat["geometry"]["coordinates"]) == 10
        assert feat["properties"]["dep_icao"] == "KJFK"
        assert feat["properties"]["arr_icao"] == "KHPN"

    def test_07_auth_required_create(self):
        r = requests.post(f"{API}/flights", json={
            "started_at": "2026-01-01T00:00:00Z", "ended_at": "2026-01-01T00:01:00Z",
            "samples": [{"t": 1, "lat": 40.6, "lon": -73.8}, {"t": 2, "lat": 40.7, "lon": -73.7}],
        })
        assert r.status_code == 401

    def test_08_auth_required_list(self):
        r = requests.get(f"{API}/flights")
        assert r.status_code == 401

    def test_09_auth_required_detail(self):
        r = requests.get(f"{API}/flights/{TestFlightsCRUD.created_id}")
        assert r.status_code == 401

    def test_10_auth_required_export(self):
        r = requests.get(f"{API}/flights/{TestFlightsCRUD.created_id}/export", params={"format": "csv"})
        assert r.status_code == 401

    def test_11_cross_user_isolation(self, user2_token):
        # user2 tries to GET user1's flight -> 404
        r = requests.get(f"{API}/flights/{TestFlightsCRUD.created_id}",
                         headers={"Authorization": f"Bearer {user2_token}"})
        assert r.status_code == 404
        # user2 list is empty (or does not contain flight)
        r2 = requests.get(f"{API}/flights", headers={"Authorization": f"Bearer {user2_token}"})
        assert r2.status_code == 200
        assert all(f["id"] != TestFlightsCRUD.created_id for f in r2.json())
        # user2 cannot delete user1's flight
        r3 = requests.delete(f"{API}/flights/{TestFlightsCRUD.created_id}",
                             headers={"Authorization": f"Bearer {user2_token}"})
        assert r3.status_code == 404
        # user2 cannot export user1's flight
        r4 = requests.get(f"{API}/flights/{TestFlightsCRUD.created_id}/export",
                          params={"format": "csv"},
                          headers={"Authorization": f"Bearer {user2_token}"})
        assert r4.status_code == 404

    def test_12_delete_flight(self, token):
        r = requests.delete(f"{API}/flights/{TestFlightsCRUD.created_id}",
                            headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        # subsequent GET -> 404
        r2 = requests.get(f"{API}/flights/{TestFlightsCRUD.created_id}",
                          headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 404
        # delete again -> 404
        r3 = requests.delete(f"{API}/flights/{TestFlightsCRUD.created_id}",
                             headers={"Authorization": f"Bearer {token}"})
        assert r3.status_code == 404

    def test_13_invalid_export_format(self, token):
        # create a temp flight for format test
        samples, _ = _make_samples()
        r0 = requests.post(f"{API}/flights", json={
            "started_at": datetime.fromtimestamp(samples[0]["t"] / 1000, tz=timezone.utc).isoformat(),
            "ended_at": datetime.fromtimestamp(samples[-1]["t"] / 1000, tz=timezone.utc).isoformat(),
            "samples": samples, "note": "TEST_format",
        }, headers={"Authorization": f"Bearer {token}"})
        assert r0.status_code == 200
        fid = r0.json()["id"]
        r = requests.get(f"{API}/flights/{fid}/export", params={"format": "xml"},
                         headers={"Authorization": f"Bearer {token}"})
        assert r.status_code in (400, 422)  # regex validator returns 422
        # cleanup
        requests.delete(f"{API}/flights/{fid}", headers={"Authorization": f"Bearer {token}"})
