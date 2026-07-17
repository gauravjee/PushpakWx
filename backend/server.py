from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
import random
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', '10080'))

# Resend
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
FROM_EMAIL = os.environ.get('FROM_EMAIL', 'onboarding@resend.dev')

app = FastAPI(title="PushpakWX API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ============= MODELS =============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

class DeleteAccountRequest(BaseModel):
    password: str

class UserPublic(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    created_at: str
    email_verified: bool = False

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic

class Airport(BaseModel):
    icao: str
    iata: Optional[str] = None
    name: str
    city: Optional[str] = None
    country: Optional[str] = None
    lat: float
    lon: float
    elevation_ft: Optional[int] = None

class FavoriteCreate(BaseModel):
    icao: Optional[str] = None
    iata: Optional[str] = None
    name: str
    city: Optional[str] = None
    country: Optional[str] = None
    lat: float
    lon: float
    elevation_ft: Optional[int] = None

class FavoriteOut(FavoriteCreate):
    id: str
    created_at: str

class Prefs(BaseModel):
    wind_unit: str = "kt"  # kt | kmh | mph
    altitude_unit: str = "ft"  # ft | m
    temp_unit: str = "C"  # C | F
    auto_detect_flight: bool = True

class FlightSample(BaseModel):
    t: int  # ms epoch
    lat: float
    lon: float
    alt_ft: Optional[float] = None
    speed_kt: Optional[float] = None
    heading: Optional[float] = None

class FlightCreate(BaseModel):
    started_at: str  # ISO
    ended_at: str  # ISO
    samples: List[FlightSample]
    note: Optional[str] = None

# ============= AUTH HELPERS =============

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ============= EMAIL / OTP HELPERS =============

def generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"

async def send_email(to: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        logging.warning("RESEND_API_KEY not set — email not sent. Body: %s", html)
        return False
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            r = await http_client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": FROM_EMAIL,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
            if r.status_code >= 400:
                logging.error("Resend send failed %s: %s", r.status_code, r.text)
                return False
            return True
    except Exception as e:
        logging.exception("Failed sending email: %s", e)
        return False

def verification_email_html(code: str, name: Optional[str] = None) -> str:
    display = name or "Pilot"
    return f"""
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#111315; color:#fff; padding:32px; border-radius:12px; max-width:520px; margin:0 auto;">
      <h1 style="color:#FF9F0A; letter-spacing:4px; margin:0 0 8px;">PUSHPAK<span style="color:#fff;">WX</span></h1>
      <p style="color:#A1A6AB; letter-spacing:2px; font-size:11px; margin:0 0 24px;">AVIATION WEATHER</p>
      <h2 style="color:#fff; margin:0 0 12px;">Verify your email</h2>
      <p style="color:#A1A6AB; line-height:1.5;">Hi {display}, use the code below to confirm your email address. This code expires in 15 minutes.</p>
      <div style="background:#1C1F22; border:1px solid #2A2F35; padding:20px; border-radius:8px; text-align:center; margin:24px 0;">
        <div style="color:#FF9F0A; font-size:36px; letter-spacing:12px; font-weight:800;">{code}</div>
      </div>
      <p style="color:#8A9198; font-size:12px;">If you didn't sign up for PushpakWX, ignore this email.</p>
    </div>
    """

def reset_email_html(code: str) -> str:
    return f"""
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#111315; color:#fff; padding:32px; border-radius:12px; max-width:520px; margin:0 auto;">
      <h1 style="color:#FF9F0A; letter-spacing:4px; margin:0 0 8px;">PUSHPAK<span style="color:#fff;">WX</span></h1>
      <h2 style="color:#fff; margin:24px 0 12px;">Reset your password</h2>
      <p style="color:#A1A6AB; line-height:1.5;">Use the code below to reset your password. This code expires in 15 minutes.</p>
      <div style="background:#1C1F22; border:1px solid #2A2F35; padding:20px; border-radius:8px; text-align:center; margin:24px 0;">
        <div style="color:#FF9F0A; font-size:36px; letter-spacing:12px; font-weight:800;">{code}</div>
      </div>
      <p style="color:#8A9198; font-size:12px;">If you didn't request a password reset, you can ignore this email.</p>
    </div>
    """

async def create_and_send_otp(email: str, purpose: str, name: Optional[str] = None, enforce_cooldown: bool = True) -> str:
    """Create and send OTP. Enforces 60s cooldown per (email, purpose) if enforce_cooldown."""
    if enforce_cooldown:
        existing = await db.otps.find_one({"email": email, "purpose": purpose})
        if existing:
            created_at_str = existing.get("created_at")
            if created_at_str:
                created_at = datetime.fromisoformat(created_at_str)
                elapsed = (datetime.now(timezone.utc) - created_at).total_seconds()
                if elapsed < 60:
                    raise HTTPException(
                        status_code=429,
                        detail=f"Please wait {int(60 - elapsed)}s before requesting another code",
                    )
    code = generate_otp()
    await db.otps.delete_many({"email": email, "purpose": purpose})
    await db.otps.insert_one({
        "email": email,
        "purpose": purpose,
        "code": code,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "attempts": 0,
    })
    subject = "Verify your PushpakWX email" if purpose == "verify" else "Reset your PushpakWX password"
    html = verification_email_html(code, name) if purpose == "verify" else reset_email_html(code)
    await send_email(email, subject, html)
    return code

async def verify_otp(email: str, code: str, purpose: str) -> bool:
    doc = await db.otps.find_one({"email": email, "purpose": purpose})
    if not doc:
        return False
    if doc.get("attempts", 0) >= 5:
        await db.otps.delete_one({"email": email, "purpose": purpose})
        return False
    if datetime.now(timezone.utc) > datetime.fromisoformat(doc["expires_at"]):
        await db.otps.delete_one({"email": email, "purpose": purpose})
        return False
    if doc["code"] != code.strip():
        await db.otps.update_one({"_id": doc["_id"]}, {"$inc": {"attempts": 1}})
        return False
    await db.otps.delete_one({"email": email, "purpose": purpose})
    return True

# ============= AIRPORT SEED =============

AIRPORTS_SEED: List[dict] = [
    {"icao": "KJFK", "iata": "JFK", "name": "John F Kennedy Intl", "city": "New York", "country": "US", "lat": 40.6413, "lon": -73.7781, "elevation_ft": 13},
    {"icao": "KLAX", "iata": "LAX", "name": "Los Angeles Intl", "city": "Los Angeles", "country": "US", "lat": 33.9416, "lon": -118.4085, "elevation_ft": 125},
    {"icao": "KSFO", "iata": "SFO", "name": "San Francisco Intl", "city": "San Francisco", "country": "US", "lat": 37.6213, "lon": -122.3790, "elevation_ft": 13},
    {"icao": "KORD", "iata": "ORD", "name": "Chicago O'Hare Intl", "city": "Chicago", "country": "US", "lat": 41.9742, "lon": -87.9073, "elevation_ft": 672},
    {"icao": "KDFW", "iata": "DFW", "name": "Dallas Fort Worth Intl", "city": "Dallas", "country": "US", "lat": 32.8998, "lon": -97.0403, "elevation_ft": 607},
    {"icao": "KATL", "iata": "ATL", "name": "Hartsfield Jackson Atlanta Intl", "city": "Atlanta", "country": "US", "lat": 33.6407, "lon": -84.4277, "elevation_ft": 1026},
    {"icao": "KSEA", "iata": "SEA", "name": "Seattle Tacoma Intl", "city": "Seattle", "country": "US", "lat": 47.4502, "lon": -122.3088, "elevation_ft": 433},
    {"icao": "KBOS", "iata": "BOS", "name": "Logan Intl", "city": "Boston", "country": "US", "lat": 42.3656, "lon": -71.0096, "elevation_ft": 20},
    {"icao": "KDEN", "iata": "DEN", "name": "Denver Intl", "city": "Denver", "country": "US", "lat": 39.8561, "lon": -104.6737, "elevation_ft": 5431},
    {"icao": "KMIA", "iata": "MIA", "name": "Miami Intl", "city": "Miami", "country": "US", "lat": 25.7959, "lon": -80.2870, "elevation_ft": 8},
    {"icao": "KLAS", "iata": "LAS", "name": "Harry Reid Intl", "city": "Las Vegas", "country": "US", "lat": 36.0840, "lon": -115.1537, "elevation_ft": 2181},
    {"icao": "KPHX", "iata": "PHX", "name": "Phoenix Sky Harbor Intl", "city": "Phoenix", "country": "US", "lat": 33.4342, "lon": -112.0116, "elevation_ft": 1135},
    {"icao": "EGLL", "iata": "LHR", "name": "London Heathrow", "city": "London", "country": "GB", "lat": 51.4700, "lon": -0.4543, "elevation_ft": 83},
    {"icao": "EGKK", "iata": "LGW", "name": "London Gatwick", "city": "London", "country": "GB", "lat": 51.1537, "lon": -0.1821, "elevation_ft": 202},
    {"icao": "LFPG", "iata": "CDG", "name": "Paris Charles de Gaulle", "city": "Paris", "country": "FR", "lat": 49.0097, "lon": 2.5479, "elevation_ft": 392},
    {"icao": "EDDF", "iata": "FRA", "name": "Frankfurt am Main", "city": "Frankfurt", "country": "DE", "lat": 50.0379, "lon": 8.5622, "elevation_ft": 364},
    {"icao": "EHAM", "iata": "AMS", "name": "Amsterdam Schiphol", "city": "Amsterdam", "country": "NL", "lat": 52.3105, "lon": 4.7683, "elevation_ft": -11},
    {"icao": "LEMD", "iata": "MAD", "name": "Madrid Barajas", "city": "Madrid", "country": "ES", "lat": 40.4936, "lon": -3.5668, "elevation_ft": 1998},
    {"icao": "LIRF", "iata": "FCO", "name": "Rome Fiumicino", "city": "Rome", "country": "IT", "lat": 41.8003, "lon": 12.2389, "elevation_ft": 13},
    {"icao": "LSZH", "iata": "ZRH", "name": "Zurich", "city": "Zurich", "country": "CH", "lat": 47.4647, "lon": 8.5492, "elevation_ft": 1416},
    {"icao": "OMDB", "iata": "DXB", "name": "Dubai Intl", "city": "Dubai", "country": "AE", "lat": 25.2532, "lon": 55.3657, "elevation_ft": 62},
    {"icao": "OTHH", "iata": "DOH", "name": "Hamad Intl", "city": "Doha", "country": "QA", "lat": 25.2731, "lon": 51.6080, "elevation_ft": 13},
    {"icao": "VIDP", "iata": "DEL", "name": "Indira Gandhi Intl", "city": "New Delhi", "country": "IN", "lat": 28.5562, "lon": 77.1000, "elevation_ft": 777},
    {"icao": "VABB", "iata": "BOM", "name": "Chhatrapati Shivaji Intl", "city": "Mumbai", "country": "IN", "lat": 19.0896, "lon": 72.8656, "elevation_ft": 39},
    {"icao": "VOBL", "iata": "BLR", "name": "Kempegowda Intl", "city": "Bangalore", "country": "IN", "lat": 13.1986, "lon": 77.7066, "elevation_ft": 3000},
    {"icao": "VOMM", "iata": "MAA", "name": "Chennai Intl", "city": "Chennai", "country": "IN", "lat": 12.9941, "lon": 80.1709, "elevation_ft": 52},
    {"icao": "VHHH", "iata": "HKG", "name": "Hong Kong Intl", "city": "Hong Kong", "country": "HK", "lat": 22.3080, "lon": 113.9185, "elevation_ft": 28},
    {"icao": "RJTT", "iata": "HND", "name": "Tokyo Haneda", "city": "Tokyo", "country": "JP", "lat": 35.5494, "lon": 139.7798, "elevation_ft": 35},
    {"icao": "RJAA", "iata": "NRT", "name": "Tokyo Narita", "city": "Tokyo", "country": "JP", "lat": 35.7647, "lon": 140.3864, "elevation_ft": 141},
    {"icao": "WSSS", "iata": "SIN", "name": "Singapore Changi", "city": "Singapore", "country": "SG", "lat": 1.3644, "lon": 103.9915, "elevation_ft": 22},
    {"icao": "YSSY", "iata": "SYD", "name": "Sydney Kingsford Smith", "city": "Sydney", "country": "AU", "lat": -33.9399, "lon": 151.1753, "elevation_ft": 21},
    {"icao": "YMML", "iata": "MEL", "name": "Melbourne", "city": "Melbourne", "country": "AU", "lat": -37.6690, "lon": 144.8410, "elevation_ft": 434},
    {"icao": "CYYZ", "iata": "YYZ", "name": "Toronto Pearson Intl", "city": "Toronto", "country": "CA", "lat": 43.6777, "lon": -79.6248, "elevation_ft": 569},
    {"icao": "CYVR", "iata": "YVR", "name": "Vancouver Intl", "city": "Vancouver", "country": "CA", "lat": 49.1967, "lon": -123.1815, "elevation_ft": 14},
    {"icao": "SBGR", "iata": "GRU", "name": "São Paulo/Guarulhos", "city": "São Paulo", "country": "BR", "lat": -23.4356, "lon": -46.4731, "elevation_ft": 2459},
    {"icao": "MMMX", "iata": "MEX", "name": "Mexico City Intl", "city": "Mexico City", "country": "MX", "lat": 19.4363, "lon": -99.0721, "elevation_ft": 7316},
    {"icao": "FAOR", "iata": "JNB", "name": "OR Tambo Intl", "city": "Johannesburg", "country": "ZA", "lat": -26.1392, "lon": 28.2460, "elevation_ft": 5558},
    {"icao": "HECA", "iata": "CAI", "name": "Cairo Intl", "city": "Cairo", "country": "EG", "lat": 30.1219, "lon": 31.4056, "elevation_ft": 382},
    {"icao": "UUEE", "iata": "SVO", "name": "Sheremetyevo Intl", "city": "Moscow", "country": "RU", "lat": 55.9726, "lon": 37.4146, "elevation_ft": 622},
    {"icao": "ZBAA", "iata": "PEK", "name": "Beijing Capital Intl", "city": "Beijing", "country": "CN", "lat": 40.0801, "lon": 116.5846, "elevation_ft": 116},
    {"icao": "ZSPD", "iata": "PVG", "name": "Shanghai Pudong Intl", "city": "Shanghai", "country": "CN", "lat": 31.1443, "lon": 121.8083, "elevation_ft": 13},
    {"icao": "RKSI", "iata": "ICN", "name": "Incheon Intl", "city": "Seoul", "country": "KR", "lat": 37.4602, "lon": 126.4407, "elevation_ft": 23},
    {"icao": "KTEB", "iata": "TEB", "name": "Teterboro", "city": "Teterboro", "country": "US", "lat": 40.8501, "lon": -74.0608, "elevation_ft": 9},
    {"icao": "KHPN", "iata": "HPN", "name": "Westchester County", "city": "White Plains", "country": "US", "lat": 41.0670, "lon": -73.7076, "elevation_ft": 439},
    {"icao": "KPAO", "iata": None, "name": "Palo Alto", "city": "Palo Alto", "country": "US", "lat": 37.4611, "lon": -122.1150, "elevation_ft": 6},
    {"icao": "KRHV", "iata": None, "name": "Reid Hillview", "city": "San Jose", "country": "US", "lat": 37.3329, "lon": -121.8194, "elevation_ft": 133},
]

@app.on_event("startup")
async def seed_airports():
    if await db.airports.count_documents({}) == 0:
        await db.airports.insert_many([{**a} for a in AIRPORTS_SEED])
    await db.airports.create_index("icao", unique=True)
    await db.users.create_index("email", unique=True)

# ============= ROUTES =============

@api_router.get("/")
async def root():
    return {"message": "PushpakWX API", "status": "ok"}

@api_router.post("/auth/register")
@limiter.limit("5/hour")
async def register(request: Request, payload: UserCreate):
    email_low = payload.email.lower()
    existing = await db.users.find_one({"email": email_low})
    if existing:
        if existing.get("email_verified"):
            raise HTTPException(status_code=400, detail="Email already registered")
        # unverified — allow re-register (overwrite password + resend code)
        await db.users.update_one(
            {"email": email_low},
            {"$set": {
                "hashed_password": hash_password(payload.password),
                "full_name": payload.full_name,
            }},
        )
        await create_and_send_otp(email_low, "verify", payload.full_name)
        return {"message": "Verification code sent", "email": email_low, "requires_verification": True}

    user_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    user_doc = {
        "id": user_id,
        "email": email_low,
        "full_name": payload.full_name,
        "hashed_password": hash_password(payload.password),
        "created_at": created_at,
        "email_verified": False,
    }
    await db.users.insert_one(user_doc)
    await db.prefs.insert_one({"user_id": user_id, **Prefs().dict()})
    await create_and_send_otp(email_low, "verify", payload.full_name)
    return {"message": "Verification code sent", "email": email_low, "requires_verification": True}

@api_router.post("/auth/verify-email", response_model=Token)
@limiter.limit("10/hour")
async def verify_email(request: Request, payload: VerifyEmailRequest):
    email_low = payload.email.lower()
    ok = await verify_otp(email_low, payload.code, "verify")
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    user = await db.users.find_one({"email": email_low}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"email": email_low}, {"$set": {"email_verified": True}})
    user["email_verified"] = True
    token = create_access_token(user["id"], user["email"])
    return Token(
        access_token=token,
        user=UserPublic(id=user["id"], email=user["email"], full_name=user.get("full_name"), created_at=user["created_at"], email_verified=True),
    )

@api_router.post("/auth/resend-verification")
@limiter.limit("5/hour")
async def resend_verification(request: Request, payload: ResendVerificationRequest):
    email_low = payload.email.lower()
    user = await db.users.find_one({"email": email_low})
    if not user:
        # do not leak existence
        return {"message": "If your account exists, a code has been sent"}
    if user.get("email_verified"):
        raise HTTPException(status_code=400, detail="Email already verified")
    await create_and_send_otp(email_low, "verify", user.get("full_name"))
    return {"message": "Verification code sent"}

@api_router.post("/auth/login", response_model=Token)
@limiter.limit("20/minute")
async def login(request: Request, payload: UserLogin):
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.get("email_verified"):
        # trigger resend (best-effort, ignore cooldown errors)
        try:
            await create_and_send_otp(user["email"], "verify", user.get("full_name"))
        except HTTPException:
            pass
        raise HTTPException(
            status_code=403,
            detail="Email not verified. A new code has been sent to your email.",
        )
    token = create_access_token(user["id"], user["email"])
    return Token(
        access_token=token,
        user=UserPublic(id=user["id"], email=user["email"], full_name=user.get("full_name"), created_at=user["created_at"], email_verified=True),
    )

@api_router.post("/auth/forgot-password")
@limiter.limit("5/hour")
async def forgot_password(request: Request, payload: ForgotPasswordRequest):
    email_low = payload.email.lower()
    user = await db.users.find_one({"email": email_low})
    # Do not leak whether user exists — always return same message
    if user and user.get("email_verified"):
        try:
            await create_and_send_otp(email_low, "reset", user.get("full_name"))
        except HTTPException as e:
            # If cooldown active, still return generic message
            if e.status_code != 429:
                raise
    return {"message": "If an account exists for this email, a reset code has been sent"}

@api_router.post("/auth/reset-password")
@limiter.limit("10/hour")
async def reset_password(request: Request, payload: ResetPasswordRequest):
    email_low = payload.email.lower()
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    ok = await verify_otp(email_low, payload.code, "reset")
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    res = await db.users.update_one(
        {"email": email_low},
        {"$set": {"hashed_password": hash_password(payload.new_password)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Password reset successful"}

@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return UserPublic(
        id=user["id"], email=user["email"], full_name=user.get("full_name"),
        created_at=user["created_at"], email_verified=user.get("email_verified", False),
    )

@api_router.post("/auth/delete-account")
async def delete_account(payload: DeleteAccountRequest, user: dict = Depends(get_current_user)):
    if not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect password")
    user_id = user["id"]
    email = user["email"]
    # Delete all user-related data
    await db.favorites.delete_many({"user_id": user_id})
    await db.prefs.delete_many({"user_id": user_id})
    await db.otps.delete_many({"email": email})
    await db.users.delete_one({"id": user_id})
    return {"message": "Account and all associated data deleted successfully"}

# ---------- Airports ----------
@api_router.get("/airports/search")
async def airport_search(q: str = Query(..., min_length=1)):
    q_up = q.strip().upper()
    q_low = q.strip().lower()
    cursor = db.airports.find({
        "$or": [
            {"icao": {"$regex": f"^{q_up}", "$options": "i"}},
            {"iata": {"$regex": f"^{q_up}", "$options": "i"}},
            {"name": {"$regex": q_low, "$options": "i"}},
            {"city": {"$regex": q_low, "$options": "i"}},
        ]
    }, {"_id": 0}).limit(30)
    results = await cursor.to_list(30)
    return {"results": results}

@api_router.get("/airports/{icao}")
async def get_airport(icao: str):
    ap = await db.airports.find_one({"icao": icao.upper()}, {"_id": 0})
    if not ap:
        raise HTTPException(status_code=404, detail="Airport not found")
    return ap

# ---------- Weather ----------
FORECAST_CACHE_TTL_S = 300     # 5 min
METAR_CACHE_TTL_S = 300        # 5 min
TAF_CACHE_TTL_S = 900          # 15 min
STALE_MAX_AGE_S = 6 * 3600     # serve stale up to 6h if provider is down

async def _cache_get(key: str, ttl_s: int) -> Optional[dict]:
    doc = await db.wx_cache.find_one({"_id": key})
    if not doc:
        return None
    fetched_at = doc.get("fetched_at", 0)
    age = datetime.now(timezone.utc).timestamp() - fetched_at
    if age <= ttl_s:
        return {"fresh": True, "data": doc["data"], "age_s": int(age)}
    if age <= STALE_MAX_AGE_S:
        return {"fresh": False, "data": doc["data"], "age_s": int(age)}
    return None

async def _cache_put(key: str, data: dict) -> None:
    await db.wx_cache.update_one(
        {"_id": key},
        {"$set": {
            "data": data,
            "fetched_at": datetime.now(timezone.utc).timestamp(),
        }},
        upsert=True,
    )

async def _fetch_wttr_forecast(lat: float, lon: float) -> Optional[dict]:
    """Fallback weather provider: wttr.in returns JSON at ?format=j1 (3-hourly, no key required)."""
    url = f"https://wttr.in/{lat},{lon}?format=j1"
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            r = await http_client.get(url, headers={"User-Agent": "curl/PushpakWX/1.0"})
            if r.status_code != 200:
                return None
            wj = r.json()
    except Exception:
        return None

    # wttr weather-code → open-meteo weather-code approximation
    def _map_code(code: int) -> int:
        if code in (113,): return 0
        if code in (116,): return 2
        if code in (119, 122): return 3
        if code in (143, 248, 260): return 45
        if code in (176, 263, 266, 281, 284, 293, 296): return 61
        if code in (299, 302, 305): return 63
        if code in (308, 311, 314): return 65
        if code in (317, 320, 323, 326, 350, 362, 365, 368): return 71
        if code in (329, 332, 335, 371, 374): return 73
        if code in (338, 377): return 75
        if code in (353, 356, 359): return 80
        if code in (386, 389): return 95
        if code in (392, 395): return 99
        return 3

    from datetime import datetime as _dt
    current = (wj.get("current_condition") or [{}])[0]
    weather_days = wj.get("weather") or []
    hourly_times = []
    hourly_temp = []
    hourly_wind = []
    hourly_dir = []
    hourly_gust = []
    hourly_code = []
    hourly_cloud = []
    hourly_precip = []
    hourly_press = []
    hourly_rh = []
    hourly_vis = []
    hourly_low = []
    hourly_mid = []
    hourly_high = []
    for day in weather_days[:2]:
        date_str = day.get("date")
        if not date_str:
            continue
        for h in day.get("hourly", []):
            try:
                hh = int(h.get("time", "0"))
            except Exception:
                hh = 0
            hour_num = hh // 100
            iso = f"{date_str}T{hour_num:02d}:00"
            hourly_times.append(iso)
            hourly_temp.append(float(h.get("tempC", 0) or 0))
            wkmh = float(h.get("windspeedKmph", 0) or 0)
            hourly_wind.append(wkmh * 0.539957)  # to knots
            hourly_dir.append(float(h.get("winddirDegree", 0) or 0))
            gkmh = float(h.get("WindGustKmph", h.get("windspeedKmph", 0)) or 0)
            hourly_gust.append(gkmh * 0.539957)
            hourly_code.append(_map_code(int(h.get("weatherCode", 0) or 0)))
            cover = float(h.get("cloudcover", 0) or 0)
            hourly_cloud.append(cover)
            hourly_low.append(cover if cover < 40 else cover * 0.7)
            hourly_mid.append(cover * 0.4)
            hourly_high.append(cover * 0.2)
            hourly_precip.append(float(h.get("precipMM", 0) or 0))
            hourly_press.append(float(h.get("pressure", 1013) or 1013))
            hourly_rh.append(float(h.get("humidity", 0) or 0))
            hourly_vis.append(float(h.get("visibility", 10) or 10) * 1000)

    return {
        "latitude": lat,
        "longitude": lon,
        "current": {
            "temperature_2m": float(current.get("temp_C", 0) or 0),
            "wind_speed_10m": float(current.get("windspeedKmph", 0) or 0) * 0.539957,
            "wind_direction_10m": float(current.get("winddirDegree", 0) or 0),
            "wind_gusts_10m": float(current.get("WindGustKmph", current.get("windspeedKmph", 0)) or 0) * 0.539957,
            "cloud_cover": float(current.get("cloudcover", 0) or 0),
            "precipitation": float(current.get("precipMM", 0) or 0),
            "weather_code": _map_code(int(current.get("weatherCode", 0) or 0)),
            "relative_humidity_2m": float(current.get("humidity", 0) or 0),
            "pressure_msl": float(current.get("pressure", 1013) or 1013),
            "is_day": 1,
        },
        "current_units": {
            "temperature_2m": "°C", "wind_speed_10m": "kn", "wind_direction_10m": "°",
        },
        "hourly": {
            "time": hourly_times,
            "temperature_2m": hourly_temp,
            "wind_speed_10m": hourly_wind,
            "wind_direction_10m": hourly_dir,
            "wind_gusts_10m": hourly_gust,
            "weather_code": hourly_code,
            "cloud_cover": hourly_cloud,
            "cloud_cover_low": hourly_low,
            "cloud_cover_mid": hourly_mid,
            "cloud_cover_high": hourly_high,
            "precipitation": hourly_precip,
            "visibility": hourly_vis,
            "pressure_msl": hourly_press,
            "relative_humidity_2m": hourly_rh,
        },
        "_provider": "wttr.in",
    }

@api_router.get("/weather/forecast")
async def weather_forecast(lat: float, lon: float):
    """Proxies Open-Meteo hourly forecast with a 5-minute cache + stale fallback + wttr.in fallback."""
    key = f"forecast:{round(lat, 2)}:{round(lon, 2)}"
    cached = await _cache_get(key, FORECAST_CACHE_TTL_S)
    if cached and cached["fresh"]:
        return {**cached["data"], "_cache": {"hit": True, "age_s": cached["age_s"], "stale": False}}

    hourly_vars = [
        "temperature_2m", "relative_humidity_2m", "dew_point_2m",
        "precipitation", "rain", "showers", "snowfall",
        "weather_code", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
        "visibility", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
        "pressure_msl", "cape",
    ]
    current_vars = [
        "temperature_2m", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
        "cloud_cover", "precipitation", "weather_code", "relative_humidity_2m",
        "pressure_msl", "is_day",
    ]
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&hourly={','.join(hourly_vars)}"
        f"&current={','.join(current_vars)}"
        "&wind_speed_unit=kn&temperature_unit=celsius"
        "&timezone=auto&forecast_days=2"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            r = await http_client.get(url, headers={"User-Agent": "PushpakWX/1.0 (aviation weather)"})
            if r.status_code == 200:
                data = r.json()
                data["_provider"] = "open-meteo"
                await _cache_put(key, data)
                return {**data, "_cache": {"hit": False, "age_s": 0, "stale": False}}
            logger.warning("Open-Meteo returned %s for %s,%s", r.status_code, lat, lon)
    except Exception as e:
        logger.exception("Open-Meteo request failed: %s", e)

    # Try fallback provider (wttr.in)
    wttr = await _fetch_wttr_forecast(lat, lon)
    if wttr:
        await _cache_put(key, wttr)
        return {**wttr, "_cache": {"hit": False, "age_s": 0, "stale": False}}

    # Both providers failed — serve stale if we have any
    if cached:
        return {**cached["data"], "_cache": {"hit": True, "age_s": cached["age_s"], "stale": True}}
    raise HTTPException(status_code=503, detail="Weather provider is temporarily unavailable and no cached data exists for this location")

# ---------- Favorites ----------
@api_router.get("/favorites", response_model=List[FavoriteOut])
async def list_favorites(user: dict = Depends(get_current_user)):
    cursor = db.favorites.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1)
    return await cursor.to_list(200)

@api_router.post("/favorites", response_model=FavoriteOut)
async def add_favorite(payload: FavoriteCreate, user: dict = Depends(get_current_user)):
    fav_id = str(uuid.uuid4())
    doc = {
        "id": fav_id,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        **payload.dict(),
    }
    await db.favorites.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "user_id"}

@api_router.delete("/favorites/{fav_id}")
async def delete_favorite(fav_id: str, user: dict = Depends(get_current_user)):
    res = await db.favorites.delete_one({"id": fav_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"ok": True}

# ---------- Prefs ----------
@api_router.get("/prefs", response_model=Prefs)
async def get_prefs(user: dict = Depends(get_current_user)):
    p = await db.prefs.find_one({"user_id": user["id"]}, {"_id": 0, "user_id": 0})
    if not p:
        p = Prefs().dict()
        await db.prefs.insert_one({"user_id": user["id"], **p})
    return p

@api_router.put("/prefs", response_model=Prefs)
async def update_prefs(payload: Prefs, user: dict = Depends(get_current_user)):
    await db.prefs.update_one(
        {"user_id": user["id"]},
        {"$set": payload.dict()},
        upsert=True,
    )
    return payload

# ---------- City geocoding (Open-Meteo Geocoding) ----------
@api_router.get("/geocode")
async def geocode(q: str = Query(..., min_length=1)):
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={q}&count=10&language=en&format=json"
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        r = await http_client.get(url)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail="Geocoder unavailable")
        data = r.json()
        return {"results": data.get("results", [])}


# ---------- METAR / TAF (aviationweather.gov) ----------
@api_router.get("/aviation/metar")
async def get_metar(icao: str = Query(..., min_length=3, max_length=4)):
    """Fetch latest METAR for an ICAO from aviationweather.gov (US NOAA)."""
    icao_up = icao.upper()
    key = f"metar:{icao_up}"
    cached = await _cache_get(key, METAR_CACHE_TTL_S)
    if cached and cached["fresh"]:
        return {**cached["data"], "_cache": {"hit": True, "age_s": cached["age_s"], "stale": False}}

    url = f"https://aviationweather.gov/api/data/metar?ids={icao_up}&format=json&taf=false&hours=2"
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            r = await http_client.get(url, headers={"User-Agent": "PushpakWX/1.0"})
            if r.status_code == 204:
                data_list = []
            elif r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"METAR provider error: {r.status_code}")
            else:
                try:
                    data_list = r.json()
                except Exception:
                    data_list = []
    except HTTPException:
        if cached:
            return {**cached["data"], "_cache": {"hit": True, "age_s": cached["age_s"], "stale": True}}
        raise
    except Exception:
        if cached:
            return {**cached["data"], "_cache": {"hit": True, "age_s": cached["age_s"], "stale": True}}
        raise HTTPException(status_code=503, detail="METAR provider unavailable")

    if not data_list:
        result = {"icao": icao_up, "available": False, "raw": None, "observation_time": None}
    else:
        m = data_list[0]
        result = {
            "icao": icao_up,
            "available": True,
            "raw": m.get("rawOb"),
            "observation_time": m.get("reportTime"),
            "temp_c": m.get("temp"),
            "dewpoint_c": m.get("dewp"),
            "wind_dir": m.get("wdir"),
            "wind_speed_kt": m.get("wspd"),
            "wind_gust_kt": m.get("wgst"),
            "visibility": m.get("visib"),
            "altimeter": m.get("altim"),
            "flight_category": m.get("fltCat"),
            "clouds": m.get("clouds"),
        }
    await _cache_put(key, result)
    return {**result, "_cache": {"hit": False, "age_s": 0, "stale": False}}

@api_router.get("/aviation/taf")
async def get_taf(icao: str = Query(..., min_length=3, max_length=4)):
    """Fetch latest TAF for an ICAO from aviationweather.gov (US NOAA)."""
    icao_up = icao.upper()
    key = f"taf:{icao_up}"
    cached = await _cache_get(key, TAF_CACHE_TTL_S)
    if cached and cached["fresh"]:
        return {**cached["data"], "_cache": {"hit": True, "age_s": cached["age_s"], "stale": False}}

    url = f"https://aviationweather.gov/api/data/taf?ids={icao_up}&format=json"
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            r = await http_client.get(url, headers={"User-Agent": "PushpakWX/1.0"})
            if r.status_code == 204:
                data_list = []
            elif r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"TAF provider error: {r.status_code}")
            else:
                try:
                    data_list = r.json()
                except Exception:
                    data_list = []
    except HTTPException:
        if cached:
            return {**cached["data"], "_cache": {"hit": True, "age_s": cached["age_s"], "stale": True}}
        raise
    except Exception:
        if cached:
            return {**cached["data"], "_cache": {"hit": True, "age_s": cached["age_s"], "stale": True}}
        raise HTTPException(status_code=503, detail="TAF provider unavailable")

    if not data_list:
        result = {"icao": icao_up, "available": False, "raw": None}
    else:
        t = data_list[0]
        result = {
            "icao": icao_up,
            "available": True,
            "raw": t.get("rawTAF"),
            "issue_time": t.get("issueTime"),
            "valid_from": t.get("validTimeFrom"),
            "valid_to": t.get("validTimeTo"),
        }
    await _cache_put(key, result)
    return {**result, "_cache": {"hit": False, "age_s": 0, "stale": False}}


# ---------- Flights / Logbook ----------
import math

def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3440.065  # nautical miles
    to_rad = lambda d: d * math.pi / 180.0
    dlat = to_rad(lat2 - lat1)
    dlon = to_rad(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))

