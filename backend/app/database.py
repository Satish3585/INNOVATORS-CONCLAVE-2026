import logging
from contextlib import asynccontextmanager
from typing import Any

import certifi
from pymongo import ASCENDING, DESCENDING, GEOSPHERE, AsyncMongoClient
from pymongo.errors import PyMongoError

from app.config import settings

logger = logging.getLogger(__name__)


class Database:
    client: AsyncMongoClient | None = None
    db: Any = None

    @classmethod
    async def connect(cls) -> None:
        """Connect directly to the online MongoDB Atlas cluster."""
        cls.client = AsyncMongoClient(
            settings.mongodb_uri,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=5000,
            tz_aware=True,
        )
        cls.db = cls.client[settings.mongodb_database]
        try:
            await cls.client.admin.command("ping")
            await cls.ensure_indexes()
            logger.info("Successfully connected to online MongoDB Atlas: %s", settings.mongodb_database)
        except Exception as exc:
            if cls.client:
                await cls.client.close()
            cls.client = None
            cls.db = None
            logger.error("Failed to connect to online MongoDB Atlas at %s: %s", settings.mongodb_uri, exc)
            raise

    @classmethod
    async def close(cls) -> None:
        if cls.client:
            await cls.client.close()
        cls.client = None
        cls.db = None

    @classmethod
    async def ensure_indexes(cls) -> None:
        if cls.db is None:
            raise RuntimeError("MongoDB is not connected")
        indexes = {
            "sessions": [("jti", ASCENDING)],
            "farms": [("owner_id", ASCENDING), ("location.coordinates", GEOSPHERE)],
            "fields": [("owner_id", ASCENDING), ("farm_id", ASCENDING), ("location.coordinates", GEOSPHERE)],
            "cultivations": [("owner_id", ASCENDING), ("field_id", ASCENDING), ("status", ASCENDING)],
            "crops": [("owner_id", ASCENDING), ("cultivation_id", ASCENDING), ("field_id", ASCENDING)],
            "tasks": [("owner_id", ASCENDING), ("due_date", ASCENDING), ("status", ASCENDING)],
            "notifications": [("owner_id", ASCENDING), ("read_at", ASCENDING), ("created_at", DESCENDING)],
            "listings": [("status", ASCENDING), ("crop_name", ASCENDING), ("location.coordinates", GEOSPHERE)],
            "transactions": [("farmer_id", ASCENDING), ("buyer_id", ASCENDING), ("status", ASCENDING)],
            "ai_conversations": [("owner_id", ASCENDING), ("updated_at", DESCENDING)],
            "uploads": [("owner_id", ASCENDING), ("created_at", DESCENDING)],
            "soil_tests": [("owner_id", ASCENDING), ("field_id", ASCENDING), ("test_date", DESCENDING)],
            "documents": [("owner_id", ASCENDING), ("field_id", ASCENDING), ("crop_id", ASCENDING)],
        }
        for collection, specs in indexes.items():
            for field, direction in specs:
                try:
                    await cls.db[collection].create_index([(field, direction)])
                except Exception as e:
                    logger.debug("Index creation note on %s: %s", collection, e)
        try:
            await cls.db.users.create_index([("email", ASCENDING)], unique=True)
            await cls.db.sessions.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
            await cls.db.idempotency.create_index([("owner_id", ASCENDING), ("key", ASCENDING)], unique=True)
        except Exception as e:
            logger.debug("Unique index creation note: %s", e)

    @classmethod
    async def ping(cls) -> bool:
        if cls.client is None:
            try:
                await cls.connect()
                return True
            except Exception:
                return False
        try:
            await cls.client.admin.command("ping")
            return True
        except PyMongoError:
            try:
                await cls.connect()
                return True
            except Exception:
                return False


@asynccontextmanager
async def lifespan(app):
    try:
        await Database.connect()
        app.state.database_ready = True
    except Exception:
        app.state.database_ready = False
    yield
    await Database.close()


async def get_db():
    if Database.db is None:
        try:
            await Database.connect()
        except Exception:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=503,
                detail="MongoDB Atlas is not accessible. Please ensure your IP is whitelisted in MongoDB Atlas Network Access.",
            )
    return Database.db
