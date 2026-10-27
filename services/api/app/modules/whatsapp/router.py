import logging
import urllib.parse
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db, require_roles
from app.models import (
    BusinessSettings,
    Customer,
    CustomerLedger,
    Invoice,
    InvoiceItem,
    InvoicePayment,
    Organization,
    User,
    WhatsAppMessage,
)
from app.modules.sales.customers import outstanding
from app.modules.whatsapp.client import whatsapp_client
from app.modules.whatsapp.pdf_service import (
    generate_customer_ledger_pdf_bytes,
    generate_invoice_pdf_bytes,
)
from app.modules.whatsapp.schemas import (
    SendInvoiceWhatsAppRequest,
    SendLedgerWhatsAppRequest,
    SendReminderRequest,
    WhatsAppMessageStatusOut,
    WhatsAppSendResponse,
)
from app.modules.whatsapp.tasks import (
    send_invoice_whatsapp_task,
    send_ledger_whatsapp_task,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])
can_write = require_roles("owner", "manager", "cashier")


# ==============================================================================
# ૧. WHATSAPP પર બિલ મોકલો (CELERY ASYNC QUEUE + FAST RESPONSE)
# ==============================================================================
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

    clean_phone = whatsapp_client.clean_phone_number(payload.phone)

    # ⚡ જો Meta Cloud API કન્ફિગર હોય તો Celery Worker કતારમાં મોકલો (સુપરફાસ્ટ રિસ્પોન્સ)
    if whatsapp_client.is_configured:
        try:
            send_invoice_whatsapp_task.delay(str(invoice.id), clean_phone, str(org_id))
            return WhatsAppSendResponse(
                success=True,
                status="pending",
                message="બિલ WhatsApp પર મોકલવા માટે બેકગ્રાઉન્ડ કતારમાં મુકાઈ ગયું છે!",
            )
        except Exception as e:
            logger.warning("Celery queue failed, falling back to direct chat: %s", e)

    # જો Cloud API સેટ ન હોય તો ડાયરેક્ટ WhatsApp Chat લિંક બનાવો
    org = db.get(Organization, org_id)
    org_title = org.name if org and org.name else "STORE"
    grand_total_val = float(invoice.grand_total or 0)

    caption = (
        f"નમસ્તે! *{org_title}* તરફથી તમારું બિલ:\n"
        f"📄 બિલ નં: *{invoice.invoice_number}*\n"
        f"📅 તારીખ: {invoice.invoice_date}\n"
        f"💰 કુલ રકમ: *₹{grand_total_val:.2f}*\n"
        f"ધન્યવાદ! ફરી પધારશો."
    )

    encoded_caption = urllib.parse.quote(caption)
    fallback_url = f"https://wa.me/{clean_phone}?text={encoded_caption}"

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


# ==============================================================================
# ૨. CUSTOMER LEDGER STATEMENT WHATSAPP પર મોકલો (CELERY ASYNC)
# ==============================================================================
@router.post("/customers/{customer_id}/send-statement", response_model=WhatsAppSendResponse)
async def send_customer_ledger_via_whatsapp(
    customer_id: uuid.UUID,
    payload: SendLedgerWhatsAppRequest | None = None,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.organization_id == org_id)
    )
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")

    phone = payload.phone if payload and payload.phone else customer.mobile
    if not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "આ ગ્રાહકનો મોબાઈલ નંબર નોંધાયેલો નથી.")

    clean_phone = whatsapp_client.clean_phone_number(phone)

    # ⚡ Celery Background Task માં કતાર કરો
    if whatsapp_client.is_configured:
        try:
            send_ledger_whatsapp_task.delay(str(customer.id), clean_phone, str(org_id))
            return WhatsAppSendResponse(
                success=True,
                status="pending",
                message="ખાતાવહી સ્ટેટમેન્ટ PDF બેકગ્રાઉન્ડમાં તૈયાર થઈને WhatsApp પર મોકલાઈ રહ્યું છે!",
            )
        except Exception as e:
            logger.warning("Celery queue failed: %s", e)

    # Fallback Direct WhatsApp Chat
    current_due = outstanding(db, org_id, customer)
    org = db.get(Organization, org_id)
    org_title = org.name if org and org.name else "STORE"

    caption = (
        f"નમસ્તે {customer.name} જી!\n"
        f"*{org_title}* તરફથી તમારી ખાતાવહીનું સ્ટેટમેન્ટ:\n"
        f"💰 કુલ બાકી ઉધારી: *₹{float(current_due):.2f}*\n"
        f"કૃપા કરીને આ રકમ ચૂકવવા વિનંતી. આભાર!"
    )
    encoded_caption = urllib.parse.quote(caption)
    fallback_url = f"https://wa.me/{clean_phone}?text={encoded_caption}"

    msg_record = WhatsAppMessage(
        organization_id=org_id,
        recipient_phone=clean_phone,
        message_type="ledger_statement",
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


# ==============================================================================
# ૩. PAYMENT REMINDER મેસેજ મોકલો
# ==============================================================================
@router.post("/customers/{customer_id}/send-reminder", response_model=WhatsAppSendResponse)
async def send_customer_payment_reminder(
    customer_id: uuid.UUID,
    payload: SendReminderRequest | None = None,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.organization_id == org_id)
    )
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")

    phone = payload.phone if payload and payload.phone else customer.mobile
    if not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "મોબાઈલ નંબર જરૂરી છે.")

    current_due = outstanding(db, org_id, customer)
    if current_due <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "આ ગ્રાહકની કોઈ ઉધારી બાકી નથી.")

    org = db.get(Organization, org_id)
    b_settings = db.scalar(select(BusinessSettings).where(BusinessSettings.organization_id == org_id))
    org_title = org.name if org and org.name else "STORE"
    upi_id = (b_settings.upi_id if b_settings and b_settings.upi_id else "") or "store@upi"

    reminder_text = (
        f"નમસ્તે {customer.name} જી,\n\n"
        f"*{org_title}* તરફથી નમ્ર સ્મૃતિપત્ર (Payment Reminder):\n"
        f"આપના ખાતામાં *₹{float(current_due):.2f}* ની ઉધારી ચૂકવણી બાકી છે.\n\n"
        f"આપ નીચે આપેલ UPI ID પર સીધા પૈસા જમા કરી શકો છો:\n"
        f"📱 UPI ID: *{upi_id}*\n\n"
        f"ચૂકવણી કરી દીધી હોય તો આ મેસેજ અવગણશો. આભાર!"
    )

    clean_phone = whatsapp_client.clean_phone_number(phone)
    now = datetime.now(timezone.utc)

    if whatsapp_client.is_configured:
        try:
            result = await whatsapp_client.send_text_message(clean_phone, reminder_text)
            if result.get("success"):
                wamid = result.get("data", {}).get("messages", [{}])[0].get("id")
                msg_record = WhatsAppMessage(
                    organization_id=org_id,
                    recipient_phone=clean_phone,
                    message_type="payment_reminder",
                    whatsapp_message_id=wamid,
                    status="sent",
                    sent_at=now,
                )
                db.add(msg_record)
                db.commit()

                return WhatsAppSendResponse(
                    success=True,
                    status="sent",
                    message="ગ્રાહકને પેમેન્ટ રીમાઇન્ડર મેસેજ મોકલાઈ ગયો છે!",
                    message_id=wamid,
                )
        except Exception as e:
            logger.warning("WhatsApp API Error: %s", e)

    # Fallback Direct WhatsApp Chat
    encoded = urllib.parse.quote(reminder_text)
    fallback_url = f"https://wa.me/{clean_phone}?text={encoded}"
    msg_record = WhatsAppMessage(
        organization_id=org_id,
        recipient_phone=clean_phone,
        message_type="payment_reminder",
        status="fallback",
    )
    db.add(msg_record)
    db.commit()

    return WhatsAppSendResponse(
        success=False,
        status="fallback",
        message="WhatsApp ચેટ ખુલી રહી છે...",
        fallback_url=fallback_url,
    )


