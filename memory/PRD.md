# PilotWX - Aviation Weather App

## Overview
A React Native (Expo) mobile app for pilots providing hourly weather forecasts (wind, gusts, clouds, ceiling, precipitation, thunderstorms) with FAA flight condition summaries (VFR/MVFR/IFR/LIFR).

## Stack
- **Frontend**: Expo (React Native), Expo Router, TypeScript
- **Backend**: FastAPI, MongoDB (motor async)
- **Weather Data**: Open-Meteo (free, no key)
- **Geocoding**: Open-Meteo Geocoding
- **Auth**: JWT + bcrypt, email verification via Resend
- **Email**: Resend (`onboarding@resend.dev` sender)

## Features
### Auth
- Register with email/password + full name
- **Email verification required** (6-digit OTP sent via Resend, valid 15 min)
- Login blocked until email verified
- **Forgot password** flow (OTP code + new password)
- **Delete account** (requires password re-entry, permanently deletes user + favorites + prefs + otps; user cannot log in after deletion)

### Weather Dashboard
- Current conditions (temp, wind, gust, cloud, precip, pressure, humidity)
- Wind rose visualization with direction arrow, cardinal points, speed & gust readout
- Flight condition badge (VFR/MVFR/IFR/LIFR) with FAA colors (green/blue/red/magenta)
- Estimated ceiling from cloud layers (heuristic — not official METAR)
- Thunderstorm alert banner if T-storm codes 95-99 in next 12h
- Hourly forecast strip (24h) with weather icons, temp, wind, gust, cloud, precip

### Search
- Toggle: Airport (ICAO/IATA) vs City search
- Airport DB seeded with ~46 common airports (KJFK, EGLL, VIDP, WSSS, etc.)
- City search via Open-Meteo Geocoding API

### Favorites
- Save/unsave airports & locations
- Quick access list

### Settings
- Unit toggles: wind (kt/km-h/mph), altitude (ft/m), temp (C/F)
- Verified email badge
- Sign out
- Delete account (Danger Zone)

## Backend Endpoints
- `POST /api/auth/register` → sends verification code
- `POST /api/auth/verify-email` → returns token
- `POST /api/auth/resend-verification`
- `POST /api/auth/login` (blocks unverified with 403)
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/delete-account` (auth, requires password)
- `GET /api/auth/me`
- `GET /api/airports/search?q=`
- `GET /api/airports/{icao}`
- `GET /api/geocode?q=`
- `GET /api/weather/forecast?lat=&lon=`
- `GET/POST /api/favorites`, `DELETE /api/favorites/{id}`
- `GET/PUT /api/prefs`

## MongoDB Collections
- `users` (id, email, hashed_password, full_name, created_at, email_verified)
- `otps` (email, purpose[verify|reset], code, expires_at, attempts)
- `airports` (icao, iata, name, city, country, lat, lon, elevation_ft)
- `favorites` (id, user_id, ...airport fields, created_at)
- `prefs` (user_id, wind_unit, altitude_unit, temp_unit)
