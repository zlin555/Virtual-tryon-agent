"""
Virtual Try-On Agent framework with LangChain + OpenAI GPT.

What this file includes:
- A LangChain agent powered by ChatOpenAI
- A placeholder image search tool interface
- A placeholder virtual try-on tool interface
- A small orchestration layer with typed request/response models
- A runnable CLI demo

What this file intentionally leaves as stubs:
- Real image search implementation (e.g. Unsplash API)
- Real virtual try-on implementation
- Persistent storage / web frontend

Tested design target:
- Python 3.10+
- langchain
- langchain-openai
- pydantic

Environment variables:
- OPENAI_API_KEY=...
- Optional later: UNSPLASH_ACCESS_KEY=...

Install:
    pip install -U langchain langchain-openai pydantic

Run:
    python virtual_tryon_langchain_framework.py
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from langchain.tools import tool
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI


# =========================
# Data models
# =========================

class SearchImageInput(BaseModel):
    """Input for the image search tool."""

    query: str = Field(..., description="Search query for clothing or fashion item images.")
    category: Optional[str] = Field(
        default=None,
        description="Optional category such as top, dress, shoes, bag, pants, jacket.",
    )
    limit: int = Field(default=6, ge=1, le=20, description="Maximum number of candidate images.")


class SearchImageResult(BaseModel):
    """A single candidate image result."""

    image_id: str
    title: str
    image_url: str
    source: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TryOnInput(BaseModel):
    """Input for the try-on tool."""

    person_image_url: str = Field(..., description="URL of the person image.")
    garment_image_url: str = Field(..., description="URL of the garment image.")
    garment_type: Optional[str] = Field(
        default=None,
        description="Type of garment, e.g. top, dress, pants, coat.",
    )
    size_hint: Optional[str] = Field(
        default=None,
        description="Optional size hint such as S/M/L or fitted/oversized.",
    )
    style_note: Optional[str] = Field(
        default=None,
        description="Optional styling note, e.g. casual, minimal, office, streetwear.",
    )


class TryOnResult(BaseModel):
    """Placeholder output for a try-on operation."""

    status: Literal["success", "not_implemented", "error"]
    result_image_url: Optional[str] = None
    message: str
    debug: Dict[str, Any] = Field(default_factory=dict)


class AgentRequest(BaseModel):
    """High-level request coming from frontend / API / CLI."""

    user_message: str = Field(..., description="Natural-language user request.")


@dataclass
class AgentDependencies:
    """Dependency container so you can swap implementations later."""

    image_search_service: "ImageSearchService"
    tryon_service: "VirtualTryOnService"


# =========================
# Service interfaces
# =========================

class ImageSearchService:
    """Abstract-ish interface for searching clothing/fashion images."""

    def search_images(self, query: str, category: Optional[str] = None, limit: int = 6) -> List[SearchImageResult]:
        raise NotImplementedError


class UnsplashImageSearchStub(ImageSearchService):
    """Stub for future Unsplash integration.

    TODO: Replace this with a real API call later.
    """

    def search_images(self, query: str, category: Optional[str] = None, limit: int = 6) -> List[SearchImageResult]:
        # Placeholder only. In a real version, call Unsplash or another image API here.
        normalized = query.strip().lower().replace(" ", "-")
        results: List[SearchImageResult] = []
        for i in range(limit):
            results.append(
                SearchImageResult(
                    image_id=f"stub-{normalized}-{i+1}",
                    title=f"Stub fashion result {i+1} for '{query}'",
                    image_url=f"https://example.com/images/{normalized}-{i+1}.jpg",
                    source="unsplash_stub",
                    metadata={
                        "category": category,
                        "note": "This is a stub result. Replace with real Unsplash API response.",
                    },
                )
            )
        return results


class VirtualTryOnService:
    """Abstract-ish interface for virtual try-on backend."""

    def run_tryon(self, payload: TryOnInput) -> TryOnResult:
        raise NotImplementedError


class VirtualTryOnStub(VirtualTryOnService):
    """Stub try-on implementation.

    TODO: replace with your real try-on model/service later.
    """

    def run_tryon(self, payload: TryOnInput) -> TryOnResult:
        return TryOnResult(
            status="not_implemented",
            result_image_url=None,
            message=(
                "Virtual try-on backend is not implemented yet. "
                "This stub confirms the agent can pass structured inputs correctly."
            ),
            debug={
                "received_person_image_url": payload.person_image_url,
                "received_garment_image_url": payload.garment_image_url,
                "garment_type": payload.garment_type,
                "size_hint": payload.size_hint,
                "style_note": payload.style_note,
            },
        )


# =========================
# Tool factory
# =========================

class ToolFactory:
    """Build LangChain tools around injected services."""

    def __init__(self, deps: AgentDependencies):
        self.deps = deps

    def build_tools(self):
        image_search_service = self.deps.image_search_service
        tryon_service = self.deps.tryon_service

        @tool(args_schema=SearchImageInput)
        def search_fashion_images(query: str, category: Optional[str] = None, limit: int = 6) -> str:
            """Search fashion or clothing product/reference images.

            Use this when the user asks to find garments, clothing references,
            outfit inspirations, or item candidates before try-on.
            """
            results = image_search_service.search_images(query=query, category=category, limit=limit)
            return json.dumps([r.model_dump() for r in results], ensure_ascii=False, indent=2)

        @tool(args_schema=TryOnInput)
        def virtual_tryon(
            person_image_url: str,
            garment_image_url: str,
            garment_type: Optional[str] = None,
            size_hint: Optional[str] = None,
            style_note: Optional[str] = None,
        ) -> str:
            """Run virtual try-on using a person image and a garment image.

            Use this after the user has provided or selected both the person image
            and the clothing image.
            """
            result = tryon_service.run_tryon(
                TryOnInput(
                    person_image_url=person_image_url,
                    garment_image_url=garment_image_url,
                    garment_type=garment_type,
                    size_hint=size_hint,
                    style_note=style_note,
                )
            )
            return result.model_dump_json(indent=2)

        return [search_fashion_images, virtual_tryon]


# =========================
# Agent builder
# =========================

SYSTEM_PROMPT = """
You are a virtual try-on shopping assistant.

