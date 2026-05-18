from __future__ import annotations

import os
import json
import math
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
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import BaseModel, Field
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
from backend.memory import SessionMemoryStore
from backend.models import User, UserConversationHistory, UserLongTermMemory, UserSavedItem

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
_session_memory = SessionMemoryStore()
_memory_embeddings = None


def _get_memory_embeddings():
    global _memory_embeddings
    if _memory_embeddings is None:
        model = os.getenv("MEMORY_EMBEDDING_MODEL", "text-embedding-3-small")
        _memory_embeddings = OpenAIEmbeddings(model=model)
    return _memory_embeddings


def _embed_text(text: str) -> Optional[List[float]]:
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    try:
        return _get_memory_embeddings().embed_query(cleaned)
    except Exception as exc:
        print(f"[memory] Embedding generation failed: {exc}")
        return None


def _cosine_similarity(vec_a: Optional[List[float]], vec_b: Optional[List[float]]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return -1.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return -1.0
    return dot / (norm_a * norm_b)


def _memory_to_context_block(memories: List[UserLongTermMemory]) -> str:
    if not memories:
        return ""
    lines = []
    for memory in memories:
        prefix = f"[{memory.memory_type}]"
        suffix = f" (confidence={memory.confidence:.2f})" if memory.confidence is not None else ""
        lines.append(f"{prefix} {memory.memory_text}{suffix}")
    return "Relevant long-term user preferences:\n" + "\n".join(lines)


def _retrieve_relevant_memories(
    db: Session,
    *,
    user_id: int,
    query_text: str,
    limit: int = 3,
) -> List[UserLongTermMemory]:
    query_embedding = _embed_text(query_text)
    if not query_embedding:
        return []

    memories = (
        db.query(UserLongTermMemory)
        .filter(UserLongTermMemory.user_id == user_id)
        .order_by(UserLongTermMemory.updated_at.desc())
        .all()
    )

    ranked = []
    for memory in memories:
        score = _cosine_similarity(query_embedding, memory.embedding_json)
        if score >= 0:
            ranked.append((score, memory))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return [memory for _, memory in ranked[:limit]]


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
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    search_results: List[dict] = []
    user_id: Optional[int] = None
    session_id: Optional[str] = None
    memory_backend: Optional[str] = None
    cached_turn_count: Optional[int] = None
    retrieved_memories: List[dict] = []


class UploadResponse(BaseModel):
    image_url: str


class MemorySessionResponse(BaseModel):
    session_id: str
    summary: str
    turns: List[dict]
    review_entries: List[dict] = []
    turn_count: int
    backend: str


class MemorySearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: int = Field(default=3, ge=1, le=10)


class MemoryItemResponse(BaseModel):
    id: int
    memory_type: str
    memory_text: str
    confidence: float
    source_session_id: Optional[str] = None
    metadata_json: Optional[dict] = None


class StyleSummaryResponse(BaseModel):
    summary: str
    memories_count: int
    source_memories: List[MemoryItemResponse] = []


class SavedItemCreateRequest(BaseModel):
    product_id: str
    product_name: str
    product_image_url: str
    product_category: Optional[str] = None
    product_gender: Optional[str] = None
    search_keyword: Optional[str] = None
    product_payload_json: Optional[dict] = None


class SavedItemResponse(BaseModel):
    id: int
    product_id: str
    product_name: str
    product_image_url: str
    product_category: Optional[str] = None
    product_gender: Optional[str] = None
    search_keyword: Optional[str] = None
    product_payload_json: Optional[dict] = None


class SavedItemRestoreResponse(BaseModel):
    saved_item_id: int
    retrieval_mode: str
    garment_image_url: str
    product: dict


def _persist_conversation_row(
    db: Session,
    *,
    user_id: int,
    session_id: str,
    turn_index: int,
    role: str,
    message_text: str,
    products: Optional[List[dict]] = None,
) -> None:
    db.add(UserConversationHistory(
        user_id=user_id,
        session_id=session_id,
        turn_index=turn_index,
        role=role,
        message_text=message_text,
        products_json=products,
    ))


def _flush_session_to_long_term_memory(
    db: Session,
    *,
    current_user: User,
    session_id: Optional[str],
) -> MemorySessionResponse:
    snapshot = _session_memory.clear_session(current_user.id, session_id)
    if snapshot.summary.strip():
        memory_text = snapshot.summary.strip()
        db.add(UserLongTermMemory(
            user_id=current_user.id,
            memory_type="style_preference",
            memory_text=memory_text,
            source_session_id=snapshot.session_id,
            source_window_start=max(snapshot.turn_count - len(snapshot.turns) + 1, 1) if snapshot.turn_count else None,
            source_window_end=snapshot.turn_count or None,
            confidence=0.6,
            embedding_json=_embed_text(memory_text),
            metadata_json={
                "memory_backend": snapshot.backend,
                "cached_turns_flushed": len(snapshot.turns),
            },
        ))
        db.commit()

    return MemorySessionResponse(
        session_id=snapshot.session_id,
        summary=snapshot.summary,
        turns=snapshot.turns,
        review_entries=snapshot.review_entries,
        turn_count=snapshot.turn_count,
        backend=snapshot.backend,
    )


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
    db: Session = Depends(get_db),
) -> ChatResponse:
    # Build a context-aware message that includes frontend history and cached session memory.
    history_text = ""
    if req.history:
        for msg in req.history[-6:]:
            prefix = "User" if msg.role == "user" else "Assistant"
            history_text += f"{prefix}: {msg.content}\n"

    memory_text = ""
    relevant_memories: List[UserLongTermMemory] = []
    if current_user:
        memory_text = _session_memory.build_context_block(current_user.id, req.session_id)
        relevant_memories = _retrieve_relevant_memories(
            db,
            user_id=current_user.id,
            query_text=req.message,
            limit=3,
        )

    context_prefix = ""
    long_term_memory_text = _memory_to_context_block(relevant_memories)
    if long_term_memory_text:
        context_prefix += f"{long_term_memory_text}\n\n"
    if memory_text:
        context_prefix += f"{memory_text}\n\n"

    full_message = (
        f"{context_prefix}{history_text}User: {req.message}" if (context_prefix or history_text) else req.message
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

    session_id = req.session_id or "primary"
    cached_turn_count = None
    memory_backend = None

    if current_user:
        snapshot = _session_memory.remember_exchange(
            user_id=current_user.id,
            session_id=session_id,
            user_message=req.message,
            assistant_message=response_text,
            search_results=search_results,
        )
        memory_backend = snapshot.backend
        cached_turn_count = snapshot.turn_count

        _persist_conversation_row(
            db,
            user_id=current_user.id,
            session_id=snapshot.session_id,
            turn_index=max(snapshot.turn_count * 2 - 1, 1),
            role="user",
            message_text=req.message,
        )
        _persist_conversation_row(
            db,
            user_id=current_user.id,
            session_id=snapshot.session_id,
            turn_index=max(snapshot.turn_count * 2, 2),
            role="assistant",
            message_text=response_text,
            products=search_results,
        )
        db.commit()

    return ChatResponse(
        response=response_text,
        search_results=search_results,
        user_id=current_user.id if current_user else None,
        session_id=session_id if current_user else None,
        memory_backend=memory_backend,
        cached_turn_count=cached_turn_count,
        retrieved_memories=[
            {
                "id": memory.id,
                "memory_type": memory.memory_type,
                "memory_text": memory.memory_text,
                "confidence": memory.confidence,
            }
            for memory in relevant_memories
        ],
    )


def _saved_item_to_response(item: UserSavedItem) -> SavedItemResponse:
    return SavedItemResponse(
        id=item.id,
        product_id=item.product_id,
        product_name=item.product_name,
        product_image_url=item.product_image_url,
        product_category=item.product_category,
        product_gender=item.product_gender,
        search_keyword=item.search_keyword,
        product_payload_json=item.product_payload_json,
    )


def _build_long_term_style_summary(memories: List[UserLongTermMemory]) -> str:
    if not memories:
        return ""

    prompt_lines = [
        f"- [{memory.memory_type}] {memory.memory_text} (confidence={memory.confidence:.2f})"
        for memory in memories[:12]
    ]

    try:
        model = ChatOpenAI(
            model=os.getenv("MEMORY_SUMMARY_MODEL", "gpt-4.1-mini"),
            temperature=0.2,
        )
        response = model.invoke([
            {
                "role": "user",
                "content": (
                    "Summarize this user's long-term fashion preferences into a concise style profile. "
                    "Focus on silhouette, palette, occasions, formality, and recurring aesthetic cues. "
                    "Return one short paragraph followed by three short lines of concrete style traits.\n\n"
                    + "\n".join(prompt_lines)
                ),
            }
        ])
        content = getattr(response, "content", "")
        if isinstance(content, str) and content.strip():
            return content.strip()
    except Exception as exc:
        print(f"[memory] Style summary generation failed: {exc}")

    return "\n".join(prompt_lines)


def _restore_saved_item_product(saved_item: UserSavedItem) -> SavedItemRestoreResponse:
    agent = _get_agent()
    retrieval_mode = "saved_url"
    product = agent.get_product_by_id(saved_item.product_id)

    if product is None:
        product = agent.get_product_by_name(saved_item.product_name)
        retrieval_mode = "csv_name_match"

    if product is None:
        query_text = saved_item.search_keyword or saved_item.product_name
        search_results = agent.search_products(
            query=query_text,
            category=saved_item.product_category,
            limit=1,
        )
        if search_results:
            product = search_results[0]
            retrieval_mode = "clip_retrieval"

    if product is None:
        return SavedItemRestoreResponse(
            saved_item_id=saved_item.id,
            retrieval_mode="saved_url_fallback",
            garment_image_url=saved_item.product_image_url,
            product={
                "image_id": saved_item.product_id,
                "title": saved_item.product_name,
                "image_url": saved_item.product_image_url,
                "metadata": saved_item.product_payload_json or {},
            },
        )

    return SavedItemRestoreResponse(
        saved_item_id=saved_item.id,
        retrieval_mode=retrieval_mode,
        garment_image_url=product.image_url,
        product=product.model_dump(),
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


@app.get("/api/memory/session", response_model=MemorySessionResponse)
def get_memory_session(
    session_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
) -> MemorySessionResponse:
    snapshot = _session_memory.get_snapshot(current_user.id, session_id)
    return MemorySessionResponse(
        session_id=snapshot.session_id,
        summary=snapshot.summary,
        turns=snapshot.turns,
        review_entries=snapshot.review_entries,
        turn_count=snapshot.turn_count,
        backend=snapshot.backend,
    )


@app.post("/api/memory/session/flush", response_model=MemorySessionResponse)
def flush_memory_session(
    session_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemorySessionResponse:
    return _flush_session_to_long_term_memory(
        db,
        current_user=current_user,
        session_id=session_id,
    )


@app.post("/api/memory/search", response_model=List[MemoryItemResponse])
def search_memory(
    req: MemorySearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[MemoryItemResponse]:
    memories = _retrieve_relevant_memories(
        db,
        user_id=current_user.id,
        query_text=req.query,
        limit=req.limit,
    )
    return [
        MemoryItemResponse(
            id=memory.id,
            memory_type=memory.memory_type,
            memory_text=memory.memory_text,
            confidence=memory.confidence,
            source_session_id=memory.source_session_id,
            metadata_json=memory.metadata_json,
        )
        for memory in memories
    ]


@app.get("/api/memory/style-summary", response_model=StyleSummaryResponse)
def get_style_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StyleSummaryResponse:
    memories = (
        db.query(UserLongTermMemory)
        .filter(UserLongTermMemory.user_id == current_user.id)
        .order_by(UserLongTermMemory.updated_at.desc())
        .all()
    )

    return StyleSummaryResponse(
        summary=_build_long_term_style_summary(memories),
        memories_count=len(memories),
        source_memories=[
            MemoryItemResponse(
                id=memory.id,
                memory_type=memory.memory_type,
                memory_text=memory.memory_text,
                confidence=memory.confidence,
                source_session_id=memory.source_session_id,
                metadata_json=memory.metadata_json,
            )
            for memory in memories[:12]
        ],
    )


@app.get("/api/saved", response_model=List[SavedItemResponse])
def list_saved_items(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[SavedItemResponse]:
    items = (
        db.query(UserSavedItem)
        .filter(UserSavedItem.user_id == current_user.id)
        .order_by(UserSavedItem.created_at.desc())
        .all()
    )
    return [_saved_item_to_response(item) for item in items]


@app.post("/api/saved", response_model=SavedItemResponse)
def create_saved_item(
    payload: SavedItemCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedItemResponse:
    existing = (
        db.query(UserSavedItem)
        .filter(
            UserSavedItem.user_id == current_user.id,
            UserSavedItem.product_id == payload.product_id,
        )
        .first()
    )
    if existing:
        existing.product_name = payload.product_name
        existing.product_image_url = payload.product_image_url
        existing.product_category = payload.product_category
        existing.product_gender = payload.product_gender
        existing.search_keyword = payload.search_keyword
        existing.product_payload_json = payload.product_payload_json
        db.commit()
        db.refresh(existing)
        return _saved_item_to_response(existing)

    item = UserSavedItem(
        user_id=current_user.id,
        product_id=payload.product_id,
        product_name=payload.product_name,
        product_image_url=payload.product_image_url,
        product_category=payload.product_category,
        product_gender=payload.product_gender,
        search_keyword=payload.search_keyword,
        product_payload_json=payload.product_payload_json,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _saved_item_to_response(item)


@app.delete("/api/saved/{saved_item_id}")
def delete_saved_item(
    saved_item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    item = (
        db.query(UserSavedItem)
        .filter(
            UserSavedItem.id == saved_item_id,
            UserSavedItem.user_id == current_user.id,
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Saved item not found.")
    db.delete(item)
    db.commit()
    return {"deleted": True, "saved_item_id": saved_item_id}


@app.post("/api/saved/{saved_item_id}/restore", response_model=SavedItemRestoreResponse)
def restore_saved_item(
    saved_item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedItemRestoreResponse:
    item = (
        db.query(UserSavedItem)
        .filter(
            UserSavedItem.id == saved_item_id,
            UserSavedItem.user_id == current_user.id,
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Saved item not found.")
    return _restore_saved_item_product(item)
