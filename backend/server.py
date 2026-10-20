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

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

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
    referral_code: Optional[str] = None


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
    user = await db.users.find_one({"id": user_id, "deleted_at": {"$exists": False}}, {"_id": 0, "passcode_hash": 0})
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
    # Generate unique 6-char referral code
    import random, string
    def _gen_code():
        return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    for _ in range(10):
        code = _gen_code()
        if not await db.users.find_one({"referral_code": code}):
            break

    # Process incoming referral code (if any)
    pro_until = None
    referred_by = None
    inviter_user = None
    incoming = (input.referral_code or "").strip().upper()
    if incoming:
        inviter_user = await db.users.find_one({"referral_code": incoming, "deleted_at": {"$exists": False}})
        if inviter_user:
            referred_by = inviter_user["id"]
            # Give new user 7 days of pro
            pro_until = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    user_doc = {
        "id": user_id,
        "phone": phone,
        "name": (input.name or "").strip() or None,
        "passcode_hash": hash_passcode(input.passcode),
        "role": "user",
        "referral_code": code,
        "referred_by": referred_by,
        "pro_until": pro_until,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)

    # Reward inviter (stackable): add 7 days to their pro_until (from the later of now or current pro_until)
    if inviter_user:
        now = datetime.now(timezone.utc)
        current_iso = inviter_user.get("pro_until")
        try:
            current_dt = datetime.fromisoformat(current_iso) if current_iso else now
        except Exception:
            current_dt = now
        start = max(current_dt, now)
        new_pro = (start + timedelta(days=7)).isoformat()
        await db.users.update_one(
            {"id": inviter_user["id"]},
            {"$set": {"pro_until": new_pro}, "$inc": {"invites_count": 1}},
        )

    token = create_token(user_id)
    return AuthResponse(
        token=token,
        user={"id": user_id, "phone": phone, "name": user_doc["name"], "role": "user", "referral_code": code, "pro_until": pro_until},
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
        user={
            "id": user["id"],
            "phone": user["phone"],
            "name": user.get("name"),
            "role": user.get("role", "user"),
            "referral_code": user.get("referral_code"),
            "pro_until": user.get("pro_until"),
        },
    )


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# -------------------- Referral --------------------
@api_router.get("/referral/me")
async def my_referral(current_user: dict = Depends(get_current_user)):
    # Refetch user to get latest fields (invites_count, pro_until)
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "passcode_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    is_pro = False
    pro_until_iso = user.get("pro_until")
    if pro_until_iso:
        try:
            is_pro = datetime.fromisoformat(pro_until_iso) > now
        except Exception:
            is_pro = False

    invites_count = int(user.get("invites_count", 0))

    code = user.get("referral_code")
    if not code:
        # Backfill for older users
        import random, string
        for _ in range(10):
            c = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if not await db.users.find_one({"referral_code": c}):
                code = c
                break
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})

    share_text = (
        f"Hey! I'm using ZedPulse to track my blood sugar & BP in Zambia 🇿🇲. "
        f"Download it and use my code *{code}* when you sign up — we both get 7 days of ZedPulse Pro free. "
        f"Grab it here: https://zedpulse.app"
    )
    return {
        "code": code,
        "pro_until": pro_until_iso,
        "is_pro": is_pro,
        "invites_count": invites_count,
        "share_text": share_text,
    }


