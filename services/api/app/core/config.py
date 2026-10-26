from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        extra="ignore",
    )

    app_name: str = "VOLONCE AI BILLING API"
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_port: int = 5432
    postgres_host: str = "127.0.0.1"
    redis_port: int = 6379

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    refresh_token_days: int = 30

    # Phase 10 & 11: Google Gemini AI Vision API
    gemini_api_key: str = ""

    # Phase 12: Meta WhatsApp Cloud API credentials
    whatsapp_api_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_waba_id: str = ""

    # Phase 13 & 15: Razorpay Payment Gateway (UPI / Cards / NetBanking)
    razorpay_key_id: str = "rzp_test_TsaJVIkvM3i9jj"
    razorpay_key_secret: str = "nqoEGJZxurIYyUzF7kUpFRuZ"

    
    # External Website Integration (volonis.in)
    volonis_webhook_secret: str = "volonis_super_secure_secret_key_2026"


    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()