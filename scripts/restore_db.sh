#!/bin/bash
# ==============================================================================
# VOLONCE AI BILLING - POSTGRESQL DATABASE RESTORE SCRIPT
# ==============================================================================

set -e

if [ -z "$1" ]; then
    echo "❌ ભૂલ: કૃપા કરીને રીસ્ટોર કરવા માટે બેકઅપ ફાઇલનો પાથ આપો."
    echo "વપરાશ: ./scripts/restore_db.sh .storage/backups/volonce_db_backup_XXXX.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"
DB_USER="volonce_user"
DB_NAME="volonce_billing"
DB_CONTAINER="volonce-prod-postgres"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ બેકઅપ ફાઇલ મળી નથી: $BACKUP_FILE"
    exit 1
fi

echo "⚠️ ચેતવણી: આ ક્રિયાથી હાલનો ડેટાબેઝ ઓવરરાઈટ થશે!"
read -p "શું તમે ખરેખર ડેટા રીસ્ટોર કરવા માંગો છો? (y/N): " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "🔄 ડેટાબેઝ રીસ્ટોર થઈ રહ્યો છે..."
    gunzip -c "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
    echo "✅ ડેટાબેઝ સફળતાપૂર્વક રીસ્ટોર થઈ ગયો છે!"
else
    echo "રદ કરવામાં આવ્યું."
fi