async def _nearest_airport(lat: float, lon: float, max_nm: float = 10.0) -> Optional[dict]:
    """Find the nearest seeded airport within max_nm nautical miles."""
    # Rough bbox filter: 1 degree lat ~ 60 nm
    delta = max_nm / 60.0 + 0.05
    cursor = db.airports.find(
        {
            "lat": {"$gte": lat - delta, "$lte": lat + delta},
            "lon": {"$gte": lon - delta, "$lte": lon + delta},
        },
        {"_id": 0},
    )
    best = None
    best_dist = max_nm
    async for ap in cursor:
        d = _haversine_nm(lat, lon, ap["lat"], ap["lon"])
        if d < best_dist:
            best_dist = d
            best = {**ap, "distance_nm": round(d, 2)}
    return best

def _compute_flight_stats(samples: List[dict]) -> dict:
    if not samples:
        return {
            "distance_nm": 0.0, "max_alt_ft": 0.0, "avg_speed_kt": 0.0,
            "max_speed_kt": 0.0, "duration_s": 0,
        }
    total_nm = 0.0
    prev = None
    max_alt = 0.0
    max_speed = 0.0
    speed_sum = 0.0
    speed_count = 0
    for s in samples:
        if prev is not None:
            total_nm += _haversine_nm(prev["lat"], prev["lon"], s["lat"], s["lon"])
        if s.get("alt_ft") is not None and s["alt_ft"] > max_alt:
            max_alt = s["alt_ft"]
        if s.get("speed_kt") is not None:
            if s["speed_kt"] > max_speed:
                max_speed = s["speed_kt"]
            speed_sum += s["speed_kt"]
            speed_count += 1
        prev = s
    duration_s = max(0, int((samples[-1]["t"] - samples[0]["t"]) / 1000))
    return {
        "distance_nm": round(total_nm, 2),
        "max_alt_ft": round(max_alt, 0),
        "avg_speed_kt": round(speed_sum / speed_count, 1) if speed_count else 0.0,
        "max_speed_kt": round(max_speed, 1),
        "duration_s": duration_s,
    }

@api_router.post("/flights")
async def create_flight(payload: FlightCreate, user: dict = Depends(get_current_user)):
    if not payload.samples or len(payload.samples) < 2:
        raise HTTPException(status_code=400, detail="Not enough samples to save a flight")
    samples = [s.dict() for s in payload.samples]
    stats = _compute_flight_stats(samples)
    dep = await _nearest_airport(samples[0]["lat"], samples[0]["lon"])
    arr = await _nearest_airport(samples[-1]["lat"], samples[-1]["lon"])
    flight_id = str(uuid.uuid4())
    doc = {
        "id": flight_id,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": payload.started_at,
        "ended_at": payload.ended_at,
        "note": payload.note,
        "samples": samples,
        "dep_icao": (dep or {}).get("icao"),
        "dep_name": (dep or {}).get("name"),
        "dep_lat": samples[0]["lat"],
        "dep_lon": samples[0]["lon"],
        "arr_icao": (arr or {}).get("icao"),
        "arr_name": (arr or {}).get("name"),
        "arr_lat": samples[-1]["lat"],
        "arr_lon": samples[-1]["lon"],
        **stats,
    }
    await db.flights.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/flights")
async def list_flights(user: dict = Depends(get_current_user)):
    cursor = db.flights.find(
        {"user_id": user["id"]},
        {"_id": 0, "user_id": 0, "samples": 0},
    ).sort("started_at", -1)
    return await cursor.to_list(500)

