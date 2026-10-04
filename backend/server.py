from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt as pyjwt

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret')
JWT_ALG = "HS256"
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")


# -------------------- Models --------------------
class SignupInput(BaseModel):
    phone: str
    passcode: str
    name: Optional[str] = None


class LoginInput(BaseModel):
    phone: str
    passcode: str


class AuthResponse(BaseModel):
    token: str
    user: dict


class GlucoseIn(BaseModel):
    value: float  # mmol/L
    context: Literal["fasting", "before_meal", "after_meal", "bedtime", "random"] = "random"
    note: Optional[str] = ""
    timestamp: Optional[datetime] = None


class BPIn(BaseModel):
    systolic: int
    diastolic: int
    pulse: Optional[int] = None
    note: Optional[str] = ""
    timestamp: Optional[datetime] = None


class AdviceIn(BaseModel):
    question: Optional[str] = None  # if None, generate overview advice
    kind: Literal["general", "diet", "treatment", "bp", "glucose"] = "general"


# -------------------- Auth helpers --------------------
def hash_passcode(passcode: str) -> str:
    return bcrypt.hashpw(passcode.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_passcode(passcode: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(passcode.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=60),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = payload.get("sub")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "passcode_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def normalize_phone(phone: str) -> str:
    return "".join(ch for ch in phone if ch.isdigit() or ch == "+").strip()


# -------------------- Status / health --------------------
@api_router.get("/")
async def root():
    return {"message": "GlucoBP API", "status": "ok"}


# -------------------- Auth --------------------
@api_router.post("/auth/signup", response_model=AuthResponse)
async def signup(input: SignupInput):
    phone = normalize_phone(input.phone)
    if len(phone) < 6:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    if not (4 <= len(input.passcode) <= 8) or not input.passcode.isdigit():
        raise HTTPException(status_code=400, detail="Passcode must be 4-8 digits")

    existing = await db.users.find_one({"phone": phone})
    if existing:
        raise HTTPException(status_code=400, detail="Phone already registered")

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "phone": phone,
        "name": (input.name or "").strip() or None,
        "passcode_hash": hash_passcode(input.passcode),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id)
    return AuthResponse(
        token=token,
        user={"id": user_id, "phone": phone, "name": user_doc["name"]},
    )


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(input: LoginInput):
    phone = normalize_phone(input.phone)
    user = await db.users.find_one({"phone": phone})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid phone or passcode")
    if not verify_passcode(input.passcode, user["passcode_hash"]):
        raise HTTPException(status_code=401, detail="Invalid phone or passcode")
    token = create_token(user["id"])
    return AuthResponse(
        token=token,
        user={"id": user["id"], "phone": user["phone"], "name": user.get("name")},
    )


@api_router.get("/auth/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user


# -------------------- Glucose --------------------
def classify_glucose(value: float, context: str) -> dict:
    """Returns {status, severity, message} using mmol/L thresholds."""
    if value < 3.0:
        return {
            "status": "severe_hypo",
            "severity": "critical",
            "label": "Severe Low",
            "message": "Severe hypoglycemia. Take 15-20g fast-acting carbs now and seek help.",
        }
    if value < 3.9:
        return {
            "status": "hypo",
            "severity": "warning",
            "label": "Low",
            "message": "Hypoglycemia. Take 15g fast-acting carbs, recheck in 15 min.",
        }
    # context sensitive upper target
    if context == "fasting" or context == "before_meal":
        upper = 7.0
    elif context == "after_meal":
        upper = 10.0
    elif context == "bedtime":
        upper = 8.3
    else:
        upper = 10.0
    if value <= upper:
        return {
            "status": "in_range",
            "severity": "ok",
            "label": "In Range",
            "message": "Great reading — keep it up.",
        }
    if value < 13.9:
        return {
            "status": "hyper",
            "severity": "warning",
            "label": "High",
            "message": "Hyperglycemia. Hydrate, consider light activity, follow care plan.",
        }
    if value < 20.0:
        return {
            "status": "severe_hyper",
            "severity": "critical",
            "label": "Very High",
            "message": "Very high glucose. Check ketones if available and contact your clinician.",
        }
    return {
        "status": "critical_hyper",
        "severity": "critical",
        "label": "Critical High",
        "message": "Critical hyperglycemia. Seek urgent medical attention.",
    }


@api_router.post("/readings/glucose")
async def add_glucose(input: GlucoseIn, current_user: dict = Depends(get_current_user)):
    ts = input.timestamp or datetime.now(timezone.utc)
    classification = classify_glucose(input.value, input.context)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "value": float(input.value),
        "context": input.context,
        "note": input.note or "",
        "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts),
        "created_at": datetime.now(timezone.utc).isoformat(),
        **classification,
    }
    await db.glucose_readings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/readings/glucose")
async def list_glucose(current_user: dict = Depends(get_current_user), limit: int = 200):
    cursor = db.glucose_readings.find({"user_id": current_user["id"]}, {"_id": 0}).sort("timestamp", -1).limit(limit)
    return await cursor.to_list(limit)


@api_router.delete("/readings/glucose/{reading_id}")
async def delete_glucose(reading_id: str, current_user: dict = Depends(get_current_user)):
    res = await db.glucose_readings.delete_one({"id": reading_id, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reading not found")
    return {"ok": True}


# -------------------- Blood Pressure --------------------
def classify_bp(systolic: int, diastolic: int) -> dict:
    if systolic >= 180 or diastolic >= 120:
        return {
            "status": "crisis",
            "severity": "critical",
            "label": "Hypertensive Crisis",
            "message": "Dangerously high. Seek emergency care immediately.",
        }
    if systolic < 90 or diastolic < 60:
        return {
            "status": "low",
            "severity": "warning",
            "label": "Low (Hypotension)",
            "message": "Low BP. Sit, hydrate, and recheck. If dizzy, seek care.",
        }
    if systolic >= 140 or diastolic >= 90:
        return {
            "status": "stage2",
            "severity": "warning",
            "label": "Stage 2 High",
            "message": "Hypertension Stage 2. Follow your medication plan and contact your clinician.",
        }
    if systolic >= 130 or diastolic >= 80:
        return {
            "status": "stage1",
            "severity": "warning",
            "label": "Stage 1 High",
            "message": "Hypertension Stage 1. Reduce sodium, move more, manage stress.",
        }
    if systolic >= 120:
        return {
            "status": "elevated",
            "severity": "watch",
            "label": "Elevated",
            "message": "Slightly elevated. Lifestyle tweaks can bring it down.",
        }
    return {
        "status": "normal",
        "severity": "ok",
        "label": "Normal",
        "message": "Normal reading — keep it up.",
    }


@api_router.post("/readings/bp")
async def add_bp(input: BPIn, current_user: dict = Depends(get_current_user)):
    if not (50 <= input.systolic <= 260) or not (30 <= input.diastolic <= 180):
        raise HTTPException(status_code=400, detail="Values out of plausible range")
    ts = input.timestamp or datetime.now(timezone.utc)
    classification = classify_bp(input.systolic, input.diastolic)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "systolic": int(input.systolic),
        "diastolic": int(input.diastolic),
        "pulse": int(input.pulse) if input.pulse else None,
        "note": input.note or "",
        "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts),
        "created_at": datetime.now(timezone.utc).isoformat(),
        **classification,
    }
    await db.bp_readings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/readings/bp")
async def list_bp(current_user: dict = Depends(get_current_user), limit: int = 200):
    cursor = db.bp_readings.find({"user_id": current_user["id"]}, {"_id": 0}).sort("timestamp", -1).limit(limit)
    return await cursor.to_list(limit)


@api_router.delete("/readings/bp/{reading_id}")
async def delete_bp(reading_id: str, current_user: dict = Depends(get_current_user)):
    res = await db.bp_readings.delete_one({"id": reading_id, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reading not found")
    return {"ok": True}


# -------------------- Summary / Stats --------------------
@api_router.get("/stats/summary")
async def summary(current_user: dict = Depends(get_current_user)):
    glucose = await db.glucose_readings.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("timestamp", -1).limit(30).to_list(30)
    bp = await db.bp_readings.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("timestamp", -1).limit(30).to_list(30)

    def avg(nums):
        return round(sum(nums) / len(nums), 1) if nums else None

    glucose_avg = avg([g["value"] for g in glucose])
    sys_avg = avg([b["systolic"] for b in bp])
    dia_avg = avg([b["diastolic"] for b in bp])

    in_range_count = sum(1 for g in glucose if g.get("status") == "in_range")
    glucose_in_range_pct = round((in_range_count / len(glucose)) * 100) if glucose else None

    return {
        "glucose": {
            "latest": glucose[0] if glucose else None,
            "avg_mmol_l": glucose_avg,
            "in_range_pct": glucose_in_range_pct,
            "count": len(glucose),
        },
        "bp": {
            "latest": bp[0] if bp else None,
            "avg_systolic": sys_avg,
            "avg_diastolic": dia_avg,
            "count": len(bp),
        },
    }


# -------------------- AI Advice --------------------
SYSTEM_PROMPT = (
    "You are a friendly, careful health coach for people managing diabetes and blood pressure. "
    "Always use mmol/L for glucose and mmHg for blood pressure. "
    "Give concise, practical advice in short bullet points when helpful. "
    "Cover diet (what to eat / avoid), lifestyle, when hypo/hyper or high/low BP occurs what to do, "
    "and general treatment ideas (medications are examples only, not prescriptions). "
    "Always add a short disclaimer that this is not medical advice and to consult a clinician for "
    "dosing changes or emergencies. Keep responses under 220 words."
)


async def build_user_context(user_id: str) -> str:
    glucose = await db.glucose_readings.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(10).to_list(10)
    bp = await db.bp_readings.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(10).to_list(10)

    g_summary = ", ".join(
        f"{g['value']} mmol/L ({g.get('context','')} - {g.get('label','')})" for g in glucose[:5]
    ) or "no recent glucose readings"
    b_summary = ", ".join(
        f"{b['systolic']}/{b['diastolic']} mmHg ({b.get('label','')})" for b in bp[:5]
    ) or "no recent BP readings"

    return f"Recent glucose: {g_summary}. Recent BP: {b_summary}."


@api_router.post("/advice")
async def advice(input: AdviceIn, current_user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    context_str = await build_user_context(current_user["id"])

    if input.question:
        user_text = f"My recent data: {context_str}\n\nQuestion: {input.question}"
    else:
        focus = {
            "diet": "diet suggestions tailored to my readings",
            "treatment": "general treatment and lifestyle guidance",
            "bp": "blood pressure guidance",
            "glucose": "blood sugar guidance",
            "general": "a short overview of what I should focus on today",
        }[input.kind]
        user_text = f"My recent data: {context_str}\n\nGive me {focus}."

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"advice-{current_user['id']}",
        system_message=SYSTEM_PROMPT,
    ).with_model("openai", "gpt-5.6-terra")

    try:
        reply = await chat.send_message(UserMessage(text=user_text))
    except Exception as e:
        logger.exception("LLM error")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "question": input.question or f"[auto:{input.kind}]",
        "answer": reply,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.advice_log.insert_one(doc)
    doc.pop("_id", None)
    return {"answer": reply, "id": doc["id"]}


@api_router.get("/advice/history")
async def advice_history(current_user: dict = Depends(get_current_user), limit: int = 30):
    items = await db.advice_log.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return items


# -------------------- Report Export --------------------
@api_router.get("/report")
async def report(current_user: dict = Depends(get_current_user)):
    glucose = await db.glucose_readings.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("timestamp", -1).limit(500).to_list(500)
    bp = await db.bp_readings.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("timestamp", -1).limit(500).to_list(500)

    lines = []
    lines.append("HEALTH REPORT — Diabetes & Blood Pressure")
    lines.append(f"Patient: {current_user.get('name') or 'User'}  Phone: {current_user.get('phone')}")
    lines.append(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")
    lines.append("=== Blood Glucose (mmol/L) ===")
    if not glucose:
        lines.append("No readings.")
    else:
        values = [g["value"] for g in glucose]
        lines.append(f"Readings: {len(glucose)}   Avg: {round(sum(values)/len(values),1)}   Min: {min(values)}   Max: {max(values)}")
        lines.append("Date/Time              Value   Context          Status")
        for g in glucose[:60]:
            lines.append(f"{g['timestamp'][:16]:<22} {g['value']:<7} {g.get('context',''):<16} {g.get('label','')}")
    lines.append("")
    lines.append("=== Blood Pressure (mmHg) ===")
    if not bp:
        lines.append("No readings.")
    else:
        lines.append(f"Readings: {len(bp)}   Avg: {round(sum(b['systolic'] for b in bp)/len(bp))}/{round(sum(b['diastolic'] for b in bp)/len(bp))}")
        lines.append("Date/Time              BP          Pulse  Status")
        for b in bp[:60]:
            pulse = b.get("pulse") or "-"
            lines.append(f"{b['timestamp'][:16]:<22} {b['systolic']}/{b['diastolic']:<7} {pulse:<6} {b.get('label','')}")
    lines.append("")
    lines.append("Note: This report is a self-tracking log and is not a medical document.")

    text = "\n".join(lines)
    return {"text": text, "generated_at": datetime.now(timezone.utc).isoformat()}


# -------------------- Mount + CORS --------------------
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
