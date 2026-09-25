from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "FarmAI API"
    environment: str = "development"
    api_prefix: str = "/api"
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "farmai"
    jwt_secret: str = "replace-this-with-a-long-random-secret-before-deployment"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_session_days: int = 30
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    upload_dir: str = "./uploads"
    max_upload_bytes: int = 10_000_000
    ai_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:8b"
    ollama_timeout_seconds: int = 120
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"
    gemini_timeout_seconds: int = 60
    stt_provider: str = "local"
    stt_model: str = "small"
    tts_provider: str = "local"
    tts_model: str | None = None
    weather_api_url: str | None = None
    weather_api_key: str | None = None
    market_api_url: str | None = None
    market_api_key: str | None = None
    schemes_api_url: str | None = None
    schemes_api_key: str | None = None
    model_dir: str = "./models"
    crop_model_path: str = "./models/crop_recommendation_model.pkl"
    disease_model_path: str = "./models/plant_disease_model.pth"
    log_level: str = "INFO"
    demo_mode: bool = False

    @model_validator(mode="after")
    def validate_security_settings(self):
        if self.environment.lower() == "production" and (len(self.jwt_secret) < 32 or self.jwt_secret.startswith("replace-this")):
            raise ValueError("Production requires a unique JWT_SECRET of at least 32 characters")
        if self.access_token_minutes < 1:
            raise ValueError("ACCESS_TOKEN_MINUTES must be positive")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