@api_router.get("/flights/{flight_id}")
async def get_flight(flight_id: str, user: dict = Depends(get_current_user)):
    f = await db.flights.find_one(
        {"id": flight_id, "user_id": user["id"]},
        {"_id": 0, "user_id": 0},
    )
    if not f:
        raise HTTPException(status_code=404, detail="Flight not found")
    return f

@api_router.delete("/flights/{flight_id}")
async def delete_flight(flight_id: str, user: dict = Depends(get_current_user)):
    res = await db.flights.delete_one({"id": flight_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Flight not found")
    return {"ok": True}

@api_router.get("/flights/{flight_id}/export")
async def export_flight(
    flight_id: str,
    format: str = Query("csv", regex="^(csv|geojson)$"),
    user: dict = Depends(get_current_user),
):
    f = await db.flights.find_one(
        {"id": flight_id, "user_id": user["id"]},
        {"_id": 0, "user_id": 0},
    )
    if not f:
        raise HTTPException(status_code=404, detail="Flight not found")
    if format == "csv":
        lines = ["timestamp_iso,lat,lon,alt_ft,speed_kt,heading_deg"]
        for s in f["samples"]:
            iso = datetime.fromtimestamp(s["t"] / 1000, tz=timezone.utc).isoformat()
            lines.append(
                f"{iso},{s['lat']},{s['lon']},"
                f"{s.get('alt_ft', '') or ''},"
                f"{s.get('speed_kt', '') or ''},"
                f"{s.get('heading', '') or ''}"
            )
        return {"filename": f"flight-{flight_id[:8]}.csv", "content_type": "text/csv", "content": "\n".join(lines)}
    else:  # geojson
        coords = [[s["lon"], s["lat"], (s.get("alt_ft") or 0) * 0.3048] for s in f["samples"]]
        geo = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "id": f["id"],
                        "started_at": f["started_at"],
                        "ended_at": f["ended_at"],
                        "dep_icao": f.get("dep_icao"),
                        "arr_icao": f.get("arr_icao"),
                        "distance_nm": f.get("distance_nm"),
                        "max_alt_ft": f.get("max_alt_ft"),
                        "duration_s": f.get("duration_s"),
                    },
                    "geometry": {"type": "LineString", "coordinates": coords},
                }
            ],
        }
        import json as _json
        return {"filename": f"flight-{flight_id[:8]}.geojson", "content_type": "application/geo+json", "content": _json.dumps(geo)}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
