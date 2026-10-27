import logging
import urllib.parse
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.models import (
    BusinessSettings,
    Customer,
    Invoice,
    InvoiceItem,
    InvoicePayment,
    Organization,
    User,
    WhatsAppMessage,
)
from app.modules.whatsapp.client import whatsapp_client
from app.modules.whatsapp.pdf_service import generate_invoice_pdf_bytes
from app.modules.whatsapp.schemas import (
    SendInvoiceWhatsAppRequest,
    WhatsAppMessageStatusOut,
    WhatsAppSendResponse,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])
can_write = require_roles("owner", "manager", "cashier")


# ================= ૧. WHATSAPP પર બિલ મોકલો અને ટ્રેકિંગ શરૂ કરો =================
@router.post("/send-invoice/{invoice_id}", response_model=WhatsAppSendResponse)
async def send_invoice_via_whatsapp(
    invoice_id: uuid.UUID,
    payload: SendInvoiceWhatsAppRequest,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id
    invoice = db.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.organization_id == org_id,
        )
    )
    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    items = db.scalars(
        select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)
    ).all()
    payments = db.scalars(
        select(InvoicePayment).where(InvoicePayment.invoice_id == invoice.id)
    ).all()

    org = db.get(Organization, org_id)
    b_settings = db.scalar(
        select(BusinessSettings).where(BusinessSettings.organization_id == org_id)
    )
    customer = (
        db.get(Customer, invoice.customer_id) if invoice.customer_id else None
    )

    # PDF Bytes જનરેટ કરો
    try:
        pdf_bytes = generate_invoice_pdf_bytes(
            invoice=invoice,
            items=items,
            org=org,
            settings=b_settings,
            customer=customer,
            payments=payments,
        )
    except Exception as e:
        logger.exception("Failed to generate PDF for WhatsApp: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF બનાવવામાં સમસ્યા આવી: {str(e)}",
        )

    filename = f"Invoice-{invoice.invoice_number}.pdf"
    clean_phone = whatsapp_client.clean_phone_number(payload.phone)
    org_title = org.name if org and org.name else "STORE"
    grand_total_val = float(invoice.grand_total or 0)

    caption = (
        f"નમસ્તે! *{org_title}* તરફથી તમારું બિલ:\n"
        f"📄 બિલ નં: *{invoice.invoice_number}*\n"
        f"📅 તારીખ: {invoice.invoice_date}\n"
        f"💰 કુલ રકમ: *₹{grand_total_val:.2f}*\n"
        f"ધન્યવાદ! ફરી પધારશો."
    )

    now = datetime.now(timezone.utc)

    # Meta Cloud API થી મોકલવાનો પ્રયાસ કરો
    if whatsapp_client.is_configured:
        try:
            media_id = await whatsapp_client.upload_pdf_media(pdf_bytes, filename)
            if media_id:
                result = await whatsapp_client.send_invoice_document(
                    clean_phone, media_id, filename, caption
                )
                if result.get("success"):
                    wamid = result.get("data", {}).get("messages", [{}])[0].get("id")

                    # મેસેજ ટ્રેકિંગ ડેટાબેઝમાં નોંધો
                    msg_record = WhatsAppMessage(
                        organization_id=org_id,
                        invoice_id=invoice.id,
                        recipient_phone=clean_phone,
                        message_type="invoice_pdf",
                        whatsapp_message_id=wamid,
                        status="sent",
                        sent_at=now,
                    )
                    db.add(msg_record)
                    db.commit()

                    return WhatsAppSendResponse(
                        success=True,
                        status="sent",
                        message="સત્તાવાર WhatsApp API દ્વારા ગ્રાહકને PDF બિલ મોકલાઈ ગયું છે!",
                        message_id=wamid,
                    )
        except Exception as e:
            logger.warning("WhatsApp API Error, using direct chat fallback: %s", e)

    # જો Cloud API ન હોય તો WhatsApp Direct Chat Fallback URL આપશે
    encoded_caption = urllib.parse.quote(caption)
    fallback_url = f"https://wa.me/{clean_phone}?text={encoded_caption}"

    # ફોલબેક રેકોર્ડ સેવ કરો
    msg_record = WhatsAppMessage(
        organization_id=org_id,
        invoice_id=invoice.id,
        recipient_phone=clean_phone,
        message_type="invoice_pdf",
        status="fallback",
    )
    db.add(msg_record)
    db.commit()

    return WhatsAppSendResponse(
        success=False,
        status="fallback",
        message="WhatsApp ડાયરેક્ટ ચેટ ખુલી રહી છે...",
        fallback_url=fallback_url,
    )


