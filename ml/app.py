# ml/app.py
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import joblib, os, pandas as pd, math
from datetime import datetime, timedelta

APP_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(APP_DIR, "seed_models", "tfidf_lr.joblib")

app = FastAPI(title="ServicePulse ML microservice")
model = None
try:
    model = joblib.load(MODEL_PATH)
    print("Loaded TFIDF+LR model from", MODEL_PATH)
except Exception as e:
    print("Model not found or failed to load. Running in rule-based fallback mode.", e)
    model = None

CATEGORY_KEYWORDS = {
    "plumbing": ["leak", "water", "pipe", "plumber", "drain", "seep"],
    "electrical": ["light", "flicker", "power", "wiring", "socket", "electrical", "short"],
    "pest": ["rat", "rodent", "cockroach", "rodents", "pest", "mosquito", "insect"],
    "housekeeping": ["clean", "cleaning", "sweep", "mop", "garbage", "trash"],
    "cleaning": ["waterlogging", "drainage", "blocked", "overflow"],
    "security": ["lock", "security", "guard", "intruder", "breakin", "gate"]
}

def rule_classify(text: str):
    txt = text.lower()
    scores = {}
    for cat, kws in CATEGORY_KEYWORDS.items():
        score = 0
        for kw in kws:
            if kw in txt:
                score += 1
        if score > 0:
            scores[cat] = score
    if scores:
        best = max(scores.items(), key=lambda x: x[1])
        total = sum(scores.values())
        conf = min(0.95, 0.5 + (best[1] / (total + 1)) * 0.5)
        top_k = sorted([{"category":k, "score": v/total} for k,v in scores.items()], key=lambda x: -x["score"])
        return best[0], conf, top_k
    return "general", 0.35, [{"category":"general","score":1.0}]

class ClassifyIn(BaseModel):
    text: str

class ClassifyOut(BaseModel):
    category: str
    confidence: float
    top_k: List[Dict[str, Any]]

@app.post("/ml/classify-complaint", response_model=ClassifyOut)
def classify_complaint(payload: ClassifyIn):
    text = payload.text or ""
    if model is not None:
        try:
            proba = model.predict_proba([text])[0]
            classes = model.classes_
            ranked = sorted(zip(classes, proba), key=lambda x: -x[1])
            category, confidence = ranked[0]
            top_k = [{"category":c, "score":float(p)} for c,p in ranked[:5]]
            return {"category": category, "confidence": float(confidence), "top_k": top_k}
        except Exception as e:
            pass
    cat, conf, top_k = rule_classify(text)
    return {"category": cat, "confidence": float(conf), "top_k": top_k}

# chat
class ChatIn(BaseModel):
    session_id: str
    message: str

class ChatOut(BaseModel):
    reply: str
    suggested_category: Optional[str] = None
    prefill: Optional[Dict[str,str]] = None
    urgency: Optional[str] = None

@app.post("/ml/chat", response_model=ChatOut)
def chat(payload: ChatIn):
    msg = (payload.message or "").lower()
    suggested_category = None
    urgency = "low"
    for cat, kws in CATEGORY_KEYWORDS.items():
        for kw in kws:
            if kw in msg:
                suggested_category = cat
                break
        if suggested_category:
            break
    if any(x in msg for x in ["urgent", "now", "immediately", "asap", "emergency"]):
        urgency = "high"
    elif any(x in msg for x in ["soon", "tomorrow", "today"]):
        urgency = "medium"
    title = msg[:60].capitalize() + ("..." if len(msg) > 60 else "")
    description = payload.message
    reply = f"I understand — this sounds like a {suggested_category or 'general'} issue. Is it located in a particular block/apartment? Also, is this urgent?"
    return {"reply": reply, "suggested_category": suggested_category, "prefill": {"title": title, "description": description}, "urgency": urgency}
