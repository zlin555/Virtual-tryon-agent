from __future__ import annotations

import os
import json
import threading
import urllib.request
from typing import List, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import (
    AuthRequest,
    TokenResponse,
    UserResponse,
    get_current_user,
    get_current_user_optional,
    login_user,
    register_user,
    user_to_response,
)
from backend.database import get_db, init_db
from backend.models import User

from backend.new_main_framework import (
    AgentRequest,
    TryOnInput,
    TryOnResult,
    build_app_agent,
    _resolve_tryon_service,
)

app = FastAPI(title="Virtual Try-On Agent API - CLIP FAISS")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:4173,*")
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_tryon_svc = _resolve_tryon_service()

_agent_app = None
_agent_ready = threading.Event()
_agent_load_error: Optional[Exception] = None


def _load_agent_background():
    global _agent_app, _agent_load_error
    try:
        print("[agent] Building CLIP + FAISS agent from backend.new_main_framework.build_app_agent()...")
        _agent_app = build_app_agent()
        print("[agent] Ready.")
    except Exception as exc:
        _agent_load_error = exc
        print(f"[agent] Load failed: {exc}")
    finally:
        _agent_ready.set()


@app.on_event("startup")
def startup_event():
    init_db()
    thread = threading.Thread(target=_load_agent_background, daemon=True)
    thread.start()


def _get_agent():
    loaded = _agent_ready.wait(timeout=300)
    if not loaded:
        raise HTTPException(status_code=503, detail="Agent is still loading. Please retry in a moment.")
    if _agent_load_error:
        raise HTTPException(status_code=500, detail=f"Agent failed to load: {_agent_load_error}")
    return _agent_app


class TryOnRequest(BaseModel):
    person_image_url: str
    garment_image_url: str
    garment_type: Optional[str] = None
    size_hint: Optional[str] = None
    style_note: Optional[str] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    style_image_url: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    search_results: List[dict] = []
    user_id: Optional[int] = None


class UploadResponse(BaseModel):
    image_url: str


@app.post("/api/auth/register", response_model=TokenResponse)
def register(payload: AuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
    return register_user(db, payload)


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: AuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
    return login_user(db, payload)


@app.get("/api/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return user_to_response(current_user)


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
def agent_chat(
    req: ChatRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> ChatResponse:
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
        raw = agent.agent.invoke(AgentRequest(
            user_message=full_message,
            style_image_url=req.style_image_url,
        ))
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

    return ChatResponse(
        response=response_text,
        search_results=search_results,
        user_id=current_user.id if current_user else None,
    )



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
    return {
        "status": "ok",
        "search": "original_product_retrieval_clip_faiss",
    }


@app.get("/api/ready")
def ready():
    return {
        "ready": _agent_ready.is_set() and _agent_load_error is None,
        "search": "original_product_retrieval_clip_faiss",
        "error": str(_agent_load_error) if _agent_load_error else None,
    }
