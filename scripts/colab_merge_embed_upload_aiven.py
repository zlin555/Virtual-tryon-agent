"""
Merge fashion product datasets, compute CLIP embeddings on Colab, and upload to Aiven MySQL.

This script is designed for your current retrieval architecture:
- Keep public image URLs in `link`; do not upload images unless a source lacks URLs.
- Use Colab GPU only to temporarily download images for CLIP embedding.
- Store product metadata plus image/text embeddings in Aiven.
- Let the backend build FAISS in memory from the SQL rows at startup.

Colab install cell:
    !pip -q install transformers datasets huggingface_hub pillow requests tqdm pandas numpy sqlalchemy pymysql safetensors

Sensitive credentials:
    Set DATABASE_URL in Colab Secrets or paste it when prompted.
    Format: mysql+pymysql://USER:PASSWORD@HOST:PORT/defaultdb
"""

from __future__ import annotations

import getpass
import json
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
from PIL import Image, ImageFile
from sqlalchemy import create_engine, text
from tqdm.auto import tqdm
from transformers import CLIPModel, CLIPProcessor

ImageFile.LOAD_TRUNCATED_IMAGES = True

# -------------------------
# Configuration
# -------------------------
OUTPUT_DIR = Path("/content/clip_fashion_sql_export")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CLIP_MODEL_ID = "openai/clip-vit-base-patch32"
TEXT_BATCH_SIZE = 256
IMAGE_BATCH_SIZE = 128
DOWNLOAD_WORKERS = 32
REQUEST_TIMEOUT = 12
MAX_ROWS_TOTAL: Optional[int] = None

# Original project data. Prefer an uploaded /content/cleaned_data.csv if present.
ORIGINAL_CLEANED_CSV_PATH = "/content/cleaned_data.csv"
ORIGINAL_CLEANED_CSV_URL = "https://raw.githubusercontent.com/zlin555/Virtual-tryon-agent/main/cleaned_data.csv"

# Optional supplement sources. Turn these on/off depending on what you want to run.
USE_AMAZON_2023 = True
AMAZON_CONFIG = "raw_meta_Clothing_Shoes_and_Jewelry"
MAX_AMAZON_ROWS = 60000

USE_KAGGLE_CSV = True
KAGGLE_PRODUCT_TEXT_CSV = "/content/fashion_product_image_text.csv"
MAX_KAGGLE_ROWS: Optional[int] = None

# DeepFashion/DeepFashion2 official releases usually do not provide stable public product URLs.
# Use a manifest CSV you prepare/upload with at least one image URL column:
# image_url/link/url, plus optional title/category/gender/color/price columns.
USE_DEEPFASHION_MANIFEST = True
DEEPFASHION_MANIFEST_CSV = "/content/deepfashion_manifest.csv"
MAX_DEEPFASHION_ROWS: Optional[int] = None

MYSQL_TABLE = "fashion_products"
SOURCE_RUN_NAME = "colab_static_merge_v1"

CATEGORY_MAP = {
    "apparel set": "apparel",
    "bottomwear": "bottom",
    "bottom": "bottom",
    "topwear": "top",
    "top": "top",
    "shirt": "top",
    "shirts": "top",
    "t-shirt": "top",
    "tshirts": "top",
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
    "sneakers": "shoes",
    "boots": "shoes",
    "bags": "bag",
    "bag": "bag",
    "belt": "belt",
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
    "id": ["id", "product_id", "item_id", "style_id", "parent_asin", "asin"],
    "gender": ["gender", "genderType", "target_gender"],
    "masterCategory": ["masterCategory", "master_category", "main_category", "category", "category_name"],
    "subCategory": ["subCategory", "sub_category", "product_type", "class", "label"],
    "articleType": ["articleType", "article_type", "article", "productDisplayType", "product_type"],
    "baseColour": ["baseColour", "base_color", "colour", "color", "primary_color"],
    "season": ["season"],
    "year": ["year"],
    "usage": ["usage", "occasion", "style", "aesthetic"],
    "productDisplayName": ["productDisplayName", "product_name", "name", "title", "description", "caption"],
    "link": ["link", "image_url", "imageUrl", "url", "img_url", "image_link"],
    "price_usd": ["price_usd", "price", "retail_price", "sale_price"],
}

