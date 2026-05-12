# Virtual Try-On Agent

An AI-powered virtual fashion shopping assistant built with **LangChain / LangGraph**, **OpenAI GPT-4.1-mini**, **CLIP + FAISS retrieval**, **FASHN API**, and a **React + Vite** frontend. Users describe their style in natural language, get outfit recommendations from a real fashion product dataset, and can virtually try on selected garments with their own photo.

---

## Architecture

The current repository contains two backend entry points. Both use **CLIP + FAISS** for product retrieval, but they are used for different evaluation purposes:

| Version | Entry point | Framework | Purpose |
|---|---|---|---|
| **Baseline** | `api.py` | `main_framework.py` | Baseline comparison: direct agent retrieval with CLIP + FAISS |
| **Full Pipeline / Improved Version** | `api_clip.py` | `new_main_framework.py` | Adds LLM preference summarization before CLIP + FAISS retrieval |

```text
Browser (React + Vite, :5173)
        |  REST  (/api/*)
        v
FastAPI backend (:8000)
        |
        +-- Baseline: api.py
        |       |
        |       +-- LangGraph ReAct Agent (GPT-4.1-mini)
        |               |
        |               +-- search_fashion_images
        |               |       |
        |               |       +-- ProductRetrievalService
        |               |               |
        |               |               +-- CLIP text encoder
        |               |               +-- FAISS over precomputed product image embeddings
        |               |
        |               +-- virtual_tryon
        |                       |
        |                       +-- FashnTryOnService / ReplicateTryOnService
        |
        +-- Full Pipeline: api_clip.py
                |
                +-- LangGraph ReAct Agent (GPT-4.1-mini)
                        |
                        +-- summarize_preference
                        |       |
                        |       +-- Extracts search_query, category, style_note
                        |       +-- Supports optional reference style image URL
                        |
                        +-- search_fashion_images
                        |       |
                        |       +-- ProductRetrievalService
                        |               |
                        |               +-- CLIP text encoder
                        |               +-- FAISS over precomputed product image embeddings
                        |
                        +-- virtual_tryon
                                |
                                +-- FashnTryOnService / ReplicateTryOnService
```

### Baseline vs. Full Pipeline

The baseline is **not keyword search**. In the current code, `api.py` also uses `ProductRetrievalService`, which loads CLIP features, builds a FAISS index, encodes the user query with CLIP, and retrieves visually relevant products.

The main difference is:

```text
Baseline:
User message
→ LangGraph agent
→ search_fashion_images
→ CLIP query embedding
→ FAISS product image retrieval
→ recommendation results
```

```text
Full Pipeline / Improved Version:
User message + optional reference style image
→ summarize_preference
→ structured search_query + category + style_note
→ search_fashion_images
→ CLIP query embedding
→ FAISS product image retrieval
→ recommendation results
```

In other words, `api.py` is used as the **baseline comparison**, while `api_clip.py` is the **improved pipeline** that adds an explicit LLM-based preference summarization step before retrieval.

This project is divided across four roles:

| Role | Responsibility |
|------|---------------|
| **Suyuan Wang** | LangChain / LangGraph agent, tool definitions, prompt engineering, conversation flow |
| **Zihao Lin** | Product dataset (`cleaned_data.csv`), CLIP embeddings (`final_*_features.npy`), FAISS retrieval and filtering |
| **Haozhen Zheng** | Virtual try-on integration (FASHN API), image preprocessing, tool implementation |
| **Larry Liao** | React frontend, FastAPI bridge, image upload flow |

---

## Features

