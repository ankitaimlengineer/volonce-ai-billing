from pathlib import Path

from app.core.config import ROOT_DIR

STORAGE_ROOT = (ROOT_DIR / ".storage").resolve()


class LocalStorage:
    """Dev storage. Replace this class with an S3-compatible one in production."""

    def _path(self, key: str) -> Path:
        path = (STORAGE_ROOT / key).resolve()
        # Block path traversal: the file must stay inside STORAGE_ROOT
        if STORAGE_ROOT not in path.parents:
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


storage = LocalStorage()


def detect_image_type(data: bytes) -> str | None:
    """Detect real image type from file bytes (do not trust the filename)."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None