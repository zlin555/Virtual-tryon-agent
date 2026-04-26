# Virtual Try-On Agent

An AI-powered virtual try-on pipeline built with **LangChain**, **OpenAI GPT-4.1-mini**, and the **FASHN API**. Users can describe what they want to wear in natural language or paste image URLs directly — the agent handles search, selection, and photo-realistic garment visualization.

---

## Architecture

```
User Input (natural language or image URLs)
        │
        ▼
  LangChain Agent (GPT-4.1-mini)
        │
        ├── search_fashion_images tool ──► Image Search Service
        │
        └── virtual_tryon tool ──────────► FASHN API (fashn.ai)
                                                  │
                                                  ▼
                                          Result image URL
```

This project is divided across four roles:

| Role | Responsibility |
|------|---------------|
| **Person 1** | LangChain agent, tool definitions, prompt engineering, conversation flow |
| **Person 2** | Product dataset, CLIP embeddings, FAISS similarity search |
| **Person 3** | Virtual try-on integration (FASHN API), image preprocessing, tool implementation |
| **Person 4** | Gradio UI, user study design, evaluation |

---

## Features

- **Natural language interface** — describe your fashion goal in plain English
- **Virtual try-on** — photo-realistic garment overlay powered by FASHN API (no GPU required)
- **Fashion image search** — find candidate garments before trying them on
- **Two UI modes** — Quick Try-On (direct image URLs) and AI Chat Assistant (agent-driven)
- **Plug-and-play backend** — swap try-on or search services without touching agent logic

---

## Quickstart

### 1. Clone and install

```bash
git clone https://github.com/wsylxy/Virtual-tryon-agent.git
cd Virtual-tryon-agent
pip install langchain langchain-openai pydantic python-dotenv gradio
```

### 2. Set API keys

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env`:

```
OPENAI_API_KEY=sk-...
FASHN_API_KEY=fa-...
```

**Get your keys:**
- **OpenAI** — https://platform.openai.com/api-keys
- **FASHN** — https://fashn.ai → Dashboard → API Keys (10 free credits on sign-up, $0.075/image after)

### 3. Run the UI

```bash
python app.py
```

Opens at **http://localhost:7860**

### 3b. Run the CLI demo (no UI)

```bash
python main_framework.py
```

---

## UI Overview

### Tab 1 — Quick Try-On

Paste two public image URLs (person photo + garment photo), pick a garment type, and click **Try On**. The result image appears in a few seconds.

**Where to get free image URLs:**
- Right-click any image on Unsplash / Imgur / Google Images → *Copy image address*
- Person photo: front-facing, good lighting, plain background recommended
- Garment photo: flat-lay or on-model shot with white/neutral background recommended

### Tab 2 — AI Fashion Assistant

Chat with the LangChain agent in natural language. Example prompts:

```
Find me minimalist black dresses for office wear.

I want to try on a beige trench coat.
My photo is https://… and the coat image is https://…
```

---

## Virtual Try-On Backend

The try-on module (`FashnTryOnService`) is a drop-in implementation of the `VirtualTryOnService` interface defined in `main_framework.py`. It requires no GPU and no model deployment — all inference runs on FASHN's cloud.

**Supported garment types:** top, jacket, coat, dress, pants, skirt, shorts

**Input:** two publicly accessible image URLs (person + garment)  
**Output:** a CDN-hosted result image URL, ready to display

To swap in a different backend (e.g., Replicate IDM-VTON), set `REPLICATE_API_TOKEN` instead of `FASHN_API_KEY`. The `_resolve_tryon_service()` function in `main_framework.py` handles the selection automatically.

---

## Project Structure

```
Virtual-tryon-agent/
├── main_framework.py    # LangChain agent, tool definitions, service interfaces
├── app.py               # Gradio UI (Quick Try-On + AI Chat tabs)
├── .env.example         # Template for environment variables
├── .gitignore
└── README.md
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for the LangChain agent |
| `FASHN_API_KEY` | Recommended | FASHN API key for virtual try-on |
| `REPLICATE_API_TOKEN` | Alternative | Replicate token (IDM-VTON, non-commercial) |

---

## Dependencies

```
langchain
langchain-openai
pydantic
python-dotenv
gradio
replicate          # optional, only for Replicate backend
```
