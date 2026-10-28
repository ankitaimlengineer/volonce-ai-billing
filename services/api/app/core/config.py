from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# પ્રોજેક્ટનું રૂટ ફોલ્ડર જ્યાં .env ફાઇલ છે
ROOT_DIR = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        extra="ignore",
    )

    app_name: str = "VOLONCE AI BILLING API"

    # ---------------- DATABASE (POSTGRESQL) ----------------
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_port: int = 5432
    postgres_host: str = "127.0.0.1"

    # ---------------- CACHE / QUEUE (REDIS) ----------------
    redis_host: str = "127.0.0.1"
    redis_port: int = 6379

    # ---------------- AUTHENTICATION & SECURITY (JWT) ----------------
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    refresh_token_days: int = 30

    # ---------------- AI MODULE (GOOGLE GEMINI VISION) ----------------
    gemini_api_key: str = ""

    # ---------------- WHATSAPP CLOUD API (META) ----------------
    whatsapp_api_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_waba_id: str = ""
    whatsapp_verify_token: str = "volonce_wa_verify_2026"

    # ---------------- PAYMENT GATEWAY (RAZORPAY) ----------------
    razorpay_key_id: str = "rzp_test_TsaJVIkvM3i9jj"
    razorpay_key_secret: str = "nqoEGJZxurIYyUzF7kUpFRuZ"

    # ---------------- EXTERNAL WEBSITE WEBHOOK (volonis.in) ----------------
    volonis_webhook_secret: str = "volonis_super_secure_secret_key_2026"

    # ---------------- CLOUD OBJECT STORAGE (S3 / R2 / MINIO) ----------------
    # વિકલ્પો: "local" (ડેવલપમેન્ટ માટે) અથવા "s3" (પ્રોડક્શન માટે)
    storage_backend: str = "local"
    s3_endpoint_url: str | None = None  # Cloudflare R2 માટે: https://<account_id>.r2.cloudflarestorage.com
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_bucket_name: str = "volonce-storage"
    s3_region_name: str = "auto"  # AWS માટે: ap-south-1, Cloudflare R2 માટે: auto

    # ---------------- DYNAMIC CONNECTION URLS ----------------
    @property
    def database_url(self) -> str:
        """PostgreSQL માટે કનેક્શન URL."""
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_url(self) -> str:
        """Celery Worker અને Caching માટે Redis કનેક્શન URL."""
        return f"redis://{self.redis_host}:{self.redis_port}/0"


settings = Settings()