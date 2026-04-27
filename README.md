# Virtual Try-On Agent

An AI-powered virtual fashion shopping assistant built with **LangChain / LangGraph**, **OpenAI GPT-4.1-mini**, **FASHN API**, and a **React + Vite** frontend. Users describe their style in natural language, get outfit recommendations from a real 44K-product fashion dataset, and can virtually try on any item with their own photo.

---

## Architecture

```
Browser (React + Vite, :5173)
        |  REST  (/api/*)
        v
  FastAPI backend (:8000)
        |
        +-- POST /api/agent/chat --> LangGraph ReAct Agent (GPT-4.1-mini)
        |                                   |
        |                                   +-- search_fashion_images --> KeywordSearchService
        |                                   |                              (pandas over cleaned_data.csv)
        |                                   +-- virtual_tryon ----------> FashnTryOnService
        |
        +-- POST /api/tryon -------> FashnTryOnService (fashn.ai)
        |
        +-- POST /api/upload-image -> imgbb CDN (public URL for FASHN)
```

This project is divided across four roles:

| Role | Responsibility |
|------|---------------|
| **Person 1** | LangChain agent, tool definitions, prompt engineering, conversation flow |
| **Person 2** | Product dataset (`cleaned_data.csv`), CLIP embeddings (`final_*_features.npy`), FAISS index |
| **Person 3** | Virtual try-on integration (FASHN API), image preprocessing, tool implementation |
| **Person 4** | React frontend, FastAPI bridge (`api.py`), image upload, evaluation |

---

## Features

- **Style Explorer** — describe your style + pick aesthetics and occasions; the agent recommends real products from a 44K-item Myntra dataset
- **Virtual Try-On** — upload your photo and any garment image; FASHN API generates a photo-realistic overlay in ~20 seconds (no GPU required)
- **Image upload** — drag-and-drop or paste a URL; images are hosted on imgbb for FASHN compatibility
- **Keyword-based retrieval** — style/aesthetic terms (`punk`, `minimalist`, `streetwear`, etc.) are expanded to concrete dataset vocabulary before searching
- **Plug-and-play backend** — swap try-on or search services without touching agent logic

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

Edit `.env` with your keys (see table below).

### 3. Start the backend

```bash
# From the project root (Virtual-tryon-agent/)
OMP_NUM_THREADS=1 TOKENIZERS_PARALLELISM=false uvicorn api:app --port 8000
```

> **Do not use `--reload`** — it spawns two processes and can cause out-of-memory kills.

The API is ready when you see `[agent] Ready.` in the terminal. Verify:

```bash
curl http://localhost:8000/api/health   # -> {"status":"ok"}
curl http://localhost:8000/api/ready    # -> {"ready":true}
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at **http://localhost:5173**

---

## Pages

### Style Explorer (`/style`)

Describe your personal style, select aesthetic chips (Minimalist, Streetwear, Punk, ...) and occasion chips (Date Night, Work, Party, ...), then click **Analyze My Style**. The agent returns 6 outfit cards with real product images from the Myntra catalog. Click any card to jump to the Try-On page with that garment pre-filled.

### Virtual Try-On (`/tryon`)

Upload or paste a URL for your photo and a garment image. Select the garment type and optionally add a style note, then click **Try On**. FASHN renders a photo-realistic result in ~20 seconds.

**Tips:**
- Person photo: front-facing, good lighting, plain background
- Garment photo: flat-lay or on-model with white/neutral background

**Supported garment types:** top, jacket, coat, dress, pants, skirt, shorts

---

## Product Dataset

Retrieval is powered by the **Myntra fashion dataset** (~44K products) sourced from Kaggle:

| File | Description |
|------|-------------|
| `cleaned_data.csv` | Product catalog: ID, name, category, color, usage, image URL |
| `final_image_features.npy` | 44K x 512 CLIP image embeddings (pre-computed) |
| `final_text_features.npy` | 44K x 512 CLIP text embeddings (pre-computed) |

At runtime the backend uses **keyword search** (`KeywordSearchService` in `api.py`) — a fast pandas-based search that expands style terms to dataset vocabulary with no ML overhead. The CLIP+FAISS `ProductRetrievalService` (in `main_framework.py`) is also fully implemented and can be enabled on a machine with sufficient RAM (>= 4 GB free).

---

## Virtual Try-On Backend

`FashnTryOnService` calls the FASHN `tryon-v1.6` model. No GPU required — inference runs on FASHN's cloud. An alternative Replicate IDM-VTON backend (`ReplicateTryOnService`) is also implemented. `_resolve_tryon_service()` in `main_framework.py` picks the active backend based on which env variable is set.

---

## Project Structure

```
Virtual-tryon-agent/
├── api.py                   # FastAPI server — all /api/* endpoints
├── main_framework.py        # LangGraph agent, tools, service interfaces
├── app.py                   # Legacy Gradio UI (superseded by React frontend)
├── cleaned_data.csv         # Myntra product catalog (44K items)
├── final_image_features.npy
├── final_text_features.npy
├── requirements.txt
├── .env.example
└── frontend/                # React + Vite + Tailwind CSS v4
    ├── src/
    │   ├── pages/           # HomePage, StylePage, TryOnPage
    │   ├── hooks/           # useAgentChat, useTryOn
    │   ├── context/         # SavedLooksContext
    │   ├── components/
    │   └── api/client.js    # Axios instance (proxied to :8000)
    └── vite.config.js
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4.1-mini |
| `FASHN_API_KEY` | Recommended | FASHN API key — 10 free credits, $0.075/image after. [fashn.ai](https://fashn.ai) |
| `REPLICATE_API_TOKEN` | Alternative | Replicate token for IDM-VTON (non-commercial license) |
| `IMGBB_API_KEY` | Recommended | imgbb key for image hosting — required for try-on with uploaded photos. [api.imgbb.com](https://api.imgbb.com) |
| `ALLOWED_ORIGINS` | Production | Comma-separated allowed frontend origins (default: `http://localhost:5173`) |
| `VITE_API_URL` | Production | Backend URL used by Vite proxy (default: `http://localhost:8000`) |

---

## Dependencies

**Backend**
```
fastapi uvicorn[standard] python-multipart
langchain langchain-openai langgraph
pydantic python-dotenv
pandas numpy
torch torchvision transformers faiss-cpu   # for ProductRetrievalService (optional at runtime)
```

**Frontend**
```
react react-dom react-router-dom
axios framer-motion react-dropzone
@tailwindcss/vite tailwindcss
vite @vitejs/plugin-react
```
