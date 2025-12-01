# ml_service.py
# Demo ML microservice: TF-IDF + Logistic Regression classifier + clustering
# Run: pip install fastapi uvicorn scikit-learn pandas numpy python-multipart joblib
# Then: uvicorn ml_service:app --reload --port 8001

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
import os
import numpy as np
import joblib

# sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.cluster import AgglomerativeClustering, KMeans

DATA_MODEL_DIR = "ml_models"
os.makedirs(DATA_MODEL_DIR, exist_ok=True)

app = FastAPI(title="ServicePulse ML (demo)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- simple labeled examples for quick demo training ---
# you can expand these later with more examples / real dataset
LABELLED_EXAMPLES = [
    ("Water leakage in kitchen sink, pipe leaking", "Plumbing"),
    ("Bathroom tap leaking and no water pressure", "Plumbing"),
    ("Power outage in living room after storm", "Electrical"),
    ("Light switch sparking when turning on", "Electrical"),
    ("Door hinge stuck, wood chipped", "Carpentry"),
    ("Kitchen cabinet loose, needs fixing", "Carpentry"),
    ("Entrance corridor lights not working", "Electrical"),
    ("House painting required at lobby", "Painting"),
    ("Housekeeping needed in basement", "Cleaning"),
    ("Housekeeping required in stairs and corridor", "Cleaning"),
    ("Security guard absent last night", "Security"),
    ("Strange person noticed near gate", "Security"),
    ("Broken tiles at balcony, needs repair", "Other"),
]

CATS = sorted(list({lab for _, lab in LABELLED_EXAMPLES}))

# Models container
VECT_PATH = os.path.join(DATA_MODEL_DIR, "tfidf_v1.joblib")
CLF_PATH = os.path.join(DATA_MODEL_DIR, "clf_lr_v1.joblib")

def train_demo_models():
    texts = [t for t, _ in LABELLED_EXAMPLES]
    labels = [l for _, l in LABELLED_EXAMPLES]
    vec = TfidfVectorizer(ngram_range=(1,2), min_df=1)
    X = vec.fit_transform(texts)
    clf = LogisticRegression(max_iter=1200)
    clf.fit(X, labels)
    joblib.dump(vec, VECT_PATH)
    joblib.dump(clf, CLF_PATH)
    return vec, clf

# load or train
if os.path.exists(VECT_PATH) and os.path.exists(CLF_PATH):
    try:
        vect = joblib.load(VECT_PATH)
        clf = joblib.load(CLF_PATH)
    except Exception:
        vect, clf = train_demo_models()
else:
    vect, clf = train_demo_models()


# Request/response schemas
class TextIn(BaseModel):
    text: str = ""

class TitleDescIn(BaseModel):
    title: Optional[str] = ""
    description: Optional[str] = ""

class ComplaintsIn(BaseModel):
    complaints: List[Dict[str, Any]]  # each item: { id?, title?, description?, ... }
    n_clusters: Optional[int] = None


# --- urgency heuristic helper (keyword-based) ---
def determine_urgency(text: str) -> str:
    t = (text or "").lower()
    # high-priority keywords
    high_kw = ["urgent", "immediately", "emergency", "danger", "fire", "electric shock", "short circuit", "no power", "gas leak", "cannot"]
    medium_kw = ["soon", "asap", "please", "priority", "leak", "blocked", "broken", "not working", "smoke"]
    # low-priority keywords
    low_kw = ["schedule", "whenever", "whenever convenient", "minor", "paint", "clean", "cosmetic"]

    if any(k in t for k in high_kw):
        return "High"
    if any(k in t for k in medium_kw):
        return "Medium"
    # fallback to Low
    return "Low"


# ------------------------------
# Endpoints
# ------------------------------

@app.post("/ml/predict_category")
def predict_category(req: TextIn):
    text = req.text or ""
    if text.strip() == "":
        raise HTTPException(status_code=400, detail="Empty text")
    X = vect.transform([text])
    # get probabilities if classifier supports it
    try:
        probs = clf.predict_proba(X)[0]
        classes = clf.classes_
        best_index = int(np.argmax(probs))
        return {
            "category": classes[best_index],
            "confidence": float(probs[best_index]),
            "candidates": [{ "label": classes[i], "prob": float(probs[i]) } for i in range(len(classes))]
        }
    except Exception:
        pred = clf.predict(X)[0]
        return {"category": pred, "confidence": 0.0, "candidates": [{"label": pred, "prob": 1.0}]}


@app.post("/predict")
def predict_title_desc(req: TitleDescIn):
    """
    New combined endpoint: returns predicted category (from classifier) and urgency (keyword heuristic).
    Accepts either 'title'+'description' or 'text' style payload (title+description concatenated).
    """
    title = (req.title or "").strip()
    desc = (req.description or "").strip()
    text = (title + " " + desc).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty title/description")

    # category prediction (use classifier)
    X = vect.transform([text])
    try:
        probs = clf.predict_proba(X)[0]
        classes = clf.classes_
        best_index = int(np.argmax(probs))
        category = classes[best_index]
        confidence = float(probs[best_index])
        candidates = [{ "label": classes[i], "prob": float(probs[i]) } for i in range(len(classes))]
    except Exception:
        category = clf.predict(X)[0]
        confidence = 0.0
        candidates = [{ "label": category, "prob": 1.0 }]

    # urgency via heuristic
    urgency = determine_urgency(text)

    return {
        "category": category,
        "urgency": urgency,
        "confidence": confidence,
        "candidates": candidates
    }


@app.post("/ml/cluster")
def cluster_complaints(req: ComplaintsIn):
    items = req.complaints or []
    if len(items) == 0:
        raise HTTPException(status_code=400, detail="No complaints provided")
    # build texts from title + description
    texts = []
    for c in items:
        t = (c.get("title") or "") + " " + (c.get("description") or "")
        texts.append(t.strip() if t.strip() else "empty")
    X = vect.transform(texts)  # TF-IDF
    n = req.n_clusters or min(6, max(1, len(items)//2))
    # if only 1 item, return single cluster
    if len(items) <= 1:
        return {"clusters": [{"cluster_id": 0, "members": [it.get("id") or idx for idx, it in enumerate(items)]}]}
    # use AgglomerativeClustering for small datasets, KMeans fallback
    try:
        if len(items) <= 6:
            algo = AgglomerativeClustering(n_clusters=n)
            labs = algo.fit_predict(X.toarray())
        else:
            algo = KMeans(n_clusters=n, random_state=42)
            labs = algo.fit_predict(X)
    except Exception:
        # fallback to trivial grouping: by predicted category
        labs = []
        preds = clf.predict(X)
        label_map = {}
        next_id = 0
        for p in preds:
            if p not in label_map:
                label_map[p] = next_id; next_id += 1
            labs.append(label_map[p])
        labs = np.array(labs)
    # collect clusters
    clusters = {}
    for idx, lab in enumerate(labs):
        clusters.setdefault(int(lab), []).append(items[idx].get("id") or idx)
    clusters_out = [{"cluster_id": k, "members": v} for k, v in clusters.items()]
    return {"clusters": clusters_out}

@app.get("/ml/labels")
def get_labels():
    return {"labels": list(clf.classes_)}

@app.post("/ml/diagnose")
def diagnose_text(req: TextIn):
    # helpful debug: return vectorized top features and predicted category
    X = vect.transform([req.text])
    probs = clf.predict_proba(X)[0]
    classes = clf.classes_
    best = classes[int(np.argmax(probs))]
    # return simple explain: top tfidf tokens in the doc
    feature_names = np.array(vect.get_feature_names_out())
    row = X.toarray()[0]
    top_idx = np.argsort(row)[::-1][:8]
    top_feats = [{"token": feature_names[i], "score": float(row[i])} for i in top_idx if row[i] > 0]
    return {"predicted": best, "confidence": float(max(probs)), "top_tokens": top_feats}
