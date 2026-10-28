from celery import Celery
from app.core.config import settings

# Settings માંથી સીધો જ સેટ થયેલો Redis URL લેશે
redis_url = settings.redis_url

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
    task_time_limit=120,          # ટાસ્ક માટે મહત્તમ ૨ મિનિટ
    task_soft_time_limit=90,      # સોફ્ટ ટાઇમઆઉટ ૯૦ સેકન્ડ
    worker_prefetch_multiplier=1,
    # 🚀 રિયલ બેકગ્રાઉન્ડ અસિંક્રોનસ કતાર (Redis Queue) સક્રિય કરી:
    task_always_eager=False,
    task_eager_propagates=False,
)