# ================= ૨. META CLOUD API WEBHOOK VERIFICATION (GET) =================
@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    """Meta Developer Console માં Webhook સેટ કરતી વખતે વેરિફિકેશન કરે છે."""
    expected_token = getattr(settings, "whatsapp_verify_token", "volonce_wa_verify_2026")

    if hub_mode == "subscribe" and hub_verify_token == expected_token:
        logger.info("WhatsApp Webhook verified successfully!")
        return Response(content=hub_challenge, media_type="text/plain")

    logger.warning("WhatsApp Webhook verification failed. Tokens did not match.")
    raise HTTPException(status_code=403, detail="Verification token mismatch")


# ================= ૩. META CLOUD API STATUS LISTENER (POST) =================
@router.post("/webhook")
async def receive_whatsapp_status(
    request: Request,
    db: Session = Depends(get_db),
):
    """Meta Cloud API તરફથી આવતા Sent, Delivered, Read અને Failed સ્ટેટસ સાંભળીને લાઈવ અપડેટ કરે છે."""
    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}

    entries = body.get("entry", [])
    now = datetime.now(timezone.utc)

    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            value = change.get("value", {})
            statuses = value.get("statuses", [])

            for s in statuses:
                wamid = s.get("id")
                new_status = s.get("status")  # sent, delivered, read, failed

                if not wamid or not new_status:
                    continue

                msg = db.scalar(
                    select(WhatsAppMessage).where(
                        WhatsAppMessage.whatsapp_message_id == wamid
                    )
                )
                if msg:
                    msg.status = new_status
                    if new_status == "sent" and not msg.sent_at:
                        msg.sent_at = now
                    elif new_status == "delivered" and not msg.delivered_at:
                        msg.delivered_at = now
                    elif new_status == "read" and not msg.read_at:
                        msg.read_at = now
                    elif new_status == "failed":
                        errors = s.get("errors", [{}])
                        msg.error_message = errors[0].get("message", "Delivery failed")

                    db.commit()
                    logger.info("Message %s status updated to: %s", wamid, new_status)

    return {"status": "ok"}


# ================= ૪. બિલના WHATSAPP ડિલિવરી સ્ટેટસ ચેક કરો (GET) =================
@router.get("/status/{invoice_id}", response_model=list[WhatsAppMessageStatusOut])
def get_invoice_whatsapp_status(
    invoice_id: uuid.UUID,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    """આ બિલ WhatsApp પર પહોંચ્યું કે નહીં (Sent, Delivered, Read) તે ચેક કરે છે."""
    records = db.scalars(
        select(WhatsAppMessage)
        .where(
            WhatsAppMessage.invoice_id == invoice_id,
            WhatsAppMessage.organization_id == user.organization_id,
        )
        .order_by(WhatsAppMessage.created_at.desc())
    ).all()
    return records


# ================= ૫. PDF ડાઉનલોડ કરવાનો એન્ડપોઇન્ટ (મોબાઈલ અને પ્રિન્ટ માટે) =================
@router.get("/invoices/{invoice_id}/download-pdf")
def download_invoice_pdf_endpoint(
    invoice_id: uuid.UUID,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id
    invoice = db.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.organization_id == org_id,
        )
    )
    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    items = db.scalars(
        select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)
    ).all()
    payments = db.scalars(
        select(InvoicePayment).where(InvoicePayment.invoice_id == invoice.id)
    ).all()

    org = db.get(Organization, org_id)
    b_settings = db.scalar(
        select(BusinessSettings).where(BusinessSettings.organization_id == org_id)
    )
    customer = (
        db.get(Customer, invoice.customer_id) if invoice.customer_id else None
    )

    try:
        pdf_bytes = generate_invoice_pdf_bytes(
            invoice=invoice,
            items=items,
            org=org,
            settings=b_settings,
            customer=customer,
            payments=payments,
        )
    except Exception as e:
        logger.exception("Failed to generate invoice PDF: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF બનાવવામાં ભૂલ આવી: {str(e)}",
        )

    if not pdf_bytes or len(pdf_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF ફાઇલ ખાલી બની છે.",
        )

    return Response(
        content=pdf_bytes,
        status_code=status.HTTP_200_OK,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Invoice-{invoice.invoice_number}.pdf"',
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )