# PushpakWX - Aviation Weather App for Pilots

## Overview
A React Native (Expo) mobile app for pilots providing hourly weather forecasts, live in-flight GPS data, and official aviation weather (METAR/TAF).

## Stack
- **Frontend**: Expo (React Native), Expo Router, TypeScript
- **Backend**: FastAPI, MongoDB (motor async), slowapi for rate limiting
- **Weather (forecast)**: Open-Meteo (free, no key)
- **Weather (official)**: aviationweather.gov (US NOAA, METAR/TAF)
- **Geocoding**: Open-Meteo Geocoding
- **Auth**: JWT + bcrypt, email verification via Resend
- **Email**: Resend (`hello@pushpak.mahesho.com`)

## Features

### Auth (with rate limiting)
- Register / Login / Forgot Password / Reset Password / Delete Account
- Email verification required (6-digit OTP via Resend, 15-min TTL, 60s per-email cooldown)
- **Rate limits (per IP, in-memory):**
  - Register / Forgot-password / Resend-verification: 5/hour + 60s per-email cooldown
  - Verify-email / Reset-password: 10/hour
  - Login: 20/minute

### Dashboard (WX tab)
- Current weather with wind rose, flight condition badge (VFR/MVFR/IFR/LIFR)
- Estimated ceiling, visibility, temp, cloud cover
- **Runway wind component calculator** — enter runway heading (1–36 or 0–360°), instantly see headwind/tailwind + crosswind components (with gust values, high-crosswind warning)
- **Thunderstorm alert** if forecast within 12h
- **OFFICIAL WX section** (METAR + TAF from aviationweather.gov) when ICAO is available
- **Hourly forecast strip** (24h) with wind/gust/cloud/precip
- **ROUTE button** in header opens Route WX planner

### Route WX planner (/route)
- Departure + optional fuel stops + destination airports (via ICAO/IATA/city search)
- Cruise speed input (default 120 kt)
- Great-circle distances → cumulative ETA per waypoint
- Per-waypoint forecast at expected ETA (temp, wind/gust, flight category)
- Per-waypoint METAR-now badge (if ICAO)
- Route summary: total distance, flight time, worst-case flight category along the route

### InFlight tab
- Live GPS altitude, magnetic heading, ground speed, GPS accuracy
- **Large digital compass rose** (heading-up display, rotating dial)
- **START/STOP flight recording** — tap START before takeoff, STOP after landing → auto-saves to Logbook
- **Flight track map** (SVG polyline of your path, up to 2h buffer)
- Track log with altitude + speed sparklines, climb rate (fpm)
- Position coordinates
- **LOGBOOK button** in header → opens persistent flight logbook

### Logbook (/logbook)
- Persistent list of all recorded flights (server-side MongoDB storage per user)
- Each card: DEP → ARR ICAOs, date, distance, duration, max altitude
- **Flight detail** (/logbook/{id}): full flight track on map, stats (distance/duration/max-alt/avg-speed/max-speed/samples), optional pilot note
- **Export CSV** — full sample log with headers `timestamp_iso,lat,lon,alt_ft,speed_kt,heading_deg` for spreadsheets & FAA logbook workflows
- **Export GeoJSON** — FeatureCollection with LineString (lon, lat, alt-m) for mapping apps (QGIS, Google Earth, Leaflet)
- Delete individual flights (with confirmation)

### Search
- ICAO/IATA airport search (46 seeded airports globally)
- City search via Open-Meteo Geocoding

### Favorites, Settings
- Save/delete favorite airports
- Unit toggles (kt/km-h/mph, ft/m, °C/°F)
- Delete Account with password re-entry + confirmation modal

## Backend Endpoints
Auth: `/api/auth/{register,login,verify-email,resend-verification,forgot-password,reset-password,delete-account,me}`

Weather:
- `GET /api/weather/forecast?lat=&lon=` — Open-Meteo hourly
- `GET /api/aviation/metar?icao=` — aviationweather.gov METAR
- `GET /api/aviation/taf?icao=` — aviationweather.gov TAF
- `GET /api/airports/search?q=`, `GET /api/geocode?q=`

Flights / Logbook:
- `POST /api/flights` — save a recorded flight (server computes stats + nearest-airport lookup)
- `GET /api/flights` — list summaries for current user
- `GET /api/flights/{id}` — detail with samples
- `DELETE /api/flights/{id}`
- `GET /api/flights/{id}/export?format=csv|geojson`

Data: `/api/favorites`, `/api/prefs`

## MongoDB Collections
- `users` (id, email, hashed_password, full_name, created_at, email_verified)
- `otps` (email, purpose[verify|reset], code, expires_at, created_at, attempts)
- `airports`, `favorites`, `prefs`
- `flights` (id, user_id, started_at, ended_at, dep_icao/name/lat/lon, arr_icao/name/lat/lon, distance_nm, duration_s, max_alt_ft, avg_speed_kt, max_speed_kt, note, samples[])