BACKEND_COLUMNS = [
    "id",
    "source_dataset",
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


def scalar(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    if isinstance(value, (list, tuple)):
        return " > ".join(str(v) for v in value if v)
    return str(value)


def is_public_url(value: str) -> bool:
    return str(value or "").startswith(("http://", "https://"))


def normalize_generic(df: pd.DataFrame, source_dataset: str, id_prefix: str) -> pd.DataFrame:
    normalized = pd.DataFrame()
    for target_col, aliases in COLUMN_ALIASES.items():
        source_col = first_existing_column(df, aliases)
        normalized[target_col] = df[source_col] if source_col else SCHEMA_DEFAULTS.get(target_col, "")

    if normalized["id"].isna().all() or normalized["id"].astype(str).str.strip().eq("").all():
        normalized["id"] = [f"{id_prefix}-{idx}" for idx in range(len(normalized))]

    normalized["source_dataset"] = source_dataset
    normalized["id"] = id_prefix + ":" + normalized["id"].astype(str)
    normalized["subCategory"] = normalized["subCategory"].apply(normalize_category)
    normalized["productDisplayName"] = normalized["productDisplayName"].apply(scalar).replace("", "Fashion product")
    normalized["link"] = normalized["link"].apply(scalar)
    normalized["price_usd"] = normalized["price_usd"].apply(scalar)

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

    return normalized[BACKEND_COLUMNS]


def load_original() -> pd.DataFrame:
    if Path(ORIGINAL_CLEANED_CSV_PATH).exists():
        df = pd.read_csv(ORIGINAL_CLEANED_CSV_PATH, on_bad_lines="skip")
    else:
        df = pd.read_csv(ORIGINAL_CLEANED_CSV_URL, on_bad_lines="skip")
    return normalize_generic(df, "myntra_cleaned_data", "myntra")


def extract_amazon_image_url(images_value) -> str:
    if images_value is None:
        return ""
    if isinstance(images_value, float) and math.isnan(images_value):
        return ""
    if isinstance(images_value, str):
        try:
            images_value = json.loads(images_value)
        except Exception:
            return images_value if is_public_url(images_value) else ""
    if isinstance(images_value, dict):
        for key in ("large", "hi_res", "variant", "main", "url"):
            candidate = images_value.get(key)
            if is_public_url(candidate):
                return candidate
        return ""
    if isinstance(images_value, list):
        for item in images_value:
            url = extract_amazon_image_url(item)
            if url:
                return url
    return ""


def load_amazon() -> pd.DataFrame:
    ds = load_dataset(
        "McAuley-Lab/Amazon-Reviews-2023",
        AMAZON_CONFIG,
        split="full",
        trust_remote_code=True,
    )
    if MAX_AMAZON_ROWS is not None:
        ds = ds.select(range(min(MAX_AMAZON_ROWS, len(ds))))
    df = ds.to_pandas()
    if "images" in df.columns:
        df["link"] = df["images"].apply(extract_amazon_image_url)
    if "categories" in df.columns:
        df["subCategory"] = df["categories"].apply(lambda value: scalar(value).split(" > ")[-1])
        df["usage"] = df["categories"].apply(scalar)
    return normalize_generic(df, f"amazon_2023_{AMAZON_CONFIG}", "amazon")


def load_optional_csv(path: str, source_dataset: str, id_prefix: str, max_rows: Optional[int]) -> pd.DataFrame:
    if not Path(path).exists():
        print(f"Skipping {source_dataset}: {path} not found.")
        return pd.DataFrame(columns=BACKEND_COLUMNS)
    df = pd.read_csv(path, on_bad_lines="skip")
    if max_rows is not None:
        df = df.head(max_rows)
    return normalize_generic(df, source_dataset, id_prefix)


def load_all_sources() -> pd.DataFrame:
    frames = [load_original()]
    if USE_AMAZON_2023:
        frames.append(load_amazon())
    if USE_KAGGLE_CSV:
        frames.append(load_optional_csv(KAGGLE_PRODUCT_TEXT_CSV, "kaggle_fashion_product_image_text", "kaggle", MAX_KAGGLE_ROWS))
    if USE_DEEPFASHION_MANIFEST:
        frames.append(load_optional_csv(DEEPFASHION_MANIFEST_CSV, "deepfashion_manifest", "deepfashion", MAX_DEEPFASHION_ROWS))

    merged = pd.concat(frames, ignore_index=True)
    merged = merged[merged["link"].apply(is_public_url)].copy()
    merged = merged.drop_duplicates(subset=["link"], keep="first")
    merged = merged.drop_duplicates(subset=["id"], keep="first")
    if MAX_ROWS_TOTAL is not None:
        merged = merged.head(MAX_ROWS_TOTAL).copy()
    merged = merged.reset_index(drop=True)
    print("Merged usable URL rows:", merged.shape)
    print(merged["source_dataset"].value_counts())
    return merged


def download_image(url: str) -> Optional[Image.Image]:
    try:
        response = requests.get(
            url,
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": "VirtualTryOnAgent/1.0"},
        )
        response.raise_for_status()
        from io import BytesIO

        return Image.open(BytesIO(response.content)).convert("RGB")
    except Exception:
        return None


@torch.no_grad()
def encode_texts(model: CLIPModel, processor: CLIPProcessor, texts: list[str], device: str) -> np.ndarray:
    chunks = []
    for start in tqdm(range(0, len(texts), TEXT_BATCH_SIZE), desc="Encoding texts"):
        batch = texts[start : start + TEXT_BATCH_SIZE]
        inputs = processor(text=batch, return_tensors="pt", padding=True, truncation=True).to(device)
        outputs = model.text_model(input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"])
        feats = model.text_projection(outputs.pooler_output)
        feats = feats / feats.norm(dim=-1, keepdim=True)
        chunks.append(feats.cpu().numpy().astype("float32"))
    return np.vstack(chunks)


@torch.no_grad()
def encode_images_from_urls(
    model: CLIPModel,
    processor: CLIPProcessor,
    df: pd.DataFrame,
    device: str,
) -> tuple[pd.DataFrame, np.ndarray]:
    kept_rows = []
    feature_chunks = []

    for start in tqdm(range(0, len(df), IMAGE_BATCH_SIZE), desc="Image batches"):
        batch_df = df.iloc[start : start + IMAGE_BATCH_SIZE].copy()
        loaded: list[tuple[int, Image.Image]] = []
        failed = []

        with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
            futures = {
                executor.submit(download_image, row.link): idx
                for idx, row in batch_df.iterrows()
            }
            for future in as_completed(futures):
                idx = futures[future]
                image = future.result()
                if image is None:
                    failed.append(idx)
                else:
                    loaded.append((idx, image))

        if not loaded:
            continue

        loaded.sort(key=lambda item: item[0])
        indices = [idx for idx, _ in loaded]
        images = [image for _, image in loaded]
        inputs = processor(images=images, return_tensors="pt").to(device)
        feats = model.get_image_features(**inputs)
        feats = feats / feats.norm(dim=-1, keepdim=True)
        kept_rows.append(df.loc[indices])
        feature_chunks.append(feats.cpu().numpy().astype("float32"))

    if not kept_rows:
        raise RuntimeError("No images could be loaded from URL sources.")

    return pd.concat(kept_rows, ignore_index=True), np.vstack(feature_chunks)


def vector_to_blob(vector: np.ndarray) -> bytes:
    return np.asarray(vector, dtype="float32").tobytes()


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        database_url = getpass.getpass("Paste Aiven DATABASE_URL (input hidden): ").strip()
    if not database_url:
        raise ValueError("DATABASE_URL is required.")
    return database_url


def create_tables(engine) -> None:
    ddl = f"""
    CREATE TABLE IF NOT EXISTS {MYSQL_TABLE} (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        catalog_product_id VARCHAR(255) NOT NULL UNIQUE,
        source_dataset VARCHAR(128) NOT NULL,
        gender VARCHAR(80),
        masterCategory VARCHAR(120),
        subCategory VARCHAR(120),
        articleType VARCHAR(160),
        baseColour VARCHAR(120),
        season VARCHAR(80),
        year VARCHAR(40),
        usage_text TEXT,
        productDisplayName TEXT,
        link TEXT NOT NULL,
        text_description TEXT,
        price_usd VARCHAR(64),
        embedding_dim INT NOT NULL DEFAULT 512,
        image_embedding_blob LONGBLOB NOT NULL,
        text_embedding_blob LONGBLOB NOT NULL,
        metadata_json JSON NULL,
        source_run VARCHAR(128),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_source_dataset (source_dataset),
        INDEX idx_gender (gender),
        INDEX idx_subcategory (subCategory),
        INDEX idx_articletype (articleType)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """
    with engine.begin() as conn:
        conn.execute(text(ddl))


def upload_to_mysql(df: pd.DataFrame, image_features: np.ndarray, text_features: np.ndarray) -> None:
    database_url = get_database_url()
    engine = create_engine(database_url, pool_pre_ping=True, connect_args={"ssl": {}})
    create_tables(engine)

    sql = text(
        f"""
        INSERT INTO {MYSQL_TABLE} (
            catalog_product_id, source_dataset, gender, masterCategory, subCategory,
            articleType, baseColour, season, year, usage_text, productDisplayName,
            link, text_description, price_usd, embedding_dim, image_embedding_blob,
            text_embedding_blob, metadata_json, source_run
        )
        VALUES (
            :catalog_product_id, :source_dataset, :gender, :masterCategory, :subCategory,
            :articleType, :baseColour, :season, :year, :usage_text, :productDisplayName,
            :link, :text_description, :price_usd, :embedding_dim, :image_embedding_blob,
            :text_embedding_blob, :metadata_json, :source_run
        )
        ON DUPLICATE KEY UPDATE
            source_dataset = VALUES(source_dataset),
            gender = VALUES(gender),
            masterCategory = VALUES(masterCategory),
            subCategory = VALUES(subCategory),
            articleType = VALUES(articleType),
            baseColour = VALUES(baseColour),
            season = VALUES(season),
            year = VALUES(year),
            usage_text = VALUES(usage_text),
            productDisplayName = VALUES(productDisplayName),
            link = VALUES(link),
            text_description = VALUES(text_description),
            price_usd = VALUES(price_usd),
            embedding_dim = VALUES(embedding_dim),
            image_embedding_blob = VALUES(image_embedding_blob),
            text_embedding_blob = VALUES(text_embedding_blob),
            metadata_json = VALUES(metadata_json),
            source_run = VALUES(source_run)
        """
    )

    batch_size = 500
    records = []
    for i, row in df.iterrows():
        records.append(
            {
                "catalog_product_id": str(row["id"]),
                "source_dataset": str(row["source_dataset"]),
                "gender": scalar(row["gender"]),
                "masterCategory": scalar(row["masterCategory"]),
                "subCategory": scalar(row["subCategory"]),
                "articleType": scalar(row["articleType"]),
                "baseColour": scalar(row["baseColour"]),
                "season": scalar(row["season"]),
                "year": scalar(row["year"]),
                "usage_text": scalar(row["usage"]),
                "productDisplayName": scalar(row["productDisplayName"]),
                "link": scalar(row["link"]),
                "text_description": scalar(row["text"]),
                "price_usd": scalar(row["price_usd"]),
                "embedding_dim": int(image_features.shape[1]),
                "image_embedding_blob": vector_to_blob(image_features[i]),
                "text_embedding_blob": vector_to_blob(text_features[i]),
                "metadata_json": json.dumps({"source_run": SOURCE_RUN_NAME}, ensure_ascii=False),
                "source_run": SOURCE_RUN_NAME,
            }
        )
        if len(records) >= batch_size:
            with engine.begin() as conn:
                conn.execute(sql, records)
            print("Uploaded rows:", i + 1)
            records = []

    if records:
        with engine.begin() as conn:
            conn.execute(sql, records)
    print("Aiven upload complete:", len(df), "rows")


def main() -> None:
    df = load_all_sources()
    df.to_csv(OUTPUT_DIR / "merged_candidates_before_image_filter.csv", index=False)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("Device:", device)
    model = CLIPModel.from_pretrained(CLIP_MODEL_ID, use_safetensors=True).to(device).eval()
    processor = CLIPProcessor.from_pretrained(CLIP_MODEL_ID)

    df, image_features = encode_images_from_urls(model, processor, df, device)
    text_features = encode_texts(model, processor, df["text"].tolist(), device)

    df.to_csv(OUTPUT_DIR / "cleaned_data_merged.csv", index=False)
    np.save(OUTPUT_DIR / "final_image_features_merged.npy", image_features)
    np.save(OUTPUT_DIR / "final_text_features_merged.npy", text_features)
    print("Final merged rows:", len(df))
    print("Image features:", image_features.shape)
    print("Text features:", text_features.shape)

    upload_to_mysql(df, image_features, text_features)


if __name__ == "__main__":
    main()