# ==============================================================================
# ૪. CUSTOMER STATEMENT PDF ડાઉનલોડ ENDPOINT
# ==============================================================================
@router.get("/customers/{customer_id}/download-ledger-pdf")
def download_customer_ledger_pdf(
    customer_id: uuid.UUID,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.organization_id == org_id)
    )
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")

    entries = db.scalars(
        select(CustomerLedger)
        .where(CustomerLedger.organization_id == org_id, CustomerLedger.customer_id == customer.id)
        .order_by(CustomerLedger.created_at, CustomerLedger.id)
    ).all()

    bal = customer.opening_balance
    rows = []
    for e in entries:
        bal = bal + e.debit - e.credit
        e.balance = bal
        rows.append(e)

    current_due = outstanding(db, org_id, customer)
    org = db.get(Organization, org_id)
    b_settings = db.scalar(select(BusinessSettings).where(BusinessSettings.organization_id == org_id))

    try:
        pdf_bytes = generate_customer_ledger_pdf_bytes(
            customer=customer,
            ledger_rows=rows,
            opening_balance=customer.opening_balance,
            outstanding_balance=current_due,
            org=org,
            settings=b_settings,
        )
    except Exception as e:
        logger.exception("Failed to generate ledger PDF: %s", e)
        raise HTTPException(status_code=500, detail=f"PDF બનાવવામાં ભૂલ: {str(e)}")

    safe_name = customer.name.replace(" ", "_")
    return Response(
        content=pdf_bytes,
        status_code=200,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Statement-{safe_name}.pdf"',
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


# ==============================================================================
# ૫. META CLOUD API WEBHOOK VERIFICATION (GET)
# ==============================================================================
@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    expected_token = getattr(settings, "whatsapp_verify_token", "volonce_wa_verify_2026")

    if hub_mode == "subscribe" and hub_verify_token == expected_token:
        logger.info("WhatsApp Webhook verified successfully!")
        return Response(content=hub_challenge, media_type="text/plain")

    logger.warning("WhatsApp Webhook verification failed. Tokens did not match.")
    raise HTTPException(status_code=403, detail="Verification token mismatch")


# ==============================================================================
# ૬. META CLOUD API STATUS LISTENER (POST)
# ==============================================================================
@router.post("/webhook")
async def receive_whatsapp_status(
    request: Request,
    db: Session = Depends(get_db),
):
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
                new_status = s.get("status")

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


# ==============================================================================
# ૭. બિલના WHATSAPP ડિલિવરી સ્ટેટસ ચેક કરો (GET)
# ==============================================================================
@router.get("/status/{invoice_id}", response_model=list[WhatsAppMessageStatusOut])
def get_invoice_whatsapp_status(
    invoice_id: uuid.UUID,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    records = db.scalars(
        select(WhatsAppMessage)
        .where(
            WhatsAppMessage.invoice_id == invoice_id,
            WhatsAppMessage.organization_id == user.organization_id,
        )
        .order_by(WhatsAppMessage.created_at.desc())
    ).all()
    return records


# ==============================================================================
# ૮. INVOICE PDF ડાઉનલોડ કરવાનો એન્ડપોઇન્ટ
# ==============================================================================
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