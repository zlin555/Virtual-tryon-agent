"""
Virtual Try-On Agent — Gradio UI

Run:
    python app.py
"""

from __future__ import annotations

import os
import sys
import urllib.request
import tempfile
from pathlib import Path

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import gradio as gr

# Make sure we can import from the same directory
sys.path.insert(0, str(Path(__file__).parent))
from main_framework import (
    FashnTryOnService,
    TryOnInput,
    build_app_agent,
)

# ── Services ──────────────────────────────────────────────────────────────────

FASHN_KEY = os.getenv("FASHN_API_KEY", "")
if not FASHN_KEY:
    raise EnvironmentError("FASHN_API_KEY not set. Check your .env file.")

_tryon_svc = FashnTryOnService(api_key=FASHN_KEY)
_agent_app = build_app_agent()

# Sample images for quick demo
SAMPLE_PERSON   = "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=640"
SAMPLE_GARMENT  = "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=640"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _url_to_local(url: str) -> str | None:
    """Download a remote image to a temp file; return local path or None on error."""
    try:
        suffix = Path(url.split("?")[0]).suffix or ".jpg"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        req = urllib.request.Request(url, headers={"User-Agent": "VirtualTryOnAgent/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            tmp.write(resp.read())
        tmp.close()
        return tmp.name
    except Exception:
        return None


def _preview(url: str):
    """Return a local image path for Gradio to display, or None."""
    if not url or not url.strip():
        return None
    return _url_to_local(url.strip())


# ── Tab 1: Quick Try-On ───────────────────────────────────────────────────────

def run_tryon(person_input, garment_input, garment_type, style_note):
    """
    person_input / garment_input: either a URL string (from Textbox)
                                   or a local file path (from Image upload).
    Returns (result_image_path_or_None, status_message).
    """
    # Resolve person URL
    if isinstance(person_input, str) and person_input.strip().startswith("http"):
        person_url = person_input.strip()
    elif person_input:
        # It's an uploaded file path — we use it directly as a temp file
        # FASHN needs a URL; serve via data URI workaround isn't supported,
        # so we inform the user.
        return None, "⚠️ File upload detected. Please paste a public image URL instead (Unsplash, Imgur, etc.)."
    else:
        return None, "❌ Please provide a person image URL."

    # Resolve garment URL
    if isinstance(garment_input, str) and garment_input.strip().startswith("http"):
        garment_url = garment_input.strip()
    elif garment_input:
        return None, "⚠️ File upload detected. Please paste a public garment image URL."
    else:
        return None, "❌ Please provide a garment image URL."

    status_msg = "⏳ Running virtual try-on via FASHN API…"
    result = _tryon_svc.run_tryon(
        TryOnInput(
            person_image_url=person_url,
            garment_image_url=garment_url,
            garment_type=garment_type or None,
            style_note=style_note or None,
        )
    )

    if result.status == "success":
        local_result = _url_to_local(result.result_image_url)
        return local_result, f"✅ Done!\nResult URL: {result.result_image_url}"
    else:
        return None, f"❌ {result.message}"


def update_person_preview(url):
    return _preview(url)


def update_garment_preview(url):
    return _preview(url)


# ── Tab 2: Agent Chat ─────────────────────────────────────────────────────────

def agent_chat(message: str, history: list):
    if not message.strip():
        return "", history
    try:
        response = _agent_app.run(message.strip())
    except Exception as exc:
        response = f"❌ Agent error: {exc}"
    history = history + [(message, response)]
    return "", history


# ── Build UI ──────────────────────────────────────────────────────────────────

GARMENT_TYPES = ["", "top", "jacket", "coat", "dress", "pants", "skirt", "shorts"]

CSS = """
#result-img { min-height: 400px; }
.preview-row img { object-fit: cover; border-radius: 8px; }
footer { display: none !important; }
"""

with gr.Blocks(title="Virtual Try-On Agent") as demo:

    gr.Markdown(
        """
        # 👗 Virtual Try-On Agent
        Powered by **FASHN API** · **GPT-4.1-mini** · **LangChain**
        """
    )

    with gr.Tabs():

        # ── Tab 1 ──────────────────────────────────────────────────────────
        with gr.TabItem("✨ Quick Try-On"):
            gr.Markdown(
                "Paste public image URLs (Unsplash, Imgur, etc.) and click **Try On**."
            )

            with gr.Row(equal_height=False):

                # Left column — inputs
                with gr.Column(scale=1):
                    person_url_box = gr.Textbox(
                        label="Person Image URL",
                        value=SAMPLE_PERSON,
                        placeholder="https://…",
                        lines=2,
                    )
                    garment_url_box = gr.Textbox(
                        label="Garment Image URL",
                        value=SAMPLE_GARMENT,
                        placeholder="https://…",
                        lines=2,
                    )
                    with gr.Row():
                        garment_type_dd = gr.Dropdown(
                            label="Garment Type",
                            choices=GARMENT_TYPES,
                            value="jacket",
                        )
                        style_note_box = gr.Textbox(
                            label="Style Note (optional)",
                            placeholder="casual, office, streetwear…",
                        )
                    tryon_btn = gr.Button("✨ Try On", variant="primary", size="lg")
                    status_box = gr.Textbox(
                        label="Status",
                        interactive=False,
                        lines=3,
                    )

                # Right column — previews + result
                with gr.Column(scale=2):
                    with gr.Row(elem_classes="preview-row"):
                        person_preview  = gr.Image(
                            label="Person",
                            value=_preview(SAMPLE_PERSON),
                            height=220,
                            interactive=False,
                        )
                        garment_preview = gr.Image(
                            label="Garment",
                            value=_preview(SAMPLE_GARMENT),
                            height=220,
                            interactive=False,
                        )
                    result_img = gr.Image(
                        label="Try-On Result",
                        height=420,
                        interactive=False,
                        elem_id="result-img",
                    )

            # Live preview updates
            person_url_box.blur(update_person_preview, person_url_box, person_preview)
            garment_url_box.blur(update_garment_preview, garment_url_box, garment_preview)

            # Try-on
            tryon_btn.click(
                fn=run_tryon,
                inputs=[person_url_box, garment_url_box, garment_type_dd, style_note_box],
                outputs=[result_img, status_box],
            )

            gr.Markdown(
                """
                <details>
                <summary>💡 Where to get free image URLs?</summary>

                - **Unsplash**: right-click any photo → Copy image address
                - **Imgur**: upload a photo → right-click → Copy image address
                - **Google Images**: click image → right-click → Copy image address

                Person image tips: front-facing, good lighting, plain background works best.
                Garment image tips: flat-lay or model shot on white background works best.
                </details>
                """
            )

        # ── Tab 2 ──────────────────────────────────────────────────────────
        with gr.TabItem("🤖 AI Fashion Assistant"):
            gr.Markdown(
                """
                Chat with the AI assistant. It can **search for clothes** and **run virtual try-on** automatically.

                **Try saying:**
                - *"Find me minimalist black dresses for office wear"*
                - *"I want to try on a beige trench coat. My photo is [URL] and the coat is [URL]"*
                """
            )

            chatbot = gr.Chatbot(height=500)

            with gr.Row():
                msg_box = gr.Textbox(
                    placeholder="Type your message…",
                    label="",
                    lines=1,
                    scale=5,
                    autofocus=True,
                )
                send_btn = gr.Button("Send ➤", variant="primary", scale=1)

            gr.Examples(
                examples=[
                    ["Find me minimalist black dresses for office wear."],
                    [
                        "I want to try on a jacket. "
                        f"My photo is {SAMPLE_PERSON} "
                        f"and the jacket image is {SAMPLE_GARMENT}"
                    ],
                ],
                inputs=msg_box,
                label="Quick examples (click to load)",
            )

            msg_box.submit(agent_chat, [msg_box, chatbot], [msg_box, chatbot])
            send_btn.click(agent_chat, [msg_box, chatbot], [msg_box, chatbot])

# ── Launch ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Starting Virtual Try-On Agent UI…")
    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        share=False,
        inbrowser=True,
        css=CSS,
        theme=gr.themes.Soft(),
    )
