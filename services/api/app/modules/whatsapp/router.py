import logging
import urllib.parse
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models import (
    BusinessSettings,
    Customer,
    Invoice,
    InvoiceItem,
    InvoicePayment,
    Organization,
    User,
)
from app.modules.whatsapp.client import whatsapp_client
from app.modules.whatsapp.pdf_service import generate_invoice_pdf_bytes
from app.modules.whatsapp.schemas import (
    SendInvoiceWhatsAppRequest,
    WhatsAppSendResponse,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])
can_write = require_roles("owner", "manager", "cashier")


# ================= ૧. WHATSAPP પર બિલ મોકલવાનો એન્ડપોઇન્ટ =================
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
    settings = db.scalar(
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
            settings=settings,
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

    if whatsapp_client.is_configured:
        try:
            media_id = await whatsapp_client.upload_pdf_media(pdf_bytes, filename)
            if media_id:
                result = await whatsapp_client.send_invoice_document(
                    clean_phone, media_id, filename, caption
                )
                if result.get("success"):
                    return WhatsAppSendResponse(
                        success=True,
                        status="sent",
                        message="સત્તાવાર WhatsApp API દ્વારા ગ્રાહકને PDF બિલ મોકલાઈ ગયું છે!",
                        message_id=result.get("data", {})
                        .get("messages", [{}])[0]
                        .get("id"),
                    )
        except Exception as e:
            logger.warning("WhatsApp API Error: %s", e)

    encoded_caption = urllib.parse.quote(caption)
    fallback_url = f"https://wa.me/{clean_phone}?text={encoded_caption}"

    return WhatsAppSendResponse(
        success=False,
        status="fallback",
        message="WhatsApp ડાયરેક્ટ ચેટ ખુલી રહી છે...",
        fallback_url=fallback_url,
    )


# ================= ૨. PDF ડાઉનલોડ કરવાનો એન્ડપોઇન્ટ (મોબાઈલ અને પ્રિન્ટ માટે) =================
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
    settings = db.scalar(
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
            settings=settings,
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