- **Style Explorer** — describe your style, select aesthetics and occasions, and get recommended fashion products from the Myntra-style product catalog
- **Baseline CLIP + FAISS Retrieval** — `api.py` directly uses the user request with the agent and retrieves products through CLIP + FAISS
- **LLM Preference Summarization Pipeline** — `api_clip.py` first summarizes user preference into `search_query`, `category`, and `style_note`, then performs CLIP + FAISS retrieval
- **Reference Style Image Support** — the improved pipeline can accept `style_image_url` and use it as additional context during preference summarization
- **Gender-aware filtering** — retrieval supports explicit gender fields such as `Gender: Men`, `Gender: Women`, and `Gender: Unisex`
- **Virtual Try-On** — upload your photo and any garment image; FASHN API generates a photo-realistic overlay
- **Image upload** — drag-and-drop or paste a URL; uploaded images can be hosted publicly for try-on compatibility
- **Plug-and-play backend design** — try-on and search services are wrapped behind service interfaces so they can be replaced without changing the frontend

---

## Quickstart

### 1. Clone and install

```bash
git clone https://github.com/wsylxy/Virtual-tryon-agent.git
cd Virtual-tryon-agent
pip install -r requirements.txt
```

### 2. Set API keys

```bash
cp .env.example .env
```

Edit `.env` with your keys.

### 3. Start the baseline backend

Use this version when you want to run the **baseline comparison**.

```bash
# From the project root (Virtual-tryon-agent/)
OMP_NUM_THREADS=1 TOKENIZERS_PARALLELISM=false uvicorn api:app --host 0.0.0.0 --port 8000
```

The baseline path is:

```text
api.py
→ main_framework.py
→ LangGraph agent
→ ProductRetrievalService
→ CLIP + FAISS retrieval
```

### 4. Start the full pipeline backend

Use this version when you want to run the **improved full pipeline**.

```bash
# From the project root (Virtual-tryon-agent/)
OMP_NUM_THREADS=1 TOKENIZERS_PARALLELISM=false uvicorn api_clip:app --host 0.0.0.0 --port 8000
```

The full pipeline path is:

```text
api_clip.py
→ new_main_framework.py
→ summarize_preference
→ ProductRetrievalService
→ CLIP + FAISS retrieval
```

> **Do not use `--reload`** — it spawns two processes and can cause out-of-memory kills when CLIP and embedding arrays are loaded twice.

The API is ready when you see `[agent] Ready.` in the terminal. Verify:

