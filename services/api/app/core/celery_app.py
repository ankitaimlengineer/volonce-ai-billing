from celery import Celery
from app.core.config import settings

# Redis Broker URL (Docker અને Local બંને માટે)
redis_url = f"redis://{settings.postgres_host if settings.postgres_host != 'postgres' else 'redis'}:{settings.redis_port}/0"

celery_app = Celery(
    "volonce_worker",
    broker=redis_url,
    backend=redis_url,
    include=[
        "app.modules.whatsapp.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=60,  # 60 સેકન્ડથી વધુ ટાસ્ક નહિ ચાલે
    worker_prefetch_multiplier=1,
)