# -------------------- Daily tips --------------------
ZAMBIA_TIPS = [
    # Nutrition — nshima & staples
    {"category": "nutrition", "title": "Nshima & portion control", "body": "Half a cup of cooked nshima raises blood sugar as much as 2 slices of bread. Pair it with vegetables (rape, cabbage, pumpkin leaves) and a palm-sized protein (kapenta, chicken, beans) to blunt the spike."},
    {"category": "nutrition", "title": "Choose brown mealie meal when you can", "body": "Breakfast or super-sifted mealie meal spikes sugar faster than roller/brown mealie meal. If brown isn't available, keep the portion smaller and add relish."},
    {"category": "nutrition", "title": "Kapenta is a smart protein", "body": "Dried kapenta is cheap, low in carbs, and rich in calcium and omega-3s. Good for heart & diabetes. Rinse well to cut salt."},
    {"category": "nutrition", "title": "Watch out for sweet drinks", "body": "A single 500ml Coke or Fanta has about 55g of sugar — more than 2 scoops of nshima's worth of carbs. Switch to water, lemon water, or sugar-free Munati."},
    {"category": "nutrition", "title": "Chibwabwa (pumpkin leaves) are a free superfood", "body": "Pumpkin leaves cook fast, are high in fibre & iron, and keep blood sugar steady. Add groundnuts for taste without sugar."},
    {"category": "nutrition", "title": "Mangoes in season? Still a diabetic friend", "body": "One small mango = ~15g carbs (like a slice of bread). Enjoy it, but skip the sugar on top and don't pair with nshima at the same meal."},
    {"category": "nutrition", "title": "Groundnuts: a handful, not a bowl", "body": "Groundnuts are healthy but calorie-dense. A small handful (30g) is a smart snack. A full bowl can derail your weight and BP."},
    {"category": "nutrition", "title": "Beans > rice for diabetes", "body": "Beans release sugar slowly. Swap half your rice for beans and your post-meal glucose will likely drop by 1-2 mmol/L."},
    {"category": "nutrition", "title": "Fried fritters are a glucose trap", "body": "Vitumbuwa and samosas spike sugar fast and feed BP. Save them for special days, not daily tea breaks."},
    {"category": "nutrition", "title": "Munkoyo & maheu — ask about sugar", "body": "Fermented drinks are good gut food, but sweetened versions can push glucose up. Choose unsweetened or dilute with water."},

    # Nutrition — fruits/veg
    {"category": "nutrition", "title": "Guavas before sunset", "body": "Local guavas are high in fibre and vitamin C and low on the glycemic index. One a day is a good diabetic snack."},
    {"category": "nutrition", "title": "Avocado: a BP friend", "body": "Half an avocado contains potassium which helps balance sodium and lower BP. Great on nshima instead of butter or margarine."},
    {"category": "nutrition", "title": "Rape, chinese cabbage, chibwabwa", "body": "Leafy greens are nearly free of carbs. Fill half your plate — your sugar and BP will thank you."},
    {"category": "nutrition", "title": "Watermelon in moderation", "body": "Watermelon is mostly water but spikes glucose quickly. Stick to 1 small slice and skip the salt sprinkle."},

    # BP tips
    {"category": "bp", "title": "Shake fewer salt crystals", "body": "Most Zambians get too much salt from stock cubes, dried fish, and chips. Try half a Royco cube next time — your BP will drop within weeks."},
    {"category": "bp", "title": "Measure BP at the same time daily", "body": "Morning before breakfast is best. Sit 5 minutes, feet flat, arm at heart level. One reading is a snapshot — the trend is the truth."},
    {"category": "bp", "title": "Walk briskly 30 minutes a day", "body": "A 30-minute brisk walk (even in two 15-min bouts) lowers systolic BP by about 5-8 mmHg. Lusaka or Ndola streets at 06:00 are perfect — cool and calm."},
    {"category": "bp", "title": "Alcohol & BP: honest numbers", "body": "More than 2 drinks a day lifts BP noticeably. If you can't skip, cap it at 1 beer or 1 shot — your medication works better."},
    {"category": "bp", "title": "Dried fish is salty — rinse it", "body": "Rinsing kapenta or dried bream before cooking cuts the salt by about a third without losing flavour."},
    {"category": "bp", "title": "Smoking + hypertension = double trouble", "body": "Smoking stiffens arteries. Quitting is the single biggest BP win. Clinics at Levy or Lusaka Trust can help with cessation."},

    # Glucose management
    {"category": "glucose", "title": "Test before breakfast once a week", "body": "A weekly fasting glucose check builds a reliable picture. Aim for 4.0 – 7.0 mmol/L for most people."},
    {"category": "glucose", "title": "Carry hypo rescue carbs", "body": "Keep 3 glucose tablets or a small juice box in your bag. If you feel shaky or sweaty and read below 3.9 mmol/L, take 15g right away."},
    {"category": "glucose", "title": "Exercise lowers sugar for 24+ hours", "body": "Even gardening or walking from Soweto Market to the Intercity station can keep your glucose steadier until the next day."},
    {"category": "glucose", "title": "The 15-15 hypo rule", "body": "If low: 15g fast carbs, wait 15 minutes, recheck. Repeat if still low. Don't over-correct with a whole chocolate bar."},
    {"category": "glucose", "title": "After-meal walk = better numbers", "body": "A 10-minute stroll after nshima cuts your post-meal spike by up to 30%. Walk around the plot while catching up with family."},
    {"category": "glucose", "title": "Insulin storage in a Zambian climate", "body": "Keep insulin in the fridge (not freezer). While using, it keeps at room temp for 28 days — out of direct sun. Travel with it in a cloth bag, not a hot car boot."},
    {"category": "glucose", "title": "Dawn phenomenon is normal", "body": "Many people wake up with glucose a bit higher than at bedtime. If it's regularly above 10 mmol/L fasting, talk to your clinician — your meds may need tweaking."},

    # Foot care
    {"category": "foot_care", "title": "Check your feet every evening", "body": "Diabetes dulls feeling. A small cut can grow into a bad wound unnoticed. Look between toes with a torch each night."},
    {"category": "foot_care", "title": "Never walk barefoot outside", "body": "Rainy season + barefoot = infection risk. Wear closed shoes even in the yard. Rinse and dry feet after walks."},
    {"category": "foot_care", "title": "Trim toenails straight across", "body": "Rounded corners cause ingrown nails that get infected quickly. If you can't see your feet well, ask a family member or clinic."},
    {"category": "foot_care", "title": "Moisturise but not between toes", "body": "Petroleum jelly or Vaseline keeps skin from cracking. Avoid between toes to prevent fungal infection."},

    # Exercise & lifestyle
    {"category": "exercise", "title": "Zambian 'power walk' at dawn", "body": "The coolest, safest window to exercise in Lusaka or Kitwe is 05:30–07:00. Just 20 minutes most days improves BP, glucose, and sleep."},
    {"category": "exercise", "title": "Try resistance 2x a week", "body": "Press-ups, sit-ups, and jerry-can lifts build muscle, which pulls glucose out of your blood. No gym needed."},
    {"category": "exercise", "title": "Dance to lower sugar", "body": "30 minutes of Zambian rumba or kwela is a real workout — fun, free, and your pancreas appreciates it."},
    {"category": "exercise", "title": "Standing beats sitting", "body": "Every hour, stand up and walk for 2 minutes. Office workers in Lusaka who do this see 10-15% better after-lunch sugar."},

    # Mental health & sleep
    {"category": "mental", "title": "Sleep is medicine", "body": "Less than 6 hours of sleep raises both BP and blood sugar. Aim for 7-8 hours and a dark, cool bedroom."},
    {"category": "mental", "title": "Stress spikes glucose", "body": "A tough day at work or Kabwata market can push your sugar up without eating. Try 4-7-8 breathing: inhale 4, hold 7, exhale 8."},
    {"category": "mental", "title": "Talk about it", "body": "Diabetes + BP together can feel heavy. Chat with family, your church group, or ZDA. Mental health is part of control."},

    # Clinic & care
    {"category": "clinic", "title": "HbA1c every 3-6 months", "body": "Ask your clinic for an HbA1c blood test twice a year. It's your long-term glucose average — aim for below 7% most of the time."},
    {"category": "clinic", "title": "Eye check once a year", "body": "Diabetes can quietly damage the retina. Levy Mwanawasa and UTH have eye clinics; book a yearly review."},
    {"category": "clinic", "title": "Kidney check matters", "body": "A simple urine test (ACR) once a year catches kidney issues early. Treating early can save your kidneys."},
    {"category": "clinic", "title": "Carry a diabetes ID", "body": "A small card in your wallet saying 'I have diabetes' + emergency contact helps strangers help you if you faint."},
    {"category": "clinic", "title": "BP cuff size matters", "body": "A too-small cuff reads BP falsely high. Ask the nurse if the cuff fits comfortably around your upper arm."},

    # Pharmacy & meds
    {"category": "pharmacy", "title": "Metformin with food, not before", "body": "Taking metformin on an empty stomach causes nausea. Swallow it mid-meal and the side effects usually fade in a week or two."},
    {"category": "pharmacy", "title": "Don't skip BP meds on good days", "body": "BP is a silent condition. Stopping meds because 'you feel fine' is the #1 cause of strokes in Zambia. Keep taking them."},
    {"category": "pharmacy", "title": "Compare prices before you buy", "body": "Pharmanova, Link, Health Plus and MedPlus can differ by 30% on the same medicine. Check the Pharmacy watch tab before heading out."},
    {"category": "pharmacy", "title": "Expiry dates on test strips", "body": "Glucose strips lose accuracy months before expiry. Open the pot date and use within 6 months for best results."},
    {"category": "pharmacy", "title": "Pill boxes save lives", "body": "A 7-day pill box (K20-K50 at Pharmanova) stops missed doses. Fill it every Sunday evening and keep it near your toothbrush."},
    {"category": "pharmacy", "title": "Government clinics may stock meds free", "body": "Metformin, enalapril and amlodipine are often free at MoH clinics (availability varies). It's worth asking before paying retail."},

    # Hydration
    {"category": "nutrition", "title": "Drink water before you feel thirsty", "body": "By the time your mouth is dry, you're already 2% dehydrated — which raises BP and makes glucose readings less accurate."},
    {"category": "nutrition", "title": "Munkoyo, chibwantu, water — rank them", "body": "Water first, then unsweetened fermented drinks, then juice. Avoid sweetened soft drinks except for hypo rescue."},

    # Family / community
    {"category": "mental", "title": "Teach your family hypo signs", "body": "Shaky, sweaty, confused, slurred speech — these could be low sugar. Teach your spouse or child to grab juice or glucose tablets and call for help."},
    {"category": "clinic", "title": "ZDA peer groups help", "body": "The Zambia Diabetes Association runs support meet-ups in Lusaka and Copperbelt — a great place to swap meal ideas and tips."},

    # Weight
    {"category": "exercise", "title": "A 5kg loss = big BP drop", "body": "Even losing 5kg can cut systolic BP by 5-10 mmHg and improve glucose. Small, slow changes add up over 6 months."},

    # Seasons
    {"category": "clinic", "title": "Cold mornings raise BP", "body": "July and August cold snaps can push BP up. Dress warmly and check readings in the morning — adjust meds only with your clinician."},
    {"category": "clinic", "title": "Rainy season = mosquitoes & missed meds", "body": "Travelling during the rains? Pack 2 extra weeks of meds in a waterproof bag."},

    # Social cues
    {"category": "nutrition", "title": "Funerals & weddings — plan ahead", "body": "Big events often mean lots of food. Eat half a plate, lots of greens, and skip the second helping. One day of excess won't ruin you, but every weekend will."},
    {"category": "nutrition", "title": "Tea with less sugar, slowly", "body": "Cut sugar by half a teaspoon a week. In 2 months your tea tastes natural with zero and your sugar readings drop."},
    {"category": "nutrition", "title": "Breakfast matters most", "body": "Skipping breakfast makes blood sugar swing wildly later. Try porridge with groundnuts & a small fruit — steady fuel until lunch."},

    # BP & meds timing
    {"category": "bp", "title": "Pick a BP meds time and stick to it", "body": "Taking your BP tablet at the same time daily (e.g., with morning tea) builds a habit. Consistent timing = consistent BP."},
    {"category": "bp", "title": "Stand up slowly from bed", "body": "If your BP meds make you light-headed in the morning, sit on the edge of the bed for 30 seconds first. Prevents falls."},

    # Final general ones
    {"category": "glucose", "title": "Log it to see it", "body": "Readings you don't log tell you nothing. Even on 'bad' days, log — patterns need data."},
    {"category": "mental", "title": "Celebrate the small wins", "body": "A week of in-range sugars or a kilo lost — tell someone, note it in the app. Progress fuels progress."},
]


