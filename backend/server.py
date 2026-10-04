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

    # Streak: consecutive days (counting back from today, Africa/Lusaka UTC+2) with any reading
    def _day_key(iso: str) -> str:
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            # Shift to Africa/Lusaka (UTC+2, no DST)
            dt = dt + timedelta(hours=2)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return ""

    all_readings_days = {_day_key(r["timestamp"]) for r in glucose} | {_day_key(r["timestamp"]) for r in bp}
    all_readings_days.discard("")
    today_lsk = (datetime.now(timezone.utc) + timedelta(hours=2)).strftime("%Y-%m-%d")
    streak = 0
    cursor_date = datetime.strptime(today_lsk, "%Y-%m-%d")
    # If no reading today, start counting from yesterday
    if cursor_date.strftime("%Y-%m-%d") not in all_readings_days:
        cursor_date -= timedelta(days=1)
    while cursor_date.strftime("%Y-%m-%d") in all_readings_days:
        streak += 1
        cursor_date -= timedelta(days=1)

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
        "streak_days": streak,
    }


# -------------------- AI Advice --------------------
SYSTEM_PROMPT = (
    "You are a friendly, careful health coach for people in Zambia managing diabetes and blood pressure. "
    "Always use mmol/L for glucose and mmHg for blood pressure. "
    "Tailor diet advice to foods commonly available in Zambia: nshima (prefer smaller portions or mix "
    "with wholegrain mealie-meal; pair with vegetables and lean protein), kapenta, bream, chicken, beans, "
    "eggs, vegetables like chibwabwa, rape, impwa, cabbage, tomato and okra, fruits like guava, papaya, "
    "mango, and oranges in moderation. Flag high-sodium traditional staples (processed kapenta, soya "
    "pieces heavy in salt, dried fish, bouillon cubes) for people with high blood pressure. "
    "Encourage walking, affordable local activities, and hydration with water instead of maheu or sodas. "
    "Mention Zambian context when helpful (community clinics, UTH, nearest health post). "
    "Give concise, practical advice in short bullet points when helpful. "
    "Cover diet (what to eat / avoid), lifestyle, what to do during hypo/hyper or high/low BP, "
    "and general treatment ideas (medications are examples only, not prescriptions). "
    "Always add a short disclaimer that this is not medical advice and to consult a clinician for "
    "dosing changes or emergencies. Keep responses under 240 words."
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


# -------------------- Reminders --------------------
class ReminderIn(BaseModel):
    label: str
    time: str  # HH:MM 24h
    enabled: bool = True
    kind: Literal["glucose", "bp", "medication", "general"] = "general"


@api_router.get("/reminders")
async def list_reminders(current_user: dict = Depends(get_current_user)):
    items = await db.reminders.find({"user_id": current_user["id"]}, {"_id": 0}).sort("time", 1).to_list(100)
    return items


@api_router.post("/reminders")
async def add_reminder(input: ReminderIn, current_user: dict = Depends(get_current_user)):
    if not input.label.strip():
        raise HTTPException(status_code=400, detail="Label required")
    try:
        hh, mm = input.time.split(":")
        if not (0 <= int(hh) <= 23 and 0 <= int(mm) <= 59):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=400, detail="Time must be HH:MM")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "label": input.label.strip(),
        "time": input.time,
        "enabled": input.enabled,
        "kind": input.kind,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reminders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.patch("/reminders/{reminder_id}")
