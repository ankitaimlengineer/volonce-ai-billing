import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.deps import get_db, require_roles
from app.models import Customer, Invoice, Organization, User
from app.modules.whatsapp.client import (
    generate_whatsapp_intent_link,
    send_meta_cloud_message,
)
from app.modules.whatsapp.schemas import WhatsAppSendRequest, WhatsAppSendResponse

router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])
can_write = require_roles("owner", "manager", "cashier")


@router.post("/send/{invoice_id}", response_model=WhatsAppSendResponse)
async def send_invoice_whatsapp(
    invoice_id: uuid.UUID,
    data: WhatsAppSendRequest,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    # 1. Fetch Invoice
    inv = db.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.organization_id == user.organization_id,
        )
    )
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice મળ્યું નથી.",
        )

    # 2. Fetch Business Profile
    org = db.scalar(
        select(Organization).where(Organization.id == user.organization_id)
    )
    business_name = org.name if org else "VOLONCE Store"

    # 3. Format Business WhatsApp Message
    message = (
        f"🧾 *{business_name} તરફથી બિલ*\n\n"
        f"નમસ્તે! તમારું બિલ સફળતાપૂર્વક જનરેટ થઈ ગયું છે.\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"📄 *બિલ નંબર:* {inv.invoice_number}\n"
        f"📅 *તારીખ:* {inv.invoice_date.strftime('%d-%m-%Y')}\n"
        f"💵 *કુલ રકમ:* ₹{inv.grand_total}\n"
        f"✅ *ચૂકવેલ:* ₹{inv.paid_amount}\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"અમારી સેવા લેવા બદલ આપનો ખૂબ ખૂબ આભાર! 🙏"
    )

    if data.custom_message:
        message += f"\n\nનોંધ: {data.custom_message}"

    # 4. Generate instant link
    direct_link = generate_whatsapp_intent_link(data.phone_number, message)

    # 5. Try Cloud API if configured
    cloud_res = await send_meta_cloud_message(data.phone_number, message)

    if cloud_res.get("sent"):
        return WhatsAppSendResponse(
            success=True,
            message="WhatsApp Cloud API દ્વારા મેસેજ સફળતાપૂર્વક મોકલાઈ ગયો છે.",
            message_id=cloud_res.get("message_id"),
            direct_link=direct_link,
        )

    return WhatsAppSendResponse(
        success=True,
        message="WhatsApp લિંક સફળતાપૂર્વક તૈયાર થઈ ગઈ છે.",
        direct_link=direct_link,
    )