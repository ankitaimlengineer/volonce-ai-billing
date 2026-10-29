#!/bin/bash
# ==============================================================================
# VOLONCE AI BILLING - AUTOMATED POSTGRESQL S3 BACKUP SCRIPT
# ==============================================================================

set -e

# પ્રોજેક્ટ રૂટ અને એન્વાયર્નમેન્ટ લોડ કરો
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$ROOT_DIR/.env" ]; then
    export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
fi

DB_USER="${POSTGRES_USER:-volonce_user}"
DB_NAME="${POSTGRES_DB:-volonce_billing}"
DB_CONTAINER="volonce-prod-postgres"

BACKUP_DIR="$ROOT_DIR/.storage/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="volonce_db_backup_${TIMESTAMP}.sql.gz"
BACKUP_FILEPATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

mkdir -p "$BACKUP_DIR"

echo "======================================================"
echo "🚀 VOLONCE DB Backup શરૂ થઈ રહ્યું છે: ${TIMESTAMP}"
echo "======================================================"

# ૧. PostgreSQL કન્ટેનરમાંથી ડેટાબેઝ ડમ્પ લો
echo "📦 1. ડેટાબેઝ ડમ્પ અને કમ્પ્રેશન શરૂ..."
docker exec -t "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILEPATH"

FILESIZE=$(du -h "$BACKUP_FILEPATH" | cut -f1)
echo "✅ ડમ્પ સફળ! ફાઇલ સાઈઝ: ${FILESIZE}"

# ૨. જો S3 / Cloudflare R2 ક્રેડેન્શિયલ્સ હોય તો ક્લાઉડમાં અપલોડ કરો
if [ -n "$S3_BUCKET_NAME" ] && [ -n "$S3_ACCESS_KEY_ID" ] && [ -n "$S3_SECRET_ACCESS_KEY" ]; then
    echo "☁️ 2. S3 / Cloudflare R2 ક્લાઉડ સ્ટોરેજ પર અપલોડ થઈ રહ્યું છે..."
    
    python3 - <<EOF
import os, boto3
from botocore.config import Config

endpoint = os.getenv("S3_ENDPOINT_URL")
kwargs = {
    "service_name": "s3",
    "aws_access_key_id": os.getenv("S3_ACCESS_KEY_ID"),
    "aws_secret_access_key": os.getenv("S3_SECRET_ACCESS_KEY"),
    "region_name": os.getenv("S3_REGION_NAME", "auto"),
}
if endpoint:
    kwargs["endpoint_url"] = endpoint

s3 = boto3.client(**kwargs)
bucket = os.getenv("S3_BUCKET_NAME")
filepath = "$BACKUP_FILEPATH"
filename = "backups/$BACKUP_FILENAME"

s3.upload_file(filepath, bucket, filename)
print(f"✅ S3 ક્લાઉડ પર સફળતાપૂર્વક અપલોડ થઈ ગયું: s3://{bucket}/{filename}")
EOF
else
    echo "ℹ️ S3 ક્રેડેન્શિયલ્સ નથી, તેથી બેકઅપ લોકલ સ્ટોરેજમાં સાચવવામાં આવ્યું છે: ${BACKUP_FILEPATH}"
fi

# ૩. ૭ દિવસથી જૂના બેકઅપ આપોઆપ ડિલીટ કરો (Storage Management)
echo "🧹 3. જૂના બેકઅપ સાફ કરી રહ્યા છીએ..."
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +7 -delete

echo "🎉 બેકઅપ પ્રક્રિયા ૧૦૦% સફળતાપૂર્વક પૂર્ણ થઈ!"
echo "======================================================"