async def update_reminder(reminder_id: str, enabled: bool, current_user: dict = Depends(get_current_user)):
    res = await db.reminders.update_one(
        {"id": reminder_id, "user_id": current_user["id"]},
        {"$set": {"enabled": enabled}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    doc = await db.reminders.find_one({"id": reminder_id}, {"_id": 0})
    return doc


@api_router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, current_user: dict = Depends(get_current_user)):
    res = await db.reminders.delete_one({"id": reminder_id, "user_id": current_user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"ok": True}


# -------------------- Medications --------------------
class MedicationIn(BaseModel):
    name: str
    dose: str
    times_per_day: int = 1
    note: Optional[str] = ""


class MedLogIn(BaseModel):
    medication_id: str
    taken_at: Optional[datetime] = None


@api_router.get("/medications")
async def list_meds(current_user: dict = Depends(get_current_user)):
    meds = await db.medications.find({"user_id": current_user["id"], "deleted_at": {"$exists": False}}, {"_id": 0}).sort("created_at", 1).to_list(100)
    # Attach today's taken count (Lusaka day boundary)
    today_lsk = (datetime.now(timezone.utc) + timedelta(hours=2)).strftime("%Y-%m-%d")
    taken_today = await db.med_logs.find({
        "user_id": current_user["id"],
        "day_lsk": today_lsk,
    }, {"_id": 0}).to_list(500)
    counts: dict = {}
    for log in taken_today:
        counts[log["medication_id"]] = counts.get(log["medication_id"], 0) + 1
    for m in meds:
        m["taken_today"] = counts.get(m["id"], 0)
    return meds


@api_router.post("/medications")
async def add_med(input: MedicationIn, current_user: dict = Depends(get_current_user)):
    if not input.name.strip() or not input.dose.strip():
        raise HTTPException(status_code=400, detail="Name and dose required")
    if not (1 <= input.times_per_day <= 10):
        raise HTTPException(status_code=400, detail="times_per_day must be 1-10")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": input.name.strip(),
        "dose": input.dose.strip(),
        "times_per_day": input.times_per_day,
        "note": input.note or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.medications.insert_one(doc)
    doc.pop("_id", None)
    doc["taken_today"] = 0
    return doc


@api_router.delete("/medications/{med_id}")
async def delete_med(med_id: str, current_user: dict = Depends(get_current_user)):
    # Soft delete
    res = await db.medications.update_one(
        {"id": med_id, "user_id": current_user["id"]},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Medication not found")
    return {"ok": True}


@api_router.post("/medications/log")
async def log_med(input: MedLogIn, current_user: dict = Depends(get_current_user)):
    med = await db.medications.find_one({"id": input.medication_id, "user_id": current_user["id"]})
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    ts = input.taken_at or datetime.now(timezone.utc)
    day_lsk = (ts + timedelta(hours=2)).strftime("%Y-%m-%d") if isinstance(ts, datetime) else ""
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "medication_id": input.medication_id,
        "taken_at": ts.isoformat() if isinstance(ts, datetime) else str(ts),
        "day_lsk": day_lsk,
    }
    await db.med_logs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/medications/history")
async def med_history(current_user: dict = Depends(get_current_user), limit: int = 100):
    logs = await db.med_logs.find({"user_id": current_user["id"]}, {"_id": 0}).sort("taken_at", -1).limit(limit).to_list(limit)
    return logs


# -------------------- Doctor Share Link --------------------
def _render_html(user: dict, glucose: list, bp: list) -> str:
    import html as _html
    def row_g(g):
        return f"<tr><td>{g['timestamp'][:16].replace('T',' ')}</td><td>{g['value']} mmol/L</td><td>{_html.escape(str(g.get('context','')))}</td><td class='s-{g.get('severity','')}'>{_html.escape(str(g.get('label','')))}</td></tr>"
    def row_b(b):
        pulse = b.get("pulse") or "-"
        return f"<tr><td>{b['timestamp'][:16].replace('T',' ')}</td><td>{b['systolic']}/{b['diastolic']} mmHg</td><td>{pulse}</td><td class='s-{b.get('severity','')}'>{_html.escape(str(b.get('label','')))}</td></tr>"
    g_rows = "".join(row_g(g) for g in glucose[:80]) or "<tr><td colspan='4' class='empty'>No readings</td></tr>"
    b_rows = "".join(row_b(b) for b in bp[:80]) or "<tr><td colspan='4' class='empty'>No readings</td></tr>"
    name = _html.escape(user.get("name") or "Patient")
    phone = _html.escape(user.get("phone", ""))
    return f"""<!doctype html><html><head><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>VitaTrack — {name}</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#FBFAF6; color:#1C2420; padding:24px; }}
  .wrap {{ max-width:720px; margin:0 auto; }}
  h1 {{ font-size:24px; margin:0 0 4px; }}
  .sub {{ color:#6B766F; font-size:14px; margin-bottom:24px; }}
  .card {{ background:#fff; border:1px solid #E3E0D6; border-radius:16px; padding:20px; margin-bottom:16px; }}
  h2 {{ font-size:14px; letter-spacing:0.5px; text-transform:uppercase; color:#6B766F; margin:0 0 12px; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  th,td {{ text-align:left; padding:8px 6px; border-bottom:1px solid #ECE9DF; }}
  th {{ color:#6B766F; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; }}
  .s-critical {{ color:#B5655C; font-weight:700; }}
  .s-warning {{ color:#C78A2F; font-weight:600; }}
  .s-ok {{ color:#4A6B53; font-weight:600; }}
  .empty {{ color:#6B766F; text-align:center; padding:16px; }}
  .foot {{ color:#6B766F; font-size:12px; margin-top:24px; text-align:center; }}
</style></head><body><div class='wrap'>
<h1>VitaTrack · {name}</h1>
<div class='sub'>{phone} · shared read-only</div>
<div class='card'><h2>Blood Glucose (mmol/L)</h2>
<table><tr><th>When</th><th>Value</th><th>Context</th><th>Status</th></tr>{g_rows}</table></div>
<div class='card'><h2>Blood Pressure (mmHg)</h2>
<table><tr><th>When</th><th>BP</th><th>Pulse</th><th>Status</th></tr>{b_rows}</table></div>
<div class='foot'>Self-tracked data — not a medical document.</div>
</div></body></html>"""


@api_router.post("/share/create")
async def share_create(current_user: dict = Depends(get_current_user)):
    # Deactivate old links for cleanliness
    await db.share_links.update_many(
        {"user_id": current_user["id"], "revoked": {"$ne": True}},
        {"$set": {"revoked": True}},
    )
    token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    doc = {
        "id": str(uuid.uuid4()),
        "token": token,
        "user_id": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at.isoformat(),
        "revoked": False,
    }
    await db.share_links.insert_one(doc)
    base = os.environ.get("PUBLIC_BASE_URL", "")
    return {
        "token": token,
        "expires_at": expires_at.isoformat(),
        "path": f"/api/share/{token}",
        "url": f"{base}/api/share/{token}" if base else None,
    }


@api_router.get("/share/current")
async def share_current(current_user: dict = Depends(get_current_user)):
    doc = await db.share_links.find_one(
        {"user_id": current_user["id"], "revoked": False},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not doc:
        return {"token": None}
    # Check expiry
    try:
        exp = datetime.fromisoformat(doc["expires_at"].replace("Z", "+00:00"))
        if exp < datetime.now(timezone.utc):
            return {"token": None}
    except Exception:
        pass
    return {"token": doc["token"], "expires_at": doc["expires_at"]}


@api_router.post("/share/revoke")
async def share_revoke(current_user: dict = Depends(get_current_user)):
    await db.share_links.update_many(
        {"user_id": current_user["id"], "revoked": False},
        {"$set": {"revoked": True}},
    )
    return {"ok": True}


from fastapi.responses import HTMLResponse


@api_router.get("/share/{token}", response_class=HTMLResponse)
async def share_view(token: str):
    link = await db.share_links.find_one({"token": token, "revoked": False})
    if not link:
        return HTMLResponse("<h1>Link invalid or revoked</h1>", status_code=404)
    try:
        exp = datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00"))
        if exp < datetime.now(timezone.utc):
            return HTMLResponse("<h1>Link expired</h1>", status_code=410)
    except Exception:
        pass
    user = await db.users.find_one({"id": link["user_id"]}, {"_id": 0, "passcode_hash": 0})
    glucose = await db.glucose_readings.find({"user_id": link["user_id"]}, {"_id": 0}).sort("timestamp", -1).limit(100).to_list(100)
    bp = await db.bp_readings.find({"user_id": link["user_id"]}, {"_id": 0}).sort("timestamp", -1).limit(100).to_list(100)
    return HTMLResponse(_render_html(user or {}, glucose, bp))


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