```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/ready
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at **http://localhost:5173**

---

## Pages

### Style Explorer (`/style`)

Describe your personal style, select aesthetic chips such as Minimalist, Streetwear, or Punk, and occasion chips such as Date Night, Work, or Party, then click **Analyze My Style**.

The agent returns outfit cards with real product images from the fashion catalog. Click any card to jump to the Try-On page with that garment pre-filled.

When the backend is `api.py`, the request goes through the baseline CLIP + FAISS retrieval flow. When the backend is `api_clip.py`, the request first goes through LLM preference summarization before retrieval.

### Virtual Try-On (`/tryon`)

Upload or paste a URL for your photo and a garment image. Select the garment type and optionally add a style note, then click **Try On**. FASHN renders a photo-realistic result.

**Tips:**
- Person photo: front-facing, good lighting, plain background
- Garment photo: flat-lay or on-model with white/neutral background

**Supported garment types:** top, jacket, coat, dress, pants, skirt, shorts

---

## Product Retrieval Pipeline

Retrieval is powered by a Myntra-style fashion dataset and precomputed CLIP embeddings.

| File | Description |
|------|-------------|
| `cleaned_data.csv` | Product catalog: ID, name, category, gender, color, usage, image URL |
| `final_image_features.npy` | CLIP image embeddings for product images — not included in repo due to file size |
| `final_text_features.npy` | CLIP text embeddings — loaded by the retrieval service, but runtime search mainly compares query text embeddings with image embeddings |

> **Note:** `final_image_features.npy` and `final_text_features.npy` are excluded from the GitHub repository due to their large file size. You must obtain them separately, for example from a team member or by re-running the CLIP feature extraction script, and place them in the project root before starting the backend.

At runtime, `ProductRetrievalService` performs the following steps:

1. Load product metadata from `cleaned_data.csv`.
2. Load precomputed feature arrays from `final_image_features.npy` and `final_text_features.npy`.
3. Normalize product image embeddings with `faiss.normalize_L2`.
4. Build a FAISS `IndexFlatIP` index.
5. Encode the user search query with `openai/clip-vit-base-patch32`.
6. Normalize the query embedding.
7. Search the FAISS index for the most similar product image embeddings.
8. Return product cards with title, image URL, category, color, gender, usage, and similarity score.

Because both image embeddings and query embeddings are normalized, FAISS inner-product search is equivalent to cosine similarity search.

### Gender and Category Filtering

The retrieval service supports explicit gender constraints from the frontend query:

```text
Gender: Men
Gender: Women
Gender: Unisex
```

The current gender mapping is:

| User gender | Dataset candidates |
|---|---|
| Men | Men, Boys, Unisex |
| Women | Women, Girls, Unisex |
| Unisex | Unisex |

If a category is provided, the service filters candidates using `subCategory` and `articleType`.

If category + gender filtering is too strict, the service falls back to broader candidates, such as gender-only retrieval or the full index.

---

## Baseline: `api.py`

`api.py` is used as the **baseline comparison backend**.

It uses:

```text
api.py
→ main_framework.py
→ build_app_agent()
→ ProductRetrievalService
→ CLIP + FAISS retrieval
```

The baseline still uses the LangGraph ReAct agent and the same retrieval tool, but it does not have the explicit `summarize_preference` tool. The user request is passed directly to the agent, and the agent calls `search_fashion_images` for product retrieval.

Baseline request schema:

```json
{
  "message": "Find me some minimalist black dresses. Gender: Women.",
  "history": []
}
```

Use the baseline to answer this evaluation question:

> If we directly retrieve products from the user request using CLIP + FAISS, how good are the recommendations?

---

## Full Pipeline: `api_clip.py`

`api_clip.py` is the **improved full pipeline backend**.

It uses:

```text
api_clip.py
→ new_main_framework.py
→ summarize_preference
→ search_fashion_images
→ ProductRetrievalService
→ CLIP + FAISS retrieval
```

The main addition is `summarize_preference`, which converts raw user input into structured retrieval fields:

```json
{
  "search_query": "minimalist black dress for women office wear",
  "category": "dress",
  "style_note": "Clean, elegant, not too revealing, suitable for office wear."
}
```

Full pipeline request schema:

```json
{
  "message": "Find me some minimalist black dresses. Gender: Women.",
  "history": [],
  "style_image_url": "https://example.com/reference-style.jpg"
}
```

Use the full pipeline to answer this evaluation question:

> Does explicit LLM preference summarization improve retrieval quality compared with directly sending the user request to CLIP + FAISS?

---

## Virtual Try-On Backend

`FashnTryOnService` calls the FASHN try-on model. No local GPU is required for FASHN inference because inference runs on FASHN's cloud.

An alternative Replicate IDM-VTON backend, `ReplicateTryOnService`, is also implemented. `_resolve_tryon_service()` selects the active backend based on which environment variable is set:

1. `FASHN_API_KEY` → `FashnTryOnService`
2. `REPLICATE_API_TOKEN` → `ReplicateTryOnService`
3. neither set → `VirtualTryOnStub`

---

## Project Structure

```text
Virtual-tryon-agent/
├── api.py                   # Baseline FastAPI server; uses main_framework.py
├── api_clip.py              # Full pipeline FastAPI server; uses new_main_framework.py
├── main_framework.py        # Baseline agent, ProductRetrievalService, CLIP+FAISS, try-on services
├── new_main_framework.py    # Improved agent with summarize_preference and style_image_url support
├── app.py                   # Legacy Gradio UI or experimental app entry
├── cleaned_data.csv         # Product catalog
├── final_image_features.npy # CLIP image embeddings, not in repo due to file size
├── final_text_features.npy  # CLIP text embeddings, not in repo due to file size
├── requirements.txt
├── .env.example
└── frontend/                # React + Vite + Tailwind CSS
    ├── src/
    │   ├── pages/           # HomePage, StylePage, TryOnPage
    │   ├── hooks/           # useAgentChat, useTryOn
    │   ├── context/         # SavedLooksContext
    │   ├── components/
    │   └── api/client.js    # Axios instance
    └── vite.config.js       # Proxies /api to VITE_API_URL or localhost:8000
