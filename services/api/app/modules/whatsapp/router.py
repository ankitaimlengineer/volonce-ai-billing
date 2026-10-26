import urllib.parse
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.deps import get_db, require_roles
from app.models import Invoice, InvoiceItem, BusinessSettings, Organization, Customer, User
from app.modules.whatsapp.client import whatsapp_client
from app.modules.whatsapp.pdf_service import generate_invoice_pdf_bytes
from app.modules.whatsapp.schemas import SendInvoiceWhatsAppRequest, WhatsAppSendResponse

router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])
can_write = require_roles("owner", "manager", "cashier")

@router.post("/send-invoice/{invoice_id}", response_model=WhatsAppSendResponse)
async def send_invoice_via_whatsapp(
    invoice_id: uuid.UUID,
    payload: SendInvoiceWhatsAppRequest,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id))
    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    items = db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all()
    org = db.get(Organization, org_id)
    settings = db.scalar(select(BusinessSettings).where(BusinessSettings.organization_id == org_id))
    customer = db.get(Customer, invoice.customer_id) if invoice.customer_id else None

    # Generate PDF bytes with items
    pdf_bytes = generate_invoice_pdf_bytes(invoice, items, org, settings, customer)
    filename = f"Invoice-{invoice.invoice_number}.pdf"
    clean_phone = whatsapp_client.clean_phone_number(payload.phone)

    caption = (
        f"નમસ્તે! *{org.name}* તરફથી તમારું બિલ:\n"
        f"📄 બિલ નં: *{invoice.invoice_number}*\n"
        f"📅 તારીખ: {invoice.invoice_date}\n"
        f"💰 કુલ રકમ: *₹{invoice.grand_total:.2f}*\n"
        f"ધન્યવાદ! ફરી પધારશો."
    )

    if whatsapp_client.is_configured:
        media_id = await whatsapp_client.upload_pdf_media(pdf_bytes, filename)
        if media_id:
            result = await whatsapp_client.send_invoice_document(clean_phone, media_id, filename, caption)
            if result.get("success"):
                return WhatsAppSendResponse(
                    success=True,
                    status="sent",
                    message="સત્તાવાર WhatsApp API દ્વારા ગ્રાહકને PDF બિલ મોકલાઈ ગયું છે!",
                    message_id=result.get("data", {}).get("messages", [{}])[0].get("id"),
                )

    encoded_caption = urllib.parse.quote(caption)
    fallback_url = f"https://wa.me/{clean_phone}?text={encoded_caption}"

    return WhatsAppSendResponse(
        success=False,
        status="fallback",
        message="Meta Cloud API ટોકન સેટ નથી અથવા ટ્રાયલ મોડમાં છે. WhatsApp ડાયરેક્ટ ચેટ ખુલી રહી છે...",
        fallback_url=fallback_url,
    )

@router.get("/invoices/{invoice_id}/download-pdf")
def download_invoice_pdf_endpoint(
    invoice_id: uuid.UUID,
    user: User = Depends(can_write),
    db: Session = Depends(get_db),
):
    org_id = user.organization_id
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id))
    if not invoice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    items = db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all()
    org = db.get(Organization, org_id)
    settings = db.scalar(select(BusinessSettings).where(BusinessSettings.organization_id == org_id))
    customer = db.get(Customer, invoice.customer_id) if invoice.customer_id else None

    # Generate PDF bytes with items
    pdf_bytes = generate_invoice_pdf_bytes(invoice, items, org, settings, customer)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Invoice-{invoice.invoice_number}.pdf"'},
    )