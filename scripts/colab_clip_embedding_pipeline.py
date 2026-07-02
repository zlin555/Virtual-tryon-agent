"""
Colab CLIP embedding pipeline for an expanded clothing product database.

Recommended runtime:
    Runtime -> Change runtime type -> T4 GPU, High-RAM if available

Outputs:
    /content/clip_fashion_export/cleaned_data.csv
    /content/clip_fashion_export/final_image_features.npy
    /content/clip_fashion_export/final_text_features.npy
    /content/clip_fashion_export/failed_images.csv

Colab install cell:
    !pip -q install transformers datasets huggingface_hub pillow requests tqdm pandas numpy safetensors
"""

from __future__ import annotations

import math
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable, Optional

import numpy as np
import pandas as pd
import requests
import torch
from datasets import load_dataset
from huggingface_hub import HfApi, hf_hub_url
from PIL import Image, ImageFile
from tqdm.auto import tqdm
from transformers import CLIPModel, CLIPProcessor

ImageFile.LOAD_TRUNCATED_IMAGES = True

# -------------------------
# Configuration
# -------------------------
DATASET_MODE = "hf"  # "hf" or "csv"
HF_INPUT_DATASET = "ashraq/fashion-product-images-small"
HF_INPUT_SPLIT = "train"
LOCAL_CSV_PATH = "/content/your_products.csv"

# If the source dataset has embedded/local images instead of public URLs,
# set this to a dataset repo you own, e.g. "zlin329/expanded-fashion-products".
# The script uploads materialized images and rewrites cleaned_data.csv link values
# to stable https://huggingface.co/datasets/.../resolve/main/... URLs.
HF_OUTPUT_DATASET_REPO = ""
HF_OUTPUT_PRIVATE = False
HF_TOKEN = os.environ.get("HF_TOKEN", "")

OUTPUT_DIR = Path("/content/clip_fashion_export")
IMAGE_DIR = OUTPUT_DIR / "images"
MAX_ROWS: Optional[int] = None  # Set 5000 for a smoke test; None for full dataset.

TEXT_BATCH_SIZE = 256
IMAGE_BATCH_SIZE = 128
DOWNLOAD_WORKERS = 32
REQUEST_TIMEOUT = 12
CLIP_MODEL_ID = "openai/clip-vit-base-patch32"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

CATEGORY_MAP = {
    "apparel set": "apparel",
    "bottomwear": "bottom",
    "bottom": "bottom",
    "topwear": "top",
    "top": "top",
    "dress": "dress",
    "dresses": "dress",
    "outerwear": "jacket",
    "jacket": "jacket",
    "jackets": "jacket",
    "coat": "coat",
    "coats": "coat",
    "pants": "pants",
    "trousers": "pants",
    "jeans": "pants",
    "skirt": "skirt",
    "skirts": "skirt",
    "shorts": "shorts",
    "shoes": "shoes",
    "bags": "bag",
    "bag": "bag",
    "belts": "belt",
    "headwear": "head",
    "eyewear": "eyewear",
    "gloves": "gloves",
}

SCHEMA_DEFAULTS = {
    "gender": "Unisex",
    "masterCategory": "Apparel",
    "subCategory": "clothing",
    "articleType": "Clothing",
    "baseColour": "",
    "season": "",
    "year": "",
    "usage": "",
    "productDisplayName": "Fashion product",
    "link": "",
    "price_usd": "",
}

COLUMN_ALIASES = {
    "id": ["id", "product_id", "item_id", "style_id"],
    "gender": ["gender", "genderType", "target_gender"],
    "masterCategory": ["masterCategory", "master_category", "category", "category_name"],
    "subCategory": ["subCategory", "sub_category", "product_type", "class", "label"],
    "articleType": ["articleType", "article_type", "article", "productDisplayType", "product_type"],
    "baseColour": ["baseColour", "base_color", "colour", "color", "primary_color"],
    "season": ["season"],
    "year": ["year"],
    "usage": ["usage", "occasion", "style", "aesthetic"],
    "productDisplayName": ["productDisplayName", "product_name", "name", "title", "description", "caption"],
    "link": ["link", "image_url", "imageUrl", "url", "img_url", "image_link", "filename"],
    "price_usd": ["price_usd", "price", "retail_price", "sale_price"],
}

IMAGE_COLUMN_CANDIDATES = ["image", "img", "picture", "pil_image"]
BACKEND_COLUMNS = [
    "id",
    "gender",
    "masterCategory",
    "subCategory",
    "articleType",
    "baseColour",
    "season",
    "year",
    "usage",
    "productDisplayName",
    "link",
    "text",
    "price_usd",
]