Your job:
1. Understand the user's fashion goal.
2. If needed, search for candidate clothing images using the search_fashion_images tool.
3. If the user has both a person image and a garment image, call virtual_tryon.
4. Be practical, concise, and structured.
5. Never invent final try-on images. If the try-on backend is not implemented, clearly say so.
6. When tool outputs are placeholders, explicitly label them as placeholders.

Behavior rules:
- Ask for the missing image if the user wants try-on but has not provided either the person image or garment image.
- If the user only wants recommendations, use search_fashion_images and summarize the options.
- If a tool returns JSON, extract the useful information and present it cleanly.
""".strip()


class VirtualTryOnAgent:
    """Thin wrapper around a LangChain agent."""

    def __init__(self, model_name: str = "gpt-4.1-mini", temperature: float = 0.2):
        self.model_name = model_name
        self.temperature = temperature
        self._agent = None

    def build(self, deps: AgentDependencies):
        tools = ToolFactory(deps).build_tools()

        model = ChatOpenAI(
            model=self.model_name,
            temperature=self.temperature,
        )

        self._agent = create_agent(
            model=model,
            tools=tools,
            system_prompt=SYSTEM_PROMPT,
        )
        return self

    def invoke(self, request: AgentRequest) -> Dict[str, Any]:
        if self._agent is None:
            raise RuntimeError("Agent has not been built. Call build(...) first.")

        response = self._agent.invoke(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": request.user_message,
                    }
                ]
            }
        )
        return response


# =========================
# Optional structured orchestration layer
# =========================

class VirtualTryOnOrchestrator:
    """Convenience layer for app developers.

    This gives you one place to plug into a FastAPI route, web app, or CLI.
    """

    def __init__(self, agent: VirtualTryOnAgent):
        self.agent = agent

    def run(self, user_message: str) -> str:
        raw = self.agent.invoke(AgentRequest(user_message=user_message))

        # The exact response shape may vary slightly across LangChain versions.
        # We therefore extract text defensively.
        messages = raw.get("messages", [])
        if not messages:
            return "No response messages were returned by the agent."

        last = messages[-1]

        # Common patterns: dict-like or object-like AI message.
        if isinstance(last, dict):
            content = last.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        parts.append(item.get("text", ""))
                return "\n".join(p for p in parts if p).strip() or str(content)
            return str(content)

        # Fallback for object-style messages in some LangChain versions.
        content = getattr(last, "content", None)
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text", ""))
                else:
                    parts.append(str(item))
            return "\n".join(p for p in parts if p).strip()

        return str(last)


# =========================
# App factory
# =========================

def build_app_agent() -> VirtualTryOnOrchestrator:
    deps = AgentDependencies(
        image_search_service=UnsplashImageSearchStub(),
        tryon_service=VirtualTryOnStub(),
    )

    agent = VirtualTryOnAgent(model_name="gpt-4.1-mini", temperature=0.2).build(deps)
    return VirtualTryOnOrchestrator(agent)


# =========================
# CLI demo
# =========================

def main() -> None:
    if not os.getenv("OPENAI_API_KEY"):
        raise EnvironmentError("OPENAI_API_KEY is not set.")

    app = build_app_agent()

    demo_inputs = [
        "Find me some minimalist black dresses for office wear.",
        (
            "I want to try on a beige trench coat. "
            "My photo is https://example.com/person.jpg and the coat image is "
            "https://example.com/trench.jpg"
        ),
    ]

    for i, user_text in enumerate(demo_inputs, start=1):
        print("=" * 80)
        print(f"Demo #{i}")
        print(f"USER: {user_text}\n")
        result = app.run(user_text)
        print(f"AGENT:\n{result}\n")


if __name__ == "__main__":
    main()
