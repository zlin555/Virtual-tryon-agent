"""
Virtual Try-On Agent — FastAPI backend

Exposes:
  POST /api/tryon          — run virtual try-on
  POST /api/agent/chat     — LangChain agent chat
  POST /api/upload-image   — upload an image file → get a public URL (via imgbb)

Run:
    uvicorn api:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import os
import threading
import urllib.request
import json
from typing import List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from main_framework import (
    AgentRequest,
    AgentDependencies,
    FashnTryOnService,
    ImageSearchService,
    SearchImageResult,
    TryOnInput,
    TryOnResult,
    VirtualTryOnAgent,
    VirtualTryOnOrchestrator,
    _resolve_tryon_service,
)

# ── Lightweight keyword search (no CLIP / no torch) ───────────────────────────
import pandas as pd

# Maps abstract style/aesthetic/occasion terms → concrete fashion keywords
# present in the Myntra dataset (productDisplayName, articleType, etc.).
# Terms mapped to [] are stop words — stripped before searching.
_STYLE_EXPAND: dict = {
    # Aesthetic styles
    "punk":        ["jacket", "jeans", "black", "t-shirt", "boots"],
    "streetwear":  ["hoodie", "graphic", "joggers", "casual", "track", "sneakers"],
    "edgy":        ["black", "jacket", "boots"],
    "grunge":      ["jeans", "jacket", "black", "boots"],
    "minimalist":  ["white", "grey", "solid", "cotton"],
    "minimal":     ["white", "grey", "solid", "cotton"],
    "classic":     ["white", "shirt", "jeans", "solid"],
    "boho":        ["floral", "printed", "kurta", "maxi"],
    "bohemian":    ["floral", "printed", "kurta", "maxi"],
    "preppy":      ["polo", "shirt", "blazer", "formal"],
    "romantic":    ["floral", "pink", "dress"],
    "sporty":      ["track", "sport", "jersey", "athletic"],
    "chic":        ["dress", "shirt", "smart"],
    "glamorous":   ["dress", "party", "formal"],
    "vintage":     ["printed", "retro", "classic", "floral"],
    "athleisure":  ["track", "sport", "joggers", "hoodie"],
    # Occasions → usage values in dataset
    "date":        ["party", "smart"],
    "night":       ["party", "evening"],
    "party":       ["party"],
    "office":      ["formal", "smart"],
    "everyday":    ["casual"],
    "weekend":     ["casual"],
    # Stop words — not meaningful for dataset search
    "style":       [], "aesthetic": [], "aesthetics": [], "look": [],
    "outfit":      [], "outfits":    [], "fashion":    [], "wear":  [],
    "vibe":        [], "based":      [], "love":        [], "like":  [],
    "prefer":      [], "recommend":  [], "i":           [], "my":    [],
    "me":          [], "the":        [], "a":           [], "an":    [],
    "and":         [], "or":         [], "for":         [], "with":  [],
    "on":          [], "in":         [], "at":          [], "of":    [],
    "is":          [], "that":       [], "this":        [], "these": [],
    "please":      [], "can":        [], "you":         [], "want":  [],
}


class KeywordSearchService(ImageSearchService):
    """Pandas-based keyword search over cleaned_data.csv.

    Searches productDisplayName, subCategory, articleType, baseColour, usage.
    Style/aesthetic terms are expanded via _STYLE_EXPAND so that e.g. 'punk'
    maps to real clothing vocabulary instead of matching product names literally.
    No ML model required — loads in < 1 second, zero GPU/RAM overhead.
    """

    def __init__(self, csv_path: str):
        self.df = pd.read_csv(csv_path)
        # Pre-build a lowercase searchable text column once
        self.df["_search"] = (
            self.df["productDisplayName"].fillna("").str.lower() + " " +
            self.df["subCategory"].fillna("").str.lower() + " " +
            self.df["articleType"].fillna("").str.lower() + " " +
            self.df["baseColour"].fillna("").str.lower() + " " +
            self.df["usage"].fillna("").str.lower()
        )

    def search_images(self, query: str, category: Optional[str] = None, limit: int = 6) -> list:
        # Expand style/aesthetic terms into concrete dataset vocabulary
        raw_tokens = query.lower().split()
        search_terms: list[str] = []
        for tok in raw_tokens:
            if tok in _STYLE_EXPAND:
                search_terms.extend(_STYLE_EXPAND[tok])   # may be [] (stop word)
            else:
                search_terms.append(tok)                  # keep literal token

        if not search_terms:   # everything was a stop word — fall back to original
            search_terms = raw_tokens

        # Score each row by number of matching terms (higher = better match)
        def _score(text: str) -> int:
            return sum(1 for t in search_terms if t in text)

        scores = self.df["_search"].apply(_score)
        mask = scores > 0
        filtered = self.df[mask].copy()
        filtered["_score"] = scores[mask]
        filtered = filtered.sort_values("_score", ascending=False)

        # Optional category filter
        if category and len(filtered) > 0:
            cat = category.lower()
            cat_mask = (
                filtered["subCategory"].fillna("").str.lower().str.contains(cat, na=False) |
                filtered["articleType"].fillna("").str.lower().str.contains(cat, na=False)
            )
            cat_filtered = filtered[cat_mask]
            if len(cat_filtered) > 0:
                filtered = cat_filtered

        # Take top-scoring pool then sample for variety
        pool = filtered.head(limit * 3)
        sample = pool.sample(min(limit, len(pool)), random_state=42) if len(pool) >= limit else pool

        results = []
        for _, row in sample.iterrows():
            results.append(SearchImageResult(
                image_id=str(row.get("id", "")),
                title=str(row.get("productDisplayName", "")),
                image_url=str(row.get("link", "")),
                source="kaggle_fashion_dataset_keyword",
                metadata={
                    "category": str(row.get("subCategory", "")),
                    "articleType": str(row.get("articleType", "")),
                    "color": str(row.get("baseColour", "")),
                    "usage": str(row.get("usage", "")),
                },
            ))
        return results


def _build_agent_lightweight() -> VirtualTryOnOrchestrator:
    deps = AgentDependencies(
        image_search_service=KeywordSearchService("./cleaned_data.csv"),
        tryon_service=_resolve_tryon_service(),
    )
    agent = VirtualTryOnAgent(model_name="gpt-4.1-mini", temperature=0.2).build(deps)
    return VirtualTryOnOrchestrator(agent)

# ── App init ─────────────────────────────────────────────────────────────────

app = FastAPI(title="Virtual Try-On Agent API")

# CORS: reads comma-separated origins from env, falls back to localhost dev
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:4173")
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Service init ──────────────────────────────────────────────────────────────

FASHN_KEY = os.getenv("FASHN_API_KEY", "")
if not FASHN_KEY:
    raise EnvironmentError("FASHN_API_KEY not set. Check your .env file.")

_tryon_svc = FashnTryOnService(api_key=FASHN_KEY)

# Background warm-up: CLIP model (~600MB) + FAISS index load is started in a
# daemon thread at server startup so the first chat request doesn't block for
# 60-120 s and time out. _agent_ready is set once loading completes.
_agent_app = None
_agent_ready = threading.Event()
_agent_load_error: Optional[Exception] = None


def _load_agent_background():
    global _agent_app, _agent_load_error
    try:
        print("[agent] Building lightweight keyword search agent…")
        _agent_app = _build_agent_lightweight()
        print("[agent] Ready.")
    except Exception as exc:
        _agent_load_error = exc
        print(f"[agent] Load failed: {exc}")
    finally:
        _agent_ready.set()


@app.on_event("startup")
def startup_event():
    t = threading.Thread(target=_load_agent_background, daemon=True)
    t.start()


def _get_agent():
    # Wait up to 300 s for CLIP + FAISS to finish loading
    loaded = _agent_ready.wait(timeout=300)
    if not loaded:
        raise HTTPException(status_code=503, detail="Agent is still loading. Please retry in a moment.")
    if _agent_load_error:
        raise HTTPException(status_code=500, detail=f"Agent failed to load: {_agent_load_error}")
    return _agent_app

# ── Request/response schemas ──────────────────────────────────────────────────

class TryOnRequest(BaseModel):
    person_image_url: str
    garment_image_url: str
    garment_type: Optional[str] = None
    size_hint: Optional[str] = None
    style_note: Optional[str] = None


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
    search_results: List[dict] = []


class UploadResponse(BaseModel):
    image_url: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/tryon", response_model=TryOnResult)
def run_tryon(req: TryOnRequest) -> TryOnResult:
    result = _tryon_svc.run_tryon(
        TryOnInput(
            person_image_url=req.person_image_url,
            garment_image_url=req.garment_image_url,
            garment_type=req.garment_type,
            size_hint=req.size_hint,
            style_note=req.style_note,
        )
    )
    return result


@app.post("/api/agent/chat", response_model=ChatResponse)
def agent_chat(req: ChatRequest) -> ChatResponse:
    # Build a context-aware message that includes recent history
    history_text = ""
    if req.history:
        for msg in req.history[-6:]:
            prefix = "User" if msg.role == "user" else "Assistant"
            history_text += f"{prefix}: {msg.content}\n"

    full_message = (
        f"{history_text}User: {req.message}" if history_text else req.message
    )

    try:
        # Invoke VirtualTryOnAgent directly to get all messages,
        # including ToolMessage objects containing real search results
        agent = _get_agent()
        raw = agent.agent.invoke(AgentRequest(user_message=full_message))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    messages = raw.get("messages", [])

    # ── Extract the last AI text response ────────────────────────────────────
    response_text = "No response returned."
    for msg in reversed(messages):
        msg_type = getattr(msg, "type", None) or (msg.get("type") if isinstance(msg, dict) else None)
        if msg_type == "ai":
            content = getattr(msg, "content", None) or (msg.get("content") if isinstance(msg, dict) else None)
            if isinstance(content, str) and content.strip():
                response_text = content
                break
            if isinstance(content, list):
                parts = [item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text"]
                joined = "\n".join(p for p in parts if p).strip()
                if joined:
                    response_text = joined
                    break

    # ── Extract search results from ToolMessage objects ───────────────────────
    search_results: List[dict] = []
    for msg in messages:
        msg_type = getattr(msg, "type", None) or (msg.get("type") if isinstance(msg, dict) else None)
        msg_name = getattr(msg, "name", None) or (msg.get("name") if isinstance(msg, dict) else None)
        if msg_type == "tool" and msg_name == "search_fashion_images":
            content = getattr(msg, "content", None) or (msg.get("content") if isinstance(msg, dict) else None)
            if isinstance(content, str):
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, list):
                        search_results.extend(parsed)
                except (json.JSONDecodeError, ValueError):
                    pass

    return ChatResponse(response=response_text, search_results=search_results)


@app.post("/api/upload-image", response_model=UploadResponse)
async def upload_image(file: UploadFile = File(...)) -> UploadResponse:
    """
    Accept a multipart image upload and return a public URL.
    - If IMGBB_API_KEY is set → uploads to imgbb (reliable, free tier 32MB)
    - Otherwise → uploads to 0x0.st (anonymous, no key required, 512MB limit)
    Both return a public URL accessible by FASHN API.
    """
    # Validate MIME type
    if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a JPEG, PNG, or WebP image.",
        )

    contents = await file.read()

    if len(contents) > 32 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 32 MB.")

    import base64
    import urllib.parse

    IMGBB_KEY = os.getenv("IMGBB_API_KEY", "")

    if IMGBB_KEY:
        # ── imgbb upload (key in query string, image as base64 in POST body) ──
        b64 = base64.b64encode(contents).decode("utf-8")
        encoded = urllib.parse.urlencode({"image": b64}).encode("utf-8")
        upload_url = f"https://api.imgbb.com/1/upload?key={urllib.parse.quote(IMGBB_KEY)}"
        try:
            req = urllib.request.Request(
                upload_url,
                data=encoded,
                headers={"User-Agent": "VirtualTryOnAgent/1.0"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            image_url = data["data"]["url"]
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"imgbb upload failed: {exc}")
    else:
        # ── Anonymous upload: try 0x0.st, fall back to litterbox.catbox.moe ──
        boundary = "formbound7A3F9C"
        content_type_header = file.content_type or "application/octet-stream"

        def _multipart_body(name: str, filename: str) -> bytes:
            return (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                f"Content-Type: {content_type_header}\r\n\r\n"
            ).encode() + contents + f"\r\n--{boundary}--\r\n".encode()

        image_url = None

        # 1st attempt — 0x0.st
        try:
            body = _multipart_body("file", "upload")
            req = urllib.request.Request(
                "https://0x0.st/",
                data=body,
                headers={
                    "Content-Type": f"multipart/form-data; boundary={boundary}",
                    "User-Agent": "VirtualTryOnAgent/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                image_url = resp.read().decode().strip()
        except Exception:
            pass  # fall through to litterbox

        # 2nd attempt — litterbox.catbox.moe (72-hour anonymous host)
        if not image_url:
            try:
                b2 = (
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="reqtype"\r\n\r\nfileupload\r\n'
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="time"\r\n\r\n72h\r\n'
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="fileToUpload"; filename="upload"\r\n'
                    f"Content-Type: {content_type_header}\r\n\r\n"
                ).encode() + contents + f"\r\n--{boundary}--\r\n".encode()
                req2 = urllib.request.Request(
                    "https://litterbox.catbox.moe/resources/internals/api.php",
                    data=b2,
                    headers={
                        "Content-Type": f"multipart/form-data; boundary={boundary}",
                        "User-Agent": "VirtualTryOnAgent/1.0",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req2, timeout=20) as resp2:
                    image_url = resp2.read().decode().strip()
            except Exception as exc2:
                raise HTTPException(status_code=502, detail=f"Image upload failed (both hosts unavailable): {exc2}")

        if not image_url:
            raise HTTPException(status_code=502, detail="Image upload failed: all upload services unavailable.")

    return UploadResponse(image_url=image_url)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/ready")
def ready():
    """Returns whether the CLIP+FAISS agent is loaded and ready."""
    return {"ready": _agent_ready.is_set() and _agent_load_error is None}
