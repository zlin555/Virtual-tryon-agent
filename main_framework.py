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
    pip install torch torchvision
    pip install git+https://github.com/openai/CLIP.git
    pip install -q faiss-cpu

Run:
    python virtual_tryon_langchain_framework.py
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional
import pandas as pd
import numpy as np
import torch
from transformers import CLIPProcessor, CLIPModel
import faiss

# Load .env if present (pip install python-dotenv)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from pydantic import BaseModel, Field

from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
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
        
class ProductRetrievalService(ImageSearchService):
    def __init__(self, products_csv, text_features_path, image_features_path):
        self.df = pd.read_csv(products_csv)
        self.text_features = np.load(text_features_path).astype("float32")
        self.image_features = np.load(image_features_path).astype("float32")

        faiss.normalize_L2(self.image_features)

        dim = self.image_features.shape[1]
        self.index = faiss.IndexFlatIP(dim)
        self.index.add(self.image_features)

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32", use_safetensors=True).to(self.device)
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")


    def search_images(self, query, category=None, limit=6):
      inputs = self.processor(
          text=[query],
          return_tensors="pt",
          padding=True,
          truncation=True
      ).to(self.device)

      with torch.no_grad():
          text_outputs = self.model.text_model(
              input_ids=inputs["input_ids"],
              attention_mask=inputs["attention_mask"]
          )
          pooled_output = text_outputs.pooler_output
          query_feature = self.model.text_projection(pooled_output)
          query_feature = query_feature / query_feature.norm(dim=-1, keepdim=True)

      query_feature = query_feature.cpu().numpy().astype("float32")
      faiss.normalize_L2(query_feature)

      if not category:
          scores, indices = self.index.search(query_feature, limit)
          top_results = self.df.iloc[indices[0]].copy()
          top_results["score"] = scores[0]
      else:
          scores, indices = self.index.search(query_feature, min(limit * 20, len(self.df)))

          rows = []
          category_lower = category.lower()

          for score, idx in zip(scores[0], indices[0]):
              row = self.df.iloc[idx]
              sub_category = str(row.get("subCategory", "")).lower()
              article_type = str(row.get("articleType", "")).lower()

              if category_lower in sub_category or category_lower in article_type:
                  row_dict = row.to_dict()
                  row_dict["score"] = float(score)
                  rows.append(row_dict)

              if len(rows) >= limit:
                  break

          top_results = pd.DataFrame(rows)

      results = []
      for _, row in top_results.iterrows():
          results.append(
              SearchImageResult(
                  image_id=str(row["id"]),
                  title=str(row["productDisplayName"]),
                  image_url=str(row["link"]),
                  source="kaggle_fashion_dataset_faiss",
                  metadata={
                      "category": row.get("subCategory", ""),
                      "articleType": row.get("articleType", ""),
                      "color": row.get("baseColour", ""),
                      "usage": row.get("usage", ""),
                      "price_usd": row.get("price_usd", None),
                      "score": float(row["score"]),
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


class FashnTryOnService(VirtualTryOnService):
    """Virtual try-on via FASHN API (fashn.ai).

    Sign up at https://fashn.ai to get an API key.
    Pricing: $0.075 per image. New accounts receive 10 free credits.

    Set environment variable: FASHN_API_KEY=your_key_here
    """

    _POLL_INTERVAL = 3   # seconds between status checks
    _MAX_POLLS = 40      # 40 * 3s = 120s timeout

    def __init__(self, api_key: str):
        self._api_key = api_key
        self._base_url = "https://api.fashn.ai/v1"

    def run_tryon(self, payload: TryOnInput) -> TryOnResult:
        import urllib.request

        headers_dict = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": "VirtualTryOnAgent/1.0",
        }

        inputs: Dict[str, Any] = {
            "model_image": payload.person_image_url,
            "garment_image": payload.garment_image_url,
            "garment_photo_type": "auto",
            "mode": "balanced",
            "output_format": "png",
        }
        body = {"model_name": "tryon-v1.6", "inputs": inputs}

        # Submit prediction
        try:
            req = urllib.request.Request(
                f"{self._base_url}/run",
                data=json.dumps(body).encode(),
                headers=headers_dict,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                prediction = json.loads(resp.read())
        except Exception as exc:
            return TryOnResult(status="error", message=f"FASHN submit failed: {exc}")

        prediction_id = prediction.get("id")
        if not prediction_id:
            err = prediction.get("error", prediction)
            return TryOnResult(status="error", message=f"FASHN returned no prediction ID: {err}")

        # Poll for completion
        status_req_headers = {
            "Authorization": f"Bearer {self._api_key}",
            "User-Agent": "VirtualTryOnAgent/1.0",
        }
        for _ in range(self._MAX_POLLS):
            time.sleep(self._POLL_INTERVAL)
            try:
                poll_req = urllib.request.Request(
                    f"{self._base_url}/status/{prediction_id}",
                    headers=status_req_headers,
                    method="GET",
                )
                with urllib.request.urlopen(poll_req, timeout=15) as resp:
                    status_data = json.loads(resp.read())
            except Exception as exc:
                return TryOnResult(status="error", message=f"FASHN poll failed: {exc}")

            state = status_data.get("status", "")
            if state == "completed":
                output = status_data.get("output", [])
                if output:
                    # output may be a list of URL strings or dicts with a "url" key
                    first = output[0]
                    result_url = first if isinstance(first, str) else first.get("url", "")
                    return TryOnResult(
                        status="success",
                        result_image_url=result_url,
                        message="Virtual try-on completed via FASHN API.",
                    )
                return TryOnResult(status="error", message="FASHN completed but returned no output URLs.")
            elif state in ("failed", "error"):
                err = status_data.get("error", "unknown error")
                return TryOnResult(status="error", message=f"FASHN try-on failed: {err}")
            # states "starting" / "processing" — keep polling

        return TryOnResult(status="error", message="FASHN try-on timed out after 120 seconds.")


class ReplicateTryOnService(VirtualTryOnService):
    """Virtual try-on via Replicate API using IDM-VTON model.

    Sign up at https://replicate.com and add a payment method.
    Pricing: ~$0.025 per prediction.
    Note: IDM-VTON is licensed CC BY-NC-SA 4.0 (non-commercial use only).

    Requires: pip install replicate
    Set environment variable: REPLICATE_API_TOKEN=your_token_here
    """

    _MODEL = "cuuupid/idm-vton"

    def __init__(self, api_token: str):
        self._api_token = api_token

    def run_tryon(self, payload: TryOnInput) -> TryOnResult:
        try:
            import replicate  # pip install replicate
        except ImportError:
            return TryOnResult(
                status="error",
                message="Replicate SDK not installed. Run: pip install replicate",
            )

        category = self._map_category(payload.garment_type)
        try:
            client = replicate.Client(api_token=self._api_token)
            output = client.run(
                self._MODEL,
                input={
                    "human_img": payload.person_image_url,
                    "garm_img": payload.garment_image_url,
                    "garment_des": payload.style_note or (payload.garment_type or "clothing item"),
                    "category": category,
                    "crop": False,
                    "seed": 42,
                    "steps": 30,
                },
            )
            result_url = str(output[0]) if isinstance(output, list) else str(output)
            return TryOnResult(
                status="success",
                result_image_url=result_url,
                message="Virtual try-on completed via Replicate IDM-VTON.",
            )
        except Exception as exc:
            return TryOnResult(status="error", message=f"Replicate try-on error: {exc}")

    @staticmethod
    def _map_category(garment_type: Optional[str]) -> str:
        if not garment_type:
            return "upper_body"
        gt = garment_type.lower()
        if gt in ("dress", "dresses", "gown", "jumpsuit"):
            return "dresses"
        if gt in ("pants", "skirt", "shorts", "jeans", "trousers", "lower", "bottom"):
            return "lower_body"
        return "upper_body"


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

        self._agent = create_react_agent(
            model=model,
            tools=tools,
            prompt=SYSTEM_PROMPT,
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

def _resolve_tryon_service() -> VirtualTryOnService:
    """Pick a real try-on backend from environment variables, or fall back to the stub.

    Priority:
      1. FASHN_API_KEY  → FashnTryOnService   (recommended)
      2. REPLICATE_API_TOKEN → ReplicateTryOnService
      3. (neither set) → VirtualTryOnStub
    """
    fashn_key = os.getenv("FASHN_API_KEY")
    replicate_token = os.getenv("REPLICATE_API_TOKEN")

    if fashn_key:
        print("[tryon] Using FASHN API (fashn.ai)")
        return FashnTryOnService(api_key=fashn_key)
    if replicate_token:
        print("[tryon] Using Replicate IDM-VTON")
        return ReplicateTryOnService(api_token=replicate_token)

    print("[tryon] No API key found — using stub (set FASHN_API_KEY or REPLICATE_API_TOKEN)")
    return VirtualTryOnStub()


def build_app_agent() -> VirtualTryOnOrchestrator:
    deps = AgentDependencies(
        image_search_service=ProductRetrievalService(
            products_csv="./cleaned_data.csv",
            text_features_path="./final_text_features.npy",
            image_features_path="./final_image_features.npy",
        ),
        tryon_service=_resolve_tryon_service(),
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
