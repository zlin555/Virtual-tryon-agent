from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from redis import Redis
except ImportError:  # pragma: no cover - optional dependency until installed
    Redis = None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class SessionSnapshot:
    session_id: str
    summary: str
    turns: List[dict]
    review_entries: List[dict]
    turn_count: int
    backend: str


class SessionMemoryStore:
    def __init__(self) -> None:
        self.redis_url = os.getenv("REDIS_URL", "").strip()
        self.compact_every = int(os.getenv("MEMORY_COMPACT_EVERY", "10"))
        self.keep_recent_turns = int(os.getenv("MEMORY_KEEP_RECENT_TURNS", "6"))
        self.session_ttl_seconds = int(os.getenv("MEMORY_SESSION_TTL_SECONDS", "604800"))
        self._redis = None
        self._local_store: Dict[str, Any] = {}
        self._backend = "memory"

        if self.redis_url and Redis is not None:
            try:
                self._redis = Redis.from_url(self.redis_url, decode_responses=True)
                self._redis.ping()
                self._backend = "redis"
            except Exception:
                self._redis = None

    @property
    def backend(self) -> str:
        return self._backend

    def _session_id(self, session_id: Optional[str]) -> str:
        return (session_id or "primary").strip() or "primary"

    def _turns_key(self, user_id: int, session_id: str) -> str:
        return f"user:{user_id}:session:{session_id}:turns"

    def _summary_key(self, user_id: int, session_id: str) -> str:
        return f"user:{user_id}:session:{session_id}:summary"

    def _meta_key(self, user_id: int, session_id: str) -> str:
        return f"user:{user_id}:session:{session_id}:meta"

    def _review_key(self, user_id: int, session_id: str) -> str:
        return f"user:{user_id}:session:{session_id}:review"

    def _read_meta(self, user_id: int, session_id: str) -> dict:
        key = self._meta_key(user_id, session_id)
        if self._redis is not None:
            raw = self._redis.get(key)
            return json.loads(raw) if raw else {}
        return dict(self._local_store.get(key, {}))

    def _write_meta(self, user_id: int, session_id: str, payload: dict) -> None:
        key = self._meta_key(user_id, session_id)
        if self._redis is not None:
            self._redis.set(key, json.dumps(payload))
            self._redis.expire(key, self.session_ttl_seconds)
            return
        self._local_store[key] = payload

    def _read_summary(self, user_id: int, session_id: str) -> str:
        key = self._summary_key(user_id, session_id)
        if self._redis is not None:
            return self._redis.get(key) or ""
        return str(self._local_store.get(key, ""))

    def _write_summary(self, user_id: int, session_id: str, summary: str) -> None:
        key = self._summary_key(user_id, session_id)
        if self._redis is not None:
            self._redis.set(key, summary)
            self._redis.expire(key, self.session_ttl_seconds)
            return
        self._local_store[key] = summary

    def _read_turns(self, user_id: int, session_id: str) -> List[dict]:
        key = self._turns_key(user_id, session_id)
        if self._redis is not None:
            raw_turns = self._redis.lrange(key, 0, -1)
            return [json.loads(item) for item in raw_turns]
        return list(self._local_store.get(key, []))

    def _write_turns(self, user_id: int, session_id: str, turns: List[dict]) -> None:
        key = self._turns_key(user_id, session_id)
        if self._redis is not None:
            pipe = self._redis.pipeline()
            pipe.delete(key)
            if turns:
                pipe.rpush(key, *[json.dumps(turn) for turn in turns])
            pipe.expire(key, self.session_ttl_seconds)
            pipe.execute()
            return
        self._local_store[key] = turns

    def _read_review_entries(self, user_id: int, session_id: str) -> List[dict]:
        key = self._review_key(user_id, session_id)
        if self._redis is not None:
            raw_entries = self._redis.lrange(key, 0, -1)
            return [json.loads(item) for item in raw_entries]
        return list(self._local_store.get(key, []))

    def _write_review_entries(self, user_id: int, session_id: str, review_entries: List[dict]) -> None:
        key = self._review_key(user_id, session_id)
        if self._redis is not None:
            pipe = self._redis.pipeline()
            pipe.delete(key)
            if review_entries:
                pipe.rpush(key, *[json.dumps(entry) for entry in review_entries])
            pipe.expire(key, self.session_ttl_seconds)
            pipe.execute()
            return
        self._local_store[key] = review_entries

    def build_context_block(self, user_id: int, session_id: Optional[str] = None) -> str:
        resolved_session = self._session_id(session_id)
        summary = self._read_summary(user_id, resolved_session).strip()
        turns = self._read_turns(user_id, resolved_session)[-self.keep_recent_turns:]

        parts: List[str] = []
        if summary:
            parts.append(f"Session memory summary:\n{summary}")
        if turns:
            recent_lines = [
                f"{turn['role'].title()}: {turn['content']}"
                for turn in turns
                if turn.get("content")
            ]
            if recent_lines:
                parts.append("Recent cached turns:\n" + "\n".join(recent_lines))
        return "\n\n".join(parts)

    def remember_exchange(
        self,
        *,
        user_id: int,
        session_id: Optional[str],
        user_message: str,
        assistant_message: str,
        search_results: Optional[List[dict]] = None,
    ) -> SessionSnapshot:
        resolved_session = self._session_id(session_id)
        turns = self._read_turns(user_id, resolved_session)
        review_entries = self._read_review_entries(user_id, resolved_session)
        meta = self._read_meta(user_id, resolved_session)

        turns.append({
            "role": "user",
            "content": user_message,
            "created_at": utc_now_iso(),
        })
        turns.append({
            "role": "assistant",
            "content": assistant_message,
            "products": search_results or [],
            "created_at": utc_now_iso(),
        })

        seen_products = set()
        deduped_products = []
        for product in search_results or []:
            dedupe_key = (
                product.get("image_id")
                or product.get("title")
                or product.get("image_url")
                or json.dumps(product, sort_keys=True)
            )
            if dedupe_key in seen_products:
                continue
            seen_products.add(dedupe_key)
            deduped_products.append(product)

        review_entries.append({
            "user_message": user_message,
            "assistant_message": assistant_message,
            "products": deduped_products,
            "created_at": utc_now_iso(),
        })

        turn_count = int(meta.get("turn_count", 0)) + 1
        summary = self._read_summary(user_id, resolved_session)

        if turn_count % self.compact_every == 0:
            summary = self._compact_summary(
                existing_summary=summary,
                turns=turns,
                compact_every=self.compact_every,
            )
            turns = turns[-self.keep_recent_turns:]
            self._write_summary(user_id, resolved_session, summary)

        self._write_turns(user_id, resolved_session, turns)
        self._write_review_entries(user_id, resolved_session, review_entries)
        self._write_meta(user_id, resolved_session, {
            "turn_count": turn_count,
            "updated_at": utc_now_iso(),
        })

        return SessionSnapshot(
            session_id=resolved_session,
            summary=summary,
            turns=turns[-self.keep_recent_turns:],
            review_entries=review_entries,
            turn_count=turn_count,
            backend=self.backend,
        )

    def get_snapshot(self, user_id: int, session_id: Optional[str] = None) -> SessionSnapshot:
        resolved_session = self._session_id(session_id)
        meta = self._read_meta(user_id, resolved_session)
        return SessionSnapshot(
            session_id=resolved_session,
            summary=self._read_summary(user_id, resolved_session),
            turns=self._read_turns(user_id, resolved_session),
            review_entries=self._read_review_entries(user_id, resolved_session),
            turn_count=int(meta.get("turn_count", 0)),
            backend=self.backend,
        )

    def clear_session(self, user_id: int, session_id: Optional[str] = None) -> SessionSnapshot:
        snapshot = self.get_snapshot(user_id, session_id)
        resolved_session = snapshot.session_id

        for key in (
            self._turns_key(user_id, resolved_session),
            self._review_key(user_id, resolved_session),
            self._summary_key(user_id, resolved_session),
            self._meta_key(user_id, resolved_session),
        ):
            if self._redis is not None:
                self._redis.delete(key)
            else:
                self._local_store.pop(key, None)

        return snapshot

    def _compact_summary(self, *, existing_summary: str, turns: List[dict], compact_every: int) -> str:
        recent_window = turns[-compact_every * 2:]
        user_lines = [turn["content"] for turn in recent_window if turn.get("role") == "user" and turn.get("content")]
        assistant_lines = [turn["content"] for turn in recent_window if turn.get("role") == "assistant" and turn.get("content")]

        user_digest = "; ".join(line.strip().replace("\n", " ") for line in user_lines[:5])
        assistant_digest = "; ".join(line.strip().replace("\n", " ") for line in assistant_lines[:3])

        fragments = []
        if existing_summary:
            fragments.append(existing_summary.strip())
        if user_digest:
            fragments.append(f"Recent user preferences and requests: {user_digest}")
        if assistant_digest:
            fragments.append(f"Recent assistant guidance and retrieved direction: {assistant_digest}")

        return "\n".join(fragment for fragment in fragments if fragment).strip()
