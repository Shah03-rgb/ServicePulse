# ml/train_classify.py
import pandas as pd, os, joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

SEED = os.path.join(os.path.dirname(__file__), "..", "seed", "complaints_seed.csv")
OUT = os.path.join(os.path.dirname(__file__), "seed_models", "tfidf_lr.joblib")
df = pd.read_csv(SEED)
df = df.dropna(subset=["description","category"])
X = df["description"].astype(str).tolist()
y = df["category"].astype(str).tolist()
pipe = Pipeline([("tfidf", TfidfVectorizer(ngram_range=(1,2), max_features=5000)), ("clf", LogisticRegression(max_iter=500))])
pipe.fit(X,y)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
joblib.dump(pipe, OUT)
print("Model saved to", OUT)