```

---

## API Endpoints

Both backend versions expose the same main endpoints.

### Health Check

```http
GET /api/health
```

### Readiness Check

```http
GET /api/ready
```

The agent loads in a background thread. If `ready` is `false`, wait until CLIP, FAISS, and the agent have finished loading.

### Agent Chat

```http
POST /api/agent/chat
```

Baseline request for `api.py`:

```json
{
  "message": "Find me a black jacket for streetwear. Gender: Men.",
  "history": []
}
```

Full pipeline request for `api_clip.py`:

```json
{
  "message": "Find me a black jacket for streetwear. Gender: Men.",
  "history": [],
  "style_image_url": "https://example.com/reference-style.jpg"
}
```

Response:

```json
{
  "response": "assistant response text",
  "search_results": [
    {
      "image_id": "12345",
      "title": "Men Black Jacket",
      "image_url": "https://example.com/product.jpg",
      "source": "kaggle_fashion_dataset_faiss",
      "metadata": {
        "dataset_gender": "Men",
        "category": "Apparel",
        "articleType": "Jacket",
        "color": "Black",
        "usage": "Casual",
        "score": 0.32
      }
    }
  ]
}
```

### Virtual Try-On

```http
POST /api/tryon
```

Request:

```json
{
  "person_image_url": "https://example.com/person.jpg",
  "garment_image_url": "https://example.com/garment.jpg",
  "garment_type": "jacket",
  "size_hint": "regular fit",
  "style_note": "streetwear outfit"
}
```

### Image Upload

```http
POST /api/upload-image
```

Accepts multipart image upload and returns a public image URL that can be used by the try-on service.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4.1-mini |
| `FASHN_API_KEY` | Recommended | FASHN API key for cloud virtual try-on |
| `REPLICATE_API_TOKEN` | Alternative | Replicate token for IDM-VTON |
| `IMGBB_API_KEY` | Recommended | imgbb key for image hosting |
| `ALLOWED_ORIGINS` | Production | Comma-separated allowed frontend origins |
| `VITE_API_URL` | Production | Backend URL used by Vite proxy |

---

## Dependencies

**Backend**

```text
fastapi uvicorn[standard] python-multipart
langchain langchain-openai langgraph
pydantic python-dotenv
pandas numpy
torch torchvision transformers faiss-cpu
```

**Frontend**

```text
react react-dom react-router-dom
axios framer-motion react-dropzone
@tailwindcss/vite tailwindcss
vite @vitejs/plugin-react
```

---

## Evaluation Setup

This repository can be evaluated as an ablation study:

| Experiment | Backend | Retrieval | Preference summarization | Reference image |
|---|---|---|---|---|
| Baseline | `api.py` | CLIP + FAISS | No explicit summarization | No |
| Full pipeline | `api_clip.py` | CLIP + FAISS | Yes, `summarize_preference` | Yes, optional `style_image_url` |

Recommended comparison:

1. Run the same text-only user request on `api.py`.
2. Run the same request on `api_clip.py`.
3. Compare whether the full pipeline produces a cleaner query, better category matching, and more relevant product results.
4. Optionally add a reference style image to `api_clip.py` and compare whether visual style context improves recommendations.

The purpose of this comparison is not to prove that FAISS is better than keyword search. Both backends already use CLIP + FAISS. The comparison is specifically about whether an LLM preference summarization layer improves retrieval quality.
