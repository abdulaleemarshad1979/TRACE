"""TRACE authenticated operations and reporting API.

Run with GOOGLE_APPLICATION_CREDENTIALS and TRACE_DATABASE_URL. The dashboard
and Route app communicate directly with RTDB; this service handles admin tasks.
"""
import os
import time
from typing import Annotated

import firebase_admin
from firebase_admin import auth, credentials, db
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

def init_firebase():
    url = os.environ.get("TRACE_DATABASE_URL", "")
    if not url.startswith("https://"):
        raise RuntimeError("Set TRACE_DATABASE_URL to your Firebase Realtime Database HTTPS URL")
    try:
        firebase_admin.get_app()
    except ValueError:
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {"databaseURL": url})


app = FastAPI(title="TRACE operations API")


def principal(authorization: Annotated[str | None, Header()] = None):
    try:
        init_firebase()
    except Exception as exc:
        raise HTTPException(503, "Firebase is not configured on this server") from exc
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Firebase ID token required")
    try:
        claims = auth.verify_id_token(authorization[7:])
        uid = claims["uid"]
        role = db.reference(f"roles/{uid}").get()
    except Exception:
        raise HTTPException(401, "Invalid Firebase ID token")
    if role not in {"admin", "monitor", "route"}:
        raise HTTPException(403, "Account has no TRACE role")
    return {"uid": uid, "role": role}


def require_admin(user=Depends(principal)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin role required")
    return user


class Assignment(BaseModel):
    uid: str = Field(pattern=r"^[A-Za-z0-9_-]{8,128}$")
    sd: str = Field(max_length=100)
    ps: str = Field(min_length=1, max_length=100)
    route: str = Field(min_length=1, max_length=100)
    officer: str = Field(default="", max_length=100)
    mobile: str = Field(default="", max_length=25)


@app.get("/health")
def health():
    return {"status": "ok", "firebaseConfigured": bool(os.environ.get("TRACE_DATABASE_URL") and os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))}


@app.get("/fleet")
def fleet(user=Depends(principal)):
    if user["role"] == "route":
        raise HTTPException(403, "Monitor role required")
    devices = db.reference("devices").get() or {}
    live = db.reference("live").get() or {}
    return {"vehicles": [{"uid": uid, **meta, "live": live.get(uid, {})} for uid, meta in devices.items()]}


@app.get("/alerts")
def alerts(user=Depends(principal)):
    if user["role"] == "route":
        raise HTTPException(403, "Monitor role required")
    rows = db.reference("events").order_by_child("t").limit_to_last(100).get() or {}
    return {"alerts": [{"id": key, **value} for key, value in rows.items()
                       if value.get("type") == "sos" or (value.get("type") == "loc" and value.get("status") in {"tension", "problem"})]}


@app.get("/reports/summary")
def summary(user=Depends(principal)):
    if user["role"] == "route":
        raise HTTPException(403, "Monitor role required")
    now = int(time.time() * 1000)
    live = db.reference("live").get() or {}
    events = db.reference("events").order_by_child("t").start_at(now - 24 * 3600 * 1000).get() or {}
    return {
        "generatedAt": now,
        "unitsOnline": sum(1 for item in live.values() if now - item.get("up", 0) < 5 * 60 * 1000),
        "unitsNoSignal": sum(1 for item in live.values() if now - item.get("up", 0) >= 5 * 60 * 1000),
        "sos24h": sum(1 for item in events.values() if item.get("type") == "sos"),
        "locationReports24h": sum(1 for item in events.values() if item.get("type") == "loc"),
    }


@app.put("/assignments/{uid}")
def assign(uid: str, assignment: Assignment, _user=Depends(require_admin)):
    if uid != assignment.uid:
        raise HTTPException(400, "UID mismatch")
    db.reference(f"assignments/{uid}").set(assignment.model_dump(exclude={"uid"}))
    db.reference(f"roles/{uid}").set("route")
    return {"assigned": uid}