def first_existing_column(df: pd.DataFrame, candidates: Iterable[str]) -> Optional[str]:
    lower_to_original = {str(col).lower(): col for col in df.columns}
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
        found = lower_to_original.get(candidate.lower())
        if found is not None:
            return found
    return None


def normalize_category(value: str) -> str:
    raw = str(value or "").strip()
    key = raw.lower()
    return CATEGORY_MAP.get(key, key.replace(" ", "_") or "clothing")


def safe_filename(value: str, fallback: str) -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "")).strip("_")
    return text[:120] or fallback


def load_source_dataframe() -> tuple[pd.DataFrame, Optional[str]]:
    if DATASET_MODE == "hf":
        ds = load_dataset(HF_INPUT_DATASET, split=HF_INPUT_SPLIT)
        df = ds.to_pandas()
        return df, first_existing_column(df, IMAGE_COLUMN_CANDIDATES)
    if DATASET_MODE == "csv":
        df = pd.read_csv(LOCAL_CSV_PATH, on_bad_lines="skip")
        return df, first_existing_column(df, IMAGE_COLUMN_CANDIDATES)
    raise ValueError("DATASET_MODE must be 'hf' or 'csv'")


def normalize_metadata(df: pd.DataFrame) -> pd.DataFrame:
    normalized = pd.DataFrame()
    for target_col, aliases in COLUMN_ALIASES.items():
        source_col = first_existing_column(df, aliases)
        normalized[target_col] = df[source_col] if source_col else SCHEMA_DEFAULTS.get(target_col, "")

    if normalized["id"].isna().all() or normalized["id"].astype(str).str.strip().eq("").all():
        normalized["id"] = [f"expanded-{idx}" for idx in range(len(normalized))]

    normalized["id"] = normalized["id"].astype(str)
    normalized["subCategory"] = normalized["subCategory"].apply(normalize_category)
    normalized["productDisplayName"] = normalized["productDisplayName"].fillna("Fashion product").astype(str)
    normalized["text"] = (
        normalized["gender"].fillna("").astype(str)
        + " "
        + normalized["productDisplayName"].fillna("").astype(str)
        + " "
        + normalized["baseColour"].fillna("").astype(str)
        + " "
        + normalized["articleType"].fillna("").astype(str)
        + " "
        + normalized["season"].fillna("").astype(str)
        + " "
        + normalized["usage"].fillna("").astype(str)
    ).str.replace(r"\s+", " ", regex=True).str.strip()
    return normalized


def pil_from_cell(value) -> Optional[Image.Image]:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, Image.Image):
        return value.convert("RGB")
    if isinstance(value, dict):
        if value.get("bytes") is not None:
            from io import BytesIO

            return Image.open(BytesIO(value["bytes"])).convert("RGB")
        if value.get("path"):
            return Image.open(value["path"]).convert("RGB")
    return None


def download_image(url: str) -> Optional[Image.Image]:
    if not url or not str(url).startswith(("http://", "https://")):
        return None
    try:
        response = requests.get(
            str(url),
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "VirtualTryOnAgent/1.0"},
        )
        response.raise_for_status()
        from io import BytesIO

        return Image.open(BytesIO(response.content)).convert("RGB")
    except Exception:
        return None


def materialize_images(raw_df: pd.DataFrame, cleaned: pd.DataFrame, image_col: Optional[str]) -> pd.DataFrame:
    def materialize_one(idx: int) -> tuple[int, Optional[str], Optional[str]]:
        row = cleaned.iloc[idx]
        filename = safe_filename(row["id"], f"row_{idx}") + ".jpg"
        out_path = IMAGE_DIR / filename

        image = pil_from_cell(raw_df.iloc[idx][image_col]) if image_col else None
        if image is None:
            image = download_image(row.get("link", ""))
        if image is None:
            return idx, None, "image_load_failed"

        try:
            image.thumbnail((1024, 1024))
            image.save(out_path, format="JPEG", quality=92)
            return idx, str(out_path), None
        except Exception as exc:
            return idx, None, f"image_save_failed: {exc}"

    local_paths = [None] * len(cleaned)
    failures = []
    with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
        futures = [executor.submit(materialize_one, idx) for idx in range(len(cleaned))]
        for future in tqdm(as_completed(futures), total=len(futures), desc="Loading images"):
            idx, path, error = future.result()
            if path:
                local_paths[idx] = path
            else:
                failures.append({"row_index": idx, "id": cleaned.iloc[idx]["id"], "error": error})

    pd.DataFrame(failures).to_csv(OUTPUT_DIR / "failed_images.csv", index=False)
    cleaned = cleaned.copy()
    cleaned["local_image_path"] = local_paths
    return cleaned[cleaned["local_image_path"].notnull()].reset_index(drop=True)


