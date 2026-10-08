from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# services/api/app/core/config.py -> project root is 4 levels up
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
    postgres_host: str = "localhost"
    redis_port: int = 6379

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()