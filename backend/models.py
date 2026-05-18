from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    saved_items = relationship("UserSavedItem", back_populates="user", cascade="all, delete-orphan")
    long_term_memories = relationship("UserLongTermMemory", back_populates="user", cascade="all, delete-orphan")
    conversation_history = relationship("UserConversationHistory", back_populates="user", cascade="all, delete-orphan")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    display_name = Column(String(120), nullable=True)
    avatar_url = Column(Text, nullable=True)
    avatar_color = Column(String(32), nullable=True)
    preferences_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="profile")


class UserSavedItem(Base):
    __tablename__ = "user_saved_items"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_user_saved_product"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(120), nullable=False, index=True)
    product_name = Column(String(255), nullable=False, index=True)
    product_image_url = Column(Text, nullable=False)
    product_category = Column(String(120), nullable=True, index=True)
    product_gender = Column(String(40), nullable=True, index=True)
    search_keyword = Column(String(255), nullable=True)
    product_payload_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="saved_items")


class UserLongTermMemory(Base):
    __tablename__ = "user_long_term_memories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    memory_type = Column(String(64), nullable=False, default="style_preference", index=True)
    memory_text = Column(Text, nullable=False)
    source_session_id = Column(String(120), nullable=True, index=True)
    source_window_start = Column(Integer, nullable=True)
    source_window_end = Column(Integer, nullable=True)
    confidence = Column(Float, nullable=False, default=0.5)
    embedding_json = Column(JSON, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="long_term_memories")


class UserConversationHistory(Base):
    __tablename__ = "user_conversation_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(120), nullable=False, default="primary", index=True)
    turn_index = Column(Integer, nullable=False)
    role = Column(String(20), nullable=False, index=True)
    message_text = Column(Text, nullable=False)
    message_summary = Column(Text, nullable=True)
    products_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User", back_populates="conversation_history")