def maybe_upload_images(cleaned: pd.DataFrame) -> pd.DataFrame:
    if not HF_OUTPUT_DATASET_REPO:
        missing_public_links = cleaned["link"].fillna("").astype(str).str.startswith(("http://", "https://")).eq(False).sum()
        if missing_public_links:
            print(
                f"Warning: {missing_public_links} rows do not have public image URLs. "
                "Set HF_OUTPUT_DATASET_REPO before production use."
            )
        return cleaned

    if not HF_TOKEN:
        raise ValueError("Set HF_TOKEN before uploading images to HF_OUTPUT_DATASET_REPO")

    api = HfApi(token=HF_TOKEN)
    api.create_repo(
        repo_id=HF_OUTPUT_DATASET_REPO,
        repo_type="dataset",
        private=HF_OUTPUT_PRIVATE,
        exist_ok=True,
    )
    api.upload_folder(
        repo_id=HF_OUTPUT_DATASET_REPO,
        repo_type="dataset",
        folder_path=str(IMAGE_DIR),
        path_in_repo="images",
    )
    cleaned = cleaned.copy()
    cleaned["link"] = cleaned["local_image_path"].apply(
        lambda path: hf_hub_url(
            repo_id=HF_OUTPUT_DATASET_REPO,
            filename=f"images/{Path(path).name}",
            repo_type="dataset",
        )
    )
    return cleaned


@torch.no_grad()
def encode_texts(
    model: CLIPModel,
    processor: CLIPProcessor,
    texts: list[str],
    device: str,
) -> np.ndarray:
    features = []
    for start in tqdm(range(0, len(texts), TEXT_BATCH_SIZE), desc="Encoding texts"):
        batch = texts[start : start + TEXT_BATCH_SIZE]
        inputs = processor(text=batch, return_tensors="pt", padding=True, truncation=True).to(device)
        text_outputs = model.text_model(
            input_ids=inputs["input_ids"],
            attention_mask=inputs["attention_mask"],
        )
        feats = model.text_projection(text_outputs.pooler_output)
        feats = feats / feats.norm(dim=-1, keepdim=True)
        features.append(feats.cpu().numpy().astype("float32"))
    return np.vstack(features)


@torch.no_grad()
def encode_images(
    model: CLIPModel,
    processor: CLIPProcessor,
    paths: list[str],
    device: str,
) -> np.ndarray:
    features = []
    for start in tqdm(range(0, len(paths), IMAGE_BATCH_SIZE), desc="Encoding images"):
        batch_paths = paths[start : start + IMAGE_BATCH_SIZE]
        images = [Image.open(path).convert("RGB") for path in batch_paths]
        inputs = processor(images=images, return_tensors="pt").to(device)
        feats = model.get_image_features(**inputs)
        feats = feats / feats.norm(dim=-1, keepdim=True)
        features.append(feats.cpu().numpy().astype("float32"))
    return np.vstack(features)


def main() -> None:
    raw_df, image_col = load_source_dataframe()
    if MAX_ROWS is not None:
        raw_df = raw_df.head(MAX_ROWS).copy()

    cleaned = normalize_metadata(raw_df)
    print("Loaded rows:", len(cleaned), "image_col:", image_col)

    cleaned = materialize_images(raw_df, cleaned, image_col)
    print("Usable images:", len(cleaned))
    cleaned = maybe_upload_images(cleaned)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("Device:", device)
    model = CLIPModel.from_pretrained(CLIP_MODEL_ID, use_safetensors=True).to(device).eval()
    processor = CLIPProcessor.from_pretrained(CLIP_MODEL_ID)

    text_features = encode_texts(model, processor, cleaned["text"].tolist(), device)
    image_features = encode_images(model, processor, cleaned["local_image_path"].tolist(), device)

    cleaned[BACKEND_COLUMNS].to_csv(OUTPUT_DIR / "cleaned_data.csv", index=False)
    np.save(OUTPUT_DIR / "final_text_features.npy", text_features)
    np.save(OUTPUT_DIR / "final_image_features.npy", image_features)

    print("Done.")
    print("cleaned_data.csv:", OUTPUT_DIR / "cleaned_data.csv", cleaned.shape)
    print("final_text_features.npy:", text_features.shape)
    print("final_image_features.npy:", image_features.shape)
    print("failed_images.csv:", OUTPUT_DIR / "failed_images.csv")


if __name__ == "__main__":
    main()
