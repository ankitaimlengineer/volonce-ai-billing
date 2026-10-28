import io
import logging
from pathlib import Path
from typing import Protocol

from app.core.config import ROOT_DIR, settings

logger = logging.getLogger("uvicorn.error")
STORAGE_ROOT = (ROOT_DIR / ".storage").resolve()


class StorageProvider(Protocol):
    def save(self, key: str, data: bytes) -> None:
        ...

    def read(self, key: str) -> bytes | None:
        ...

    def delete(self, key: str) -> None:
        ...


class LocalStorage:
    """ડેવલપમેન્ટ અને લોકલ મોડ માટે ફોલ્ડર સ્ટોરેજ."""

    def _path(self, key: str) -> Path:
        path = (STORAGE_ROOT / key).resolve()
        # Path Traversal હુમલા અટકાવવા માટે સેફ્ટી ચેક
        if STORAGE_ROOT not in path.parents and path != STORAGE_ROOT:
            raise ValueError("Invalid storage key")
        return path

    def save(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def read(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.is_file():
            path.unlink()


class S3Storage:
    """AWS S3, Cloudflare R2 અને MinIO માટે પ્રોડક્શન ક્લાઉડ સ્ટોરેજ."""

    def __init__(self):
        import boto3
        from botocore.config import Config

        self.bucket_name = settings.s3_bucket_name
        boto_config = Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        )

        client_kwargs = {
            "service_name": "s3",
            "aws_access_key_id": settings.s3_access_key_id,
            "aws_secret_access_key": settings.s3_secret_access_key,
            "region_name": settings.s3_region_name or "auto",
            "config": boto_config,
        }

        # Cloudflare R2 અથવા MinIO કસ્ટમ એન્ડપોઇન્ટ
        if settings.s3_endpoint_url:
            client_kwargs["endpoint_url"] = settings.s3_endpoint_url

        self.s3_client = boto3.client(**client_kwargs)
        logger.info(
            "S3Storage initialized successfully (Bucket: %s, Endpoint: %s)",
            self.bucket_name,
            settings.s3_endpoint_url or "AWS S3 Default",
        )

    def save(self, key: str, data: bytes) -> None:
        content_type = detect_content_type(data)
        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def read(self, key: str) -> bytes | None:
        from botocore.exceptions import ClientError

        try:
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
            return response["Body"].read()
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("NoSuchKey", "404"):
                return None
            logger.error("S3 Read Error for key %s: %s", key, e)
            return None

    def delete(self, key: str) -> None:
        from botocore.exceptions import ClientError

        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
        except ClientError as e:
            logger.warning("S3 Delete failed for key %s: %s", key, e)


def detect_image_type(data: bytes) -> str | None:
    """ફાઇલ હેડર બાઇટ્સ પરથી સાચો ઈમેજ પ્રકાર ઓળખે છે."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def detect_content_type(data: bytes) -> str:
    """ઈમેજ અથવા PDF નો કન્ટેન્ટ-ટાઈપ ઑટોમેટિક નક્કી કરે છે."""
    img_type = detect_image_type(data)
    if img_type:
        return img_type
    if data.startswith(b"%PDF"):
        return "application/pdf"
    return "application/octet-stream"


def get_storage() -> StorageProvider:
    """કન્ફિગરેશન મુજબ S3 અથવા LocalStorage આપોઆપ પસંદ કરે છે."""
    if (
        getattr(settings, "storage_backend", "local").lower() == "s3"
        and getattr(settings, "s3_access_key_id", None)
        and getattr(settings, "s3_secret_access_key", None)
    ):
        try:
            return S3Storage()
        except Exception as e:
            logger.error("Failed to connect to S3, falling back to LocalStorage: %s", e)
            return LocalStorage()
    return LocalStorage()


# સમગ્ર એપ્લિકેશનમાં વપરાતો ગ્લોબલ ઑબ્જેક્ટ
storage: StorageProvider = get_storage()