@api_router.get("/tips/today")
async def tip_today():
    """Return today's rotating Zambian health tip (seeded, day-of-year based)."""
    if not ZAMBIA_TIPS:
        raise HTTPException(status_code=500, detail="No tips configured")
    today = datetime.now(timezone.utc).date()
    # Deterministic rotation across the pool
    idx = today.toordinal() % len(ZAMBIA_TIPS)
    tip = dict(ZAMBIA_TIPS[idx])
    tip["id"] = f"{today.isoformat()}-{idx}"
    tip["date"] = today.isoformat()
    tip["total"] = len(ZAMBIA_TIPS)
    tip["index"] = idx
    return tip



@api_router.get("/auth/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user


@api_router.delete("/auth/account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    """Soft-delete the user: mark deleted_at, and soft-remove their data."""
    now_iso = datetime.now(timezone.utc).isoformat()
    uid = current_user["id"]
    await db.users.update_one({"id": uid}, {"$set": {"deleted_at": now_iso, "phone": f"deleted-{uid}"}})
    await db.glucose_readings.update_many({"user_id": uid}, {"$set": {"deleted_at": now_iso}})
    await db.bp_readings.update_many({"user_id": uid}, {"$set": {"deleted_at": now_iso}})
    await db.medications.update_many({"user_id": uid}, {"$set": {"deleted_at": now_iso}})
    await db.reminders.update_many({"user_id": uid}, {"$set": {"deleted_at": now_iso}})
    await db.share_links.update_many({"user_id": uid, "revoked": False}, {"$set": {"revoked": True}})
    await db.emergency_contacts.delete_one({"user_id": uid})
    return {"ok": True}


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
    lines.append("ZedPulse HEALTH REPORT — Diabetes & Blood Pressure")
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
<title>ZedPulse — {name}</title>
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
<h1>ZedPulse · {name}</h1>
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


# -------------------- Emergency Family Contact --------------------
class EmergencyContactIn(BaseModel):
    name: str
    phone: str  # include country code, e.g. +260977000000


@api_router.get("/profile/emergency-contact")
async def get_emergency_contact(current_user: dict = Depends(get_current_user)):
    doc = await db.emergency_contacts.find_one({"user_id": current_user["id"]}, {"_id": 0})
    return doc or {"name": None, "phone": None}


@api_router.post("/profile/emergency-contact")
async def set_emergency_contact(input: EmergencyContactIn, current_user: dict = Depends(get_current_user)):
    phone = normalize_phone(input.phone)
    if len(phone) < 7:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    if not input.name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    doc = {
        "user_id": current_user["id"],
        "name": input.name.strip(),
        "phone": phone,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.emergency_contacts.update_one(
        {"user_id": current_user["id"]},
        {"$set": doc},
        upsert=True,
    )
    return {"name": doc["name"], "phone": doc["phone"]}


@api_router.delete("/profile/emergency-contact")
async def delete_emergency_contact(current_user: dict = Depends(get_current_user)):
    await db.emergency_contacts.delete_one({"user_id": current_user["id"]})
    return {"ok": True}


# -------------------- Food Scanner --------------------
class FoodScanIn(BaseModel):
    image_base64: str  # raw base64, no data: prefix
    content_type: Optional[str] = "image/jpeg"


FOOD_SCAN_PROMPT = (
    "You are a Zambian nutrition assistant for people with diabetes. "
    "Look at this photo of food and respond with STRICT JSON only, no commentary: "
    '{"foods":[{"name":"...","portion":"...","carbs_g":0}],"total_carbs_g":0,'
    '"glycemic_load":"low|medium|high","diabetes_tips":"short tip (<=240 chars)",'
    '"zambia_note":"short tip tailored to local foods/alternatives (<=200 chars)"}. '
    "Use Zambian food names when possible (nshima, kapenta, ifisashi, chibwabwa, rape, impwa, "
    "shima ya mabele). Portion sizes should be realistic (e.g. 'palm-sized ball', '1 cup'). "
    "Carbs are grams per the visible portion. If no food is visible, return foods=[] and total_carbs_g=0."
)


@api_router.post("/food/scan")
async def food_scan(input: FoodScanIn, current_user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    if not input.image_base64 or len(input.image_base64) < 100:
        raise HTTPException(status_code=400, detail="Image data missing")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"food-{current_user['id']}-{uuid.uuid4().hex[:8]}",
        system_message=FOOD_SCAN_PROMPT,
    ).with_model("openai", "gpt-5.6-terra")
    msg = UserMessage(
        text="Analyze this meal.",
        file_contents=[ImageContent(image_base64=input.image_base64)],
    )
    try:
        reply = await chat.send_message(msg)
    except Exception as e:
        logger.exception("Food scan LLM error")
        raise HTTPException(status_code=502, detail=f"Vision service error: {e}")
    # Extract JSON from reply (sometimes LLM wraps in markdown)
    import json as _json, re as _re
    cleaned = reply.strip()
    m = _re.search(r"\{[\s\S]*\}", cleaned)
    parsed = None
    if m:
        try:
            parsed = _json.loads(m.group(0))
        except Exception:
            parsed = None
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "foods": (parsed or {}).get("foods", []),
        "total_carbs_g": (parsed or {}).get("total_carbs_g"),
        "glycemic_load": (parsed or {}).get("glycemic_load"),
        "diabetes_tips": (parsed or {}).get("diabetes_tips", ""),
        "zambia_note": (parsed or {}).get("zambia_note", ""),
        "raw": reply if not parsed else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.food_scans.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.get("/food/scans")
async def food_scans(current_user: dict = Depends(get_current_user), limit: int = 20):
    items = await db.food_scans.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return items


# Zambian foods library (manual pick fallback)
ZAMBIAN_FOODS = [
    {"name": "Nshima (mealie-meal)", "portion": "1 fist", "carbs_g": 40, "gi": "high", "tip": "Prefer wholegrain mealie-meal; pair with vegetables"},
    {"name": "Nshima (wholegrain)", "portion": "1 fist", "carbs_g": 35, "gi": "medium", "tip": "Better choice than refined mealie-meal"},
    {"name": "Shima ya mabele (sorghum)", "portion": "1 fist", "carbs_g": 30, "gi": "low", "tip": "Good diabetic choice"},
    {"name": "Rice (white)", "portion": "1 cup", "carbs_g": 45, "gi": "high", "tip": "Half-portion with lots of veg"},
    {"name": "Brown rice", "portion": "1 cup", "carbs_g": 40, "gi": "medium", "tip": "Better than white rice"},
    {"name": "Sweet potato (chimbwali)", "portion": "1 medium", "carbs_g": 25, "gi": "medium", "tip": "Better than nshima for blood sugar"},
    {"name": "Cassava (chinaka)", "portion": "1 cup", "carbs_g": 40, "gi": "medium", "tip": "Watch portion size"},
    {"name": "Beans (small portion)", "portion": "1/2 cup", "carbs_g": 20, "gi": "low", "tip": "Great protein + fibre"},
    {"name": "Kapenta (dried fish)", "portion": "small plate", "carbs_g": 2, "gi": "low", "tip": "Rinse to reduce salt if hypertensive"},
    {"name": "Bream (fresh)", "portion": "1 fillet", "carbs_g": 0, "gi": "low", "tip": "Excellent lean protein"},
    {"name": "Chicken (grilled)", "portion": "1 breast", "carbs_g": 0, "gi": "low", "tip": "Avoid deep-fried"},
    {"name": "Beef stew", "portion": "1 cup", "carbs_g": 8, "gi": "low", "tip": "Watch added oil"},
    {"name": "Eggs (boiled)", "portion": "2 eggs", "carbs_g": 1, "gi": "low", "tip": "Great breakfast"},
    {"name": "Chibwabwa (pumpkin leaves)", "portion": "1 cup", "carbs_g": 5, "gi": "low", "tip": "Eat freely"},
    {"name": "Rape (greens)", "portion": "1 cup", "carbs_g": 4, "gi": "low", "tip": "Eat freely"},
    {"name": "Cabbage", "portion": "1 cup", "carbs_g": 5, "gi": "low", "tip": "Eat freely"},
    {"name": "Impwa (local eggplant)", "portion": "1 cup", "carbs_g": 6, "gi": "low", "tip": "Great side dish"},
    {"name": "Okra (delele)", "portion": "1 cup", "carbs_g": 7, "gi": "low", "tip": "Helps slow glucose rise"},
    {"name": "Tomato & onion relish", "portion": "1/2 cup", "carbs_g": 6, "gi": "low", "tip": "Good base for stews"},
    {"name": "Avocado", "portion": "1/2 fruit", "carbs_g": 6, "gi": "low", "tip": "Healthy fats"},
    {"name": "Groundnuts (unsalted)", "portion": "small handful", "carbs_g": 6, "gi": "low", "tip": "Portion-controlled snack"},
    {"name": "Ifisashi (greens in peanut)", "portion": "1 cup", "carbs_g": 10, "gi": "low", "tip": "Watch portion of peanut sauce"},
    {"name": "Mango", "portion": "1 medium", "carbs_g": 25, "gi": "medium", "tip": "Half fruit if sugar is high"},
    {"name": "Guava", "portion": "1 medium", "carbs_g": 10, "gi": "low", "tip": "Good fruit choice"},
    {"name": "Papaya (pawpaw)", "portion": "1 cup", "carbs_g": 15, "gi": "medium", "tip": "Enjoy in moderation"},
    {"name": "Orange", "portion": "1 medium", "carbs_g": 15, "gi": "low", "tip": "Better than juice"},
    {"name": "Banana (ripe)", "portion": "1 medium", "carbs_g": 27, "gi": "medium", "tip": "Prefer less ripe"},
    {"name": "Maheu (fermented drink)", "portion": "1 cup", "carbs_g": 25, "gi": "high", "tip": "High sugar — limit"},
    {"name": "Munkoyo", "portion": "1 cup", "carbs_g": 20, "gi": "medium", "tip": "Limit sweetened versions"},
    {"name": "Fritters (vitumbuwa)", "portion": "1 piece", "carbs_g": 15, "gi": "high", "tip": "Occasional treat"},
]


@api_router.get("/food/library")
async def food_library():
    return ZAMBIAN_FOODS


class FoodLogIn(BaseModel):
    name: str
    carbs_g: float
    portion: Optional[str] = ""


@api_router.post("/food/log")
async def food_log(input: FoodLogIn, current_user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": input.name,
        "portion": input.portion or "",
        "carbs_g": float(input.carbs_g),
        "logged_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.food_logs.insert_one(doc)
    doc.pop("_id", None)
    return doc


# -------------------- Clinic Finder --------------------
ZAMBIAN_CLINICS = [
    # Lusaka
    {"name": "University Teaching Hospital (UTH)", "city": "Lusaka", "type": "Hospital", "lat": -15.4197, "lng": 28.3240, "phone": "+260211256067"},
    {"name": "Levy Mwanawasa University Teaching Hospital", "city": "Lusaka", "type": "Hospital", "lat": -15.3875, "lng": 28.3610, "phone": "+260211845000"},
    {"name": "Chainama Hills Hospital", "city": "Lusaka", "type": "Hospital", "lat": -15.4080, "lng": 28.3858, "phone": "+260211292020"},
    {"name": "Kabwata Clinic", "city": "Lusaka", "type": "Clinic", "lat": -15.4330, "lng": 28.2928, "phone": "+260211256067"},
    {"name": "Matero Reference Hospital", "city": "Lusaka", "type": "Hospital", "lat": -15.3785, "lng": 28.2612, "phone": "+260211242200"},
    {"name": "Kanyama First-Level Hospital", "city": "Lusaka", "type": "Hospital", "lat": -15.4310, "lng": 28.2347, "phone": "+260211279181"},
    {"name": "Chawama First-Level Hospital", "city": "Lusaka", "type": "Hospital", "lat": -15.4624, "lng": 28.2787, "phone": "+260211274124"},
    {"name": "Chilenje First-Level Hospital", "city": "Lusaka", "type": "Hospital", "lat": -15.4592, "lng": 28.3187, "phone": "+260211261108"},
    {"name": "Chelstone Clinic", "city": "Lusaka", "type": "Clinic", "lat": -15.3922, "lng": 28.3620, "phone": "+260211292020"},
    {"name": "Kalingalinga Clinic", "city": "Lusaka", "type": "Clinic", "lat": -15.3932, "lng": 28.3450, "phone": "+260211292020"},
    # Copperbelt
    {"name": "Ndola Teaching Hospital", "city": "Ndola", "type": "Hospital", "lat": -12.9587, "lng": 28.6366, "phone": "+260212611111"},
    {"name": "Kitwe Teaching Hospital", "city": "Kitwe", "type": "Hospital", "lat": -12.8117, "lng": 28.2064, "phone": "+260212222661"},
    {"name": "Arthur Davison Children's Hospital", "city": "Ndola", "type": "Hospital", "lat": -12.9668, "lng": 28.6349, "phone": "+260212615015"},
    {"name": "Chingola Central Hospital", "city": "Chingola", "type": "Hospital", "lat": -12.5290, "lng": 27.8564, "phone": "+260212311254"},
    {"name": "Mufulira General Hospital", "city": "Mufulira", "type": "Hospital", "lat": -12.5500, "lng": 28.2400, "phone": "+260212411254"},
    {"name": "Luanshya Mine Hospital", "city": "Luanshya", "type": "Hospital", "lat": -13.1370, "lng": 28.4160, "phone": "+260212511254"},
    {"name": "Kalulushi General Hospital", "city": "Kalulushi", "type": "Hospital", "lat": -12.8370, "lng": 28.1030, "phone": "+260212710254"},
    # Southern
    {"name": "Livingstone Central Hospital", "city": "Livingstone", "type": "Hospital", "lat": -17.8465, "lng": 25.8542, "phone": "+260213320221"},
    {"name": "Choma General Hospital", "city": "Choma", "type": "Hospital", "lat": -16.8097, "lng": 26.9875, "phone": "+260213220254"},
    {"name": "Mazabuka General Hospital", "city": "Mazabuka", "type": "Hospital", "lat": -15.8552, "lng": 27.7472, "phone": "+260213230254"},
    {"name": "Monze Mission Hospital", "city": "Monze", "type": "Hospital", "lat": -16.2808, "lng": 27.4793, "phone": "+260213250254"},
    # Central / Eastern / Western
    {"name": "Kabwe General Hospital", "city": "Kabwe", "type": "Hospital", "lat": -14.4469, "lng": 28.4464, "phone": "+260215221254"},
    {"name": "Kapiri Mposhi Hospital", "city": "Kapiri Mposhi", "type": "Hospital", "lat": -13.9700, "lng": 28.6700, "phone": "+260215271254"},
    {"name": "Mongu General Hospital", "city": "Mongu", "type": "Hospital", "lat": -15.2487, "lng": 23.1226, "phone": "+260217221254"},
    {"name": "Chipata Central Hospital", "city": "Chipata", "type": "Hospital", "lat": -13.6333, "lng": 32.6500, "phone": "+260216221254"},
    {"name": "Petauke District Hospital", "city": "Petauke", "type": "Hospital", "lat": -14.2496, "lng": 31.3156, "phone": "+260216371254"},
    {"name": "Solwezi General Hospital", "city": "Solwezi", "type": "Hospital", "lat": -12.1683, "lng": 26.3889, "phone": "+260218821254"},
    {"name": "Kasama General Hospital", "city": "Kasama", "type": "Hospital", "lat": -10.2129, "lng": 31.1808, "phone": "+260214221254"},
    {"name": "Mansa General Hospital", "city": "Mansa", "type": "Hospital", "lat": -11.1996, "lng": 28.8940, "phone": "+260212821254"},
    {"name": "Chinsali General Hospital", "city": "Chinsali", "type": "Hospital", "lat": -10.5500, "lng": 32.0600, "phone": "+260214471254"},
    # Private
    {"name": "Fairview Hospital", "city": "Lusaka", "type": "Private", "lat": -15.4040, "lng": 28.3028, "phone": "+260211256071"},
    {"name": "Lusaka Trust Hospital", "city": "Lusaka", "type": "Private", "lat": -15.4098, "lng": 28.3045, "phone": "+260211257373"},
    {"name": "Victoria Hospital", "city": "Lusaka", "type": "Private", "lat": -15.3998, "lng": 28.3250, "phone": "+260211256071"},
    {"name": "CFB Medical Centre", "city": "Lusaka", "type": "Private", "lat": -15.4150, "lng": 28.3100, "phone": "+260211256071"},
    {"name": "Hilltop Hospital", "city": "Ndola", "type": "Private", "lat": -12.9640, "lng": 28.6450, "phone": "+260212612345"},
    # Diabetes-focused centres
    {"name": "Zambia Diabetes Association HQ", "city": "Lusaka", "type": "Diabetes Centre", "lat": -15.4190, "lng": 28.3215, "phone": "+260211256067"},
    {"name": "DCA Diabetes Clinic (UTH)", "city": "Lusaka", "type": "Diabetes Centre", "lat": -15.4197, "lng": 28.3240, "phone": "+260211256067"},
    {"name": "Beit Cure Hospital", "city": "Lusaka", "type": "Hospital", "lat": -15.4038, "lng": 28.3160, "phone": "+260211256067"},
    {"name": "CIDRZ Centre", "city": "Lusaka", "type": "Clinic", "lat": -15.4030, "lng": 28.3135, "phone": "+260211257670"},
    {"name": "Kitwe Hilltop Clinic", "city": "Kitwe", "type": "Clinic", "lat": -12.8020, "lng": 28.2120, "phone": "+260212222661"},
]


@api_router.get("/clinics")
async def list_clinics(city: Optional[str] = None):
    items = ZAMBIAN_CLINICS
    if city:
        items = [c for c in items if c["city"].lower() == city.lower()]
    return items


# -------------------- Weekly Insights --------------------
@api_router.get("/insights/weekly")
async def weekly_insights(current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    one_week_ago = now - timedelta(days=7)
    glucose = await db.glucose_readings.find(
        {"user_id": current_user["id"], "timestamp": {"$gte": one_week_ago.isoformat()}},
        {"_id": 0},
    ).sort("timestamp", -1).to_list(500)
    bp = await db.bp_readings.find(
        {"user_id": current_user["id"], "timestamp": {"$gte": one_week_ago.isoformat()}},
        {"_id": 0},
    ).sort("timestamp", -1).to_list(500)
    med_logs = await db.med_logs.find(
        {"user_id": current_user["id"], "taken_at": {"$gte": one_week_ago.isoformat()}},
        {"_id": 0},
    ).to_list(500)
    meds = await db.medications.find(
        {"user_id": current_user["id"], "deleted_at": {"$exists": False}},
        {"_id": 0},
    ).to_list(100)

    g_vals = [g["value"] for g in glucose]
    g_avg = round(sum(g_vals) / len(g_vals), 1) if g_vals else None
    g_in_range = sum(1 for g in glucose if g.get("status") == "in_range")
    g_in_range_pct = round((g_in_range / len(glucose)) * 100) if glucose else None
    sys_avg = round(sum(b["systolic"] for b in bp) / len(bp)) if bp else None
    dia_avg = round(sum(b["diastolic"] for b in bp) / len(bp)) if bp else None
    expected_doses = sum(m["times_per_day"] for m in meds) * 7
    adherence_pct = round((len(med_logs) / expected_doses) * 100) if expected_doses else None

    # Zambia tip via LLM (short, graceful if unavailable)
    tip = ""
    if EMERGENT_LLM_KEY and (glucose or bp):
        try:
            summary_txt = (
                f"glucose readings={len(glucose)} avg={g_avg} in_range_pct={g_in_range_pct}; "
                f"bp readings={len(bp)} avg={sys_avg}/{dia_avg}; "
                f"medication adherence={adherence_pct}%"
            )
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"weekly-{current_user['id']}-{now.strftime('%Y%W')}",
                system_message="You are a Zambian diabetes/BP coach. Reply in 2 short sentences (max 200 chars total). Reference one Zambian food or habit (nshima portion, kapenta salt, chibwabwa, walking in the compound, hydration). No disclaimers.",
            ).with_model("openai", "gpt-5.6-terra")
            tip = (await chat.send_message(UserMessage(text=f"Weekly data: {summary_txt}. Give one encouraging tip."))).strip()
        except Exception as e:
            logger.warning(f"weekly tip LLM error: {e}")
            tip = ""

    return {
        "week_start": one_week_ago.isoformat(),
        "week_end": now.isoformat(),
        "glucose": {"count": len(glucose), "avg_mmol_l": g_avg, "in_range_pct": g_in_range_pct},
        "bp": {"count": len(bp), "avg_systolic": sys_avg, "avg_diastolic": dia_avg},
        "medications": {"logged": len(med_logs), "expected": expected_doses, "adherence_pct": adherence_pct},
        "tip": tip,
    }


# -------------------- Pharmacy Price Watch (Zambia, ZMW) --------------------
# Typical retail price ranges for Zambian pharmacies, 2026. Estimates only.
PHARMACY_ITEMS = [
    # Diabetes meds
    {"id": "metformin-500", "name": "Metformin 500 mg", "category": "medication", "subcategory": "diabetes", "pack": "30 tablets", "price_low": 40, "price_high": 80, "note": "First-line Type 2 diabetes. Take with food to reduce stomach upset.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus", "Shoprite Pharmacy", "UTH Pharmacy"]},
    {"id": "metformin-850", "name": "Metformin 850 mg", "category": "medication", "subcategory": "diabetes", "pack": "30 tablets", "price_low": 50, "price_high": 100, "note": "Higher-strength Metformin, same uses.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus"]},
    {"id": "glibenclamide", "name": "Glibenclamide 5 mg", "category": "medication", "subcategory": "diabetes", "pack": "30 tablets", "price_low": 20, "price_high": 50, "note": "Older sulfonylurea. Watch for hypos.", "available_at": ["Pharmanova", "Link Pharmacy", "Government clinics (free)"]},
    {"id": "glipizide", "name": "Glipizide 5 mg", "category": "medication", "subcategory": "diabetes", "pack": "30 tablets", "price_low": 30, "price_high": 60, "note": "Sulfonylurea; take before meals.", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "insulin-mixtard", "name": "Insulin Mixtard 70/30", "category": "medication", "subcategory": "diabetes", "pack": "10 ml vial", "price_low": 150, "price_high": 350, "note": "Keep refrigerated. Check expiry.", "available_at": ["UTH Pharmacy", "Pharmanova", "Link Pharmacy", "Hospital pharmacies"]},
    {"id": "insulin-humulin-n", "name": "Insulin Humulin N", "category": "medication", "subcategory": "diabetes", "pack": "10 ml vial", "price_low": 200, "price_high": 400, "note": "Intermediate acting. Store in fridge.", "available_at": ["Pharmanova", "Link Pharmacy", "Hospital pharmacies"]},
    {"id": "insulin-glargine", "name": "Insulin Glargine (Lantus)", "category": "medication", "subcategory": "diabetes", "pack": "3 ml pen", "price_low": 350, "price_high": 700, "note": "Long acting; one injection daily.", "available_at": ["Pharmanova", "Link Pharmacy", "Specialist pharmacies"]},
    # BP meds
    {"id": "amlodipine-5", "name": "Amlodipine 5 mg", "category": "medication", "subcategory": "bp", "pack": "30 tablets", "price_low": 30, "price_high": 70, "note": "Calcium channel blocker; once daily.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus", "Government clinics (free)"]},
    {"id": "amlodipine-10", "name": "Amlodipine 10 mg", "category": "medication", "subcategory": "bp", "pack": "30 tablets", "price_low": 40, "price_high": 90, "note": "Higher dose if 5 mg insufficient.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus"]},
    {"id": "enalapril-10", "name": "Enalapril 10 mg", "category": "medication", "subcategory": "bp", "pack": "30 tablets", "price_low": 30, "price_high": 70, "note": "ACE inhibitor. Dry cough is common.", "available_at": ["Pharmanova", "Link Pharmacy", "Government clinics (free)"]},
    {"id": "losartan-50", "name": "Losartan 50 mg", "category": "medication", "subcategory": "bp", "pack": "30 tablets", "price_low": 40, "price_high": 100, "note": "ARB; good alternative if cough from ACE.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus"]},
    {"id": "hctz-25", "name": "Hydrochlorothiazide 25 mg", "category": "medication", "subcategory": "bp", "pack": "30 tablets", "price_low": 20, "price_high": 50, "note": "Diuretic; take in the morning.", "available_at": ["Pharmanova", "Link Pharmacy", "Government clinics (free)"]},
    {"id": "atenolol-50", "name": "Atenolol 50 mg", "category": "medication", "subcategory": "bp", "pack": "30 tablets", "price_low": 30, "price_high": 70, "note": "Beta blocker.", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "nifedipine-sr-20", "name": "Nifedipine SR 20 mg", "category": "medication", "subcategory": "bp", "pack": "30 tablets", "price_low": 50, "price_high": 120, "note": "Slow-release CCB.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus"]},
    {"id": "aspirin-75", "name": "Aspirin 75 mg", "category": "medication", "subcategory": "bp", "pack": "30 tablets", "price_low": 15, "price_high": 40, "note": "Discuss with your doctor before starting.", "available_at": ["Any pharmacy"]},

    # Glucose testing kits
    {"id": "accu-chek-active", "name": "Glucometer — Accu-Chek Active", "category": "testing", "subcategory": "glucose_meter", "pack": "1 meter", "price_low": 350, "price_high": 600, "note": "Reliable, widely available in Zambia.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus", "MedPlus"]},
    {"id": "onetouch-select", "name": "Glucometer — OneTouch Select Plus", "category": "testing", "subcategory": "glucose_meter", "pack": "1 meter", "price_low": 400, "price_high": 700, "note": "Simple interface, big display.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus"]},
    {"id": "contour-plus", "name": "Glucometer — Contour Plus", "category": "testing", "subcategory": "glucose_meter", "pack": "1 meter", "price_low": 400, "price_high": 650, "note": "Second-chance sampling helps strip waste.", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "accu-chek-strips", "name": "Test strips — Accu-Chek Active (50)", "category": "testing", "subcategory": "glucose_strips", "pack": "50 strips", "price_low": 350, "price_high": 500, "note": "Match strips to your meter brand.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus"]},
    {"id": "onetouch-strips", "name": "Test strips — OneTouch (50)", "category": "testing", "subcategory": "glucose_strips", "pack": "50 strips", "price_low": 400, "price_high": 550, "note": "Only for OneTouch meters.", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "contour-strips", "name": "Test strips — Contour Plus (50)", "category": "testing", "subcategory": "glucose_strips", "pack": "50 strips", "price_low": 400, "price_high": 550, "note": "", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "lancets-100", "name": "Lancets (100 pack)", "category": "testing", "subcategory": "lancets", "pack": "100 lancets", "price_low": 80, "price_high": 150, "note": "Single-use. Dispose safely.", "available_at": ["Any pharmacy"]},
    {"id": "lancing-device", "name": "Lancing device", "category": "testing", "subcategory": "lancets", "pack": "1 device", "price_low": 80, "price_high": 200, "note": "Usually comes with new glucometer.", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "ketone-strips", "name": "Ketone strips (urine)", "category": "testing", "subcategory": "ketone", "pack": "50 strips", "price_low": 60, "price_high": 150, "note": "Use when glucose stays very high.", "available_at": ["Pharmanova", "Link Pharmacy", "Hospital pharmacies"]},
    {"id": "hba1c-home", "name": "HbA1c home test", "category": "testing", "subcategory": "hba1c", "pack": "1 test", "price_low": 350, "price_high": 700, "note": "Lab test still preferred where available.", "available_at": ["Pharmanova", "Private labs"]},

    # BP monitors
    {"id": "omron-m2", "name": "BP monitor — Omron M2 Basic", "category": "monitor", "subcategory": "bp_monitor", "pack": "1 monitor", "price_low": 600, "price_high": 900, "note": "Reliable upper-arm digital.", "available_at": ["Pharmanova", "Link Pharmacy", "Health Plus"]},
    {"id": "omron-m3", "name": "BP monitor — Omron M3", "category": "monitor", "subcategory": "bp_monitor", "pack": "1 monitor", "price_low": 900, "price_high": 1400, "note": "Stores readings; good for home use.", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "beurer-bm26", "name": "BP monitor — Beurer BM26", "category": "monitor", "subcategory": "bp_monitor", "pack": "1 monitor", "price_low": 500, "price_high": 800, "note": "Budget-friendly upper-arm.", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "microlife-a2", "name": "BP monitor — Microlife BP A2", "category": "monitor", "subcategory": "bp_monitor", "pack": "1 monitor", "price_low": 700, "price_high": 1100, "note": "Afib detection on some models.", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "manual-sphyg", "name": "Manual sphygmomanometer + stethoscope", "category": "monitor", "subcategory": "bp_monitor", "pack": "1 set", "price_low": 400, "price_high": 700, "note": "For trained users (nurses, clinicians).", "available_at": ["Medical supply shops"]},

    # Supplies
    {"id": "insulin-syringes", "name": "Insulin syringes (BD 100-pack)", "category": "testing", "subcategory": "injection", "pack": "100 syringes", "price_low": 120, "price_high": 220, "note": "0.5 ml or 1 ml, 29/30 gauge.", "available_at": ["Pharmanova", "Link Pharmacy", "Hospital pharmacies"]},
    {"id": "pen-needles", "name": "Pen needles (100 pack)", "category": "testing", "subcategory": "injection", "pack": "100 needles", "price_low": 150, "price_high": 300, "note": "For insulin pen devices.", "available_at": ["Pharmanova", "Link Pharmacy"]},
    {"id": "glucose-tablets", "name": "Glucose tablets (10 pack)", "category": "testing", "subcategory": "hypo_rescue", "pack": "10 tablets", "price_low": 25, "price_high": 60, "note": "For quick hypo rescue — keep in bag.", "available_at": ["Pharmanova", "Link Pharmacy", "Shoprite"]},
    {"id": "sharps-bin", "name": "Sharps disposal bin (small)", "category": "testing", "subcategory": "injection", "pack": "1 bin", "price_low": 60, "price_high": 150, "note": "Safe disposal of needles/lancets.", "available_at": ["Pharmanova", "Link Pharmacy"]},
]

ZAMBIA_PHARMACIES_SEED = [
    {"name": "Pharmanova", "note": "Nationwide chain. Branches in Lusaka, Ndola, Kitwe, Livingstone.", "phone": "+260211254022", "whatsapp": "+260971254022"},
    {"name": "Link Pharmacy", "note": "Nationwide chain with 24-hour branches in Lusaka.", "phone": "+260211253331", "whatsapp": "+260977791791"},
    {"name": "Health Plus Pharmacy", "note": "Lusaka and Copperbelt branches.", "phone": "+260211844001", "whatsapp": None},
    {"name": "Shoprite Pharmacy", "note": "In-store pharmacies at Shoprite outlets.", "phone": None, "whatsapp": None},
    {"name": "MedPlus Pharmacy", "note": "Lusaka branches, competitive prices.", "phone": "+260211846580", "whatsapp": None},
    {"name": "CashPlus Pharmacy", "note": "Budget-friendly outlets in Lusaka.", "phone": None, "whatsapp": None},
    {"name": "UTH Pharmacy", "note": "University Teaching Hospital — subsidized for inpatients.", "phone": "+260211254421", "whatsapp": None},
    {"name": "Government clinics", "note": "Essential meds often free at MoH clinics (availability varies).", "phone": "991", "whatsapp": None},
    {"name": "ZDA Clinic Pharmacy", "note": "Zambia Diabetes Association — diabetes-focused supplies.", "phone": "+260211237575", "whatsapp": "+260977237575"},
]


class PharmacySubmitIn(BaseModel):
    name: str
    note: Optional[str] = ""
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    branch: Optional[str] = None  # branch name/location if specific branch


class PharmacyAdminIn(BaseModel):
    name: str
    note: Optional[str] = ""
    phone: Optional[str] = None
    whatsapp: Optional[str] = None


@api_router.get("/pharmacy/items")
async def pharmacy_items(category: Optional[str] = None, q: Optional[str] = None):
    items = PHARMACY_ITEMS
    if category and category != "all":
        items = [i for i in items if i["category"] == category]
    if q:
        qq = q.lower().strip()
        items = [i for i in items if qq in i["name"].lower() or qq in i.get("note", "").lower()]
    return items


@api_router.get("/pharmacy/stockists")
async def pharmacy_stockists():
    """Return approved pharmacies with contact details."""
    cursor = db.pharmacies.find(
        {"status": "approved"},
        {"_id": 0, "submitted_by": 0, "admin_note": 0},
    ).sort("created_at", 1)
    return await cursor.to_list(length=200)


@api_router.post("/pharmacy/submit")
async def pharmacy_submit(input: PharmacySubmitIn, current_user: dict = Depends(get_current_user)):
    """Any logged-in user can suggest a pharmacy / branch. Awaits admin approval."""
    name = (input.name or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Pharmacy name is required")
    phone = (input.phone or "").strip() or None
    whatsapp = (input.whatsapp or "").strip() or None
    if not phone and not whatsapp:
        raise HTTPException(status_code=400, detail="Add at least a phone number or WhatsApp number")

    note = (input.note or "").strip()
    branch = (input.branch or "").strip()
    if branch:
        note = f"Branch: {branch}" + (f" — {note}" if note else "")

    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "note": note,
        "phone": phone,
        "whatsapp": whatsapp,
        "status": "pending",
        "source": "user",
        "submitted_by": current_user["id"],
        "submitter_phone": current_user.get("phone"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.pharmacy_submissions.insert_one(doc)
    return {"ok": True, "id": doc["id"], "status": "pending"}


@api_router.get("/pharmacy/submissions/mine")
async def my_submissions(current_user: dict = Depends(get_current_user)):
    cursor = db.pharmacy_submissions.find(
        {"submitted_by": current_user["id"]},
        {"_id": 0, "submitted_by": 0, "submitter_phone": 0},
    ).sort("created_at", -1)
    return await cursor.to_list(length=100)


# -------------------- Admin --------------------
@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    users_count = await db.users.count_documents({"deleted_at": {"$exists": False}})
    pharms_count = await db.pharmacies.count_documents({"status": "approved"})
    pending_count = await db.pharmacy_submissions.count_documents({"status": "pending"})
    readings_count = await db.glucose_readings.count_documents({"deleted_at": {"$exists": False}})
    bp_count = await db.bp_readings.count_documents({"deleted_at": {"$exists": False}})
    return {
        "users": users_count,
        "pharmacies": pharms_count,
        "pending_submissions": pending_count,
        "glucose_readings": readings_count,
        "bp_readings": bp_count,
    }


@api_router.get("/admin/submissions")
async def admin_list_submissions(status: str = "pending", admin: dict = Depends(require_admin)):
    cursor = db.pharmacy_submissions.find(
        {"status": status},
        {"_id": 0},
    ).sort("created_at", -1)
    return await cursor.to_list(length=500)


@api_router.post("/admin/submissions/{sid}/approve")
async def admin_approve_submission(sid: str, admin: dict = Depends(require_admin)):
    sub = await db.pharmacy_submissions.find_one({"id": sid, "status": "pending"})
    if not sub:
        raise HTTPException(status_code=404, detail="Pending submission not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    pharm_doc = {
        "id": str(uuid.uuid4()),
        "name": sub["name"],
        "note": sub.get("note", ""),
        "phone": sub.get("phone"),
        "whatsapp": sub.get("whatsapp"),
        "status": "approved",
        "source": "user",
        "submitted_by": sub.get("submitted_by"),
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.pharmacies.insert_one(pharm_doc)
    await db.pharmacy_submissions.update_one(
        {"id": sid},
        {"$set": {"status": "approved", "approved_at": now_iso, "pharmacy_id": pharm_doc["id"]}},
    )
    return {"ok": True, "pharmacy_id": pharm_doc["id"]}


@api_router.post("/admin/submissions/{sid}/reject")
async def admin_reject_submission(sid: str, admin: dict = Depends(require_admin)):
    now_iso = datetime.now(timezone.utc).isoformat()
    r = await db.pharmacy_submissions.update_one(
        {"id": sid, "status": "pending"},
        {"$set": {"status": "rejected", "rejected_at": now_iso}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pending submission not found")
    return {"ok": True}


@api_router.get("/admin/pharmacies")
async def admin_list_pharmacies(admin: dict = Depends(require_admin)):
    cursor = db.pharmacies.find({}, {"_id": 0}).sort("name", 1)
    return await cursor.to_list(length=500)


@api_router.post("/admin/pharmacies")
async def admin_add_pharmacy(input: PharmacyAdminIn, admin: dict = Depends(require_admin)):
    name = (input.name or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Name is required")
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "note": (input.note or "").strip(),
        "phone": (input.phone or "").strip() or None,
        "whatsapp": (input.whatsapp or "").strip() or None,
        "status": "approved",
        "source": "admin",
        "submitted_by": admin["id"],
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.pharmacies.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@api_router.put("/admin/pharmacies/{pid}")
async def admin_update_pharmacy(pid: str, input: PharmacyAdminIn, admin: dict = Depends(require_admin)):
    update = {
        "name": (input.name or "").strip(),
        "note": (input.note or "").strip(),
        "phone": (input.phone or "").strip() or None,
        "whatsapp": (input.whatsapp or "").strip() or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if len(update["name"]) < 2:
        raise HTTPException(status_code=400, detail="Name is required")
    r = await db.pharmacies.update_one({"id": pid}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pharmacy not found")
    return {"ok": True}


@api_router.delete("/admin/pharmacies/{pid}")
async def admin_delete_pharmacy(pid: str, admin: dict = Depends(require_admin)):
    r = await db.pharmacies.delete_one({"id": pid})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pharmacy not found")
    return {"ok": True}


# -------------------- Mount + CORS --------------------
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def seed_defaults():
    """Seed admin user and default pharmacies with contact info if DB is empty."""
    try:
        # Seed admin user
        admin_phone = "+260000000000"
        admin_passcode = "9999"
        existing_admin = await db.users.find_one({"phone": admin_phone})
        if not existing_admin:
            admin_doc = {
                "id": str(uuid.uuid4()),
                "phone": admin_phone,
                "name": "ZedPulse Admin",
                "passcode_hash": hash_passcode(admin_passcode),
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.users.insert_one(admin_doc)
            logger.info("Seeded admin user %s", admin_phone)
        else:
            # Ensure role is admin
            if existing_admin.get("role") != "admin":
                await db.users.update_one({"phone": admin_phone}, {"$set": {"role": "admin"}})

        # Backfill role for any existing user missing it
        await db.users.update_many({"role": {"$exists": False}}, {"$set": {"role": "user"}})

        # Backfill referral_code for any existing user missing it
        import random, string
        missing_users = db.users.find({"referral_code": {"$exists": False}, "deleted_at": {"$exists": False}})
        async for mu in missing_users:
            for _ in range(10):
                c = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
                if not await db.users.find_one({"referral_code": c}):
                    await db.users.update_one({"id": mu["id"]}, {"$set": {"referral_code": c, "invites_count": 0}})
                    break

        # Seed pharmacies (only if none exist)
        existing_count = await db.pharmacies.count_documents({})
        if existing_count == 0:
            now_iso = datetime.now(timezone.utc).isoformat()
            docs = []
            for p in ZAMBIA_PHARMACIES_SEED:
                docs.append({
                    "id": str(uuid.uuid4()),
                    "name": p["name"],
                    "note": p.get("note", ""),
                    "phone": p.get("phone"),
                    "whatsapp": p.get("whatsapp"),
                    "status": "approved",
                    "source": "seed",
                    "submitted_by": None,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                })
            if docs:
                await db.pharmacies.insert_many(docs)
                logger.info("Seeded %d default pharmacies", len(docs))
    except Exception as e:
        logger.exception("Seed defaults failed: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
