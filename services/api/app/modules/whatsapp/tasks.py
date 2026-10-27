import asyncio
import logging
import urllib.parse
import uuid
from datetime import datetime, timezone
from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models import (
    BusinessSettings,
    Customer,
    CustomerLedger,
    Invoice,
    InvoiceItem,
    InvoicePayment,
    Organization,
    WhatsAppMessage,
)
from app.modules.sales.customers import outstanding
from app.modules.whatsapp.client import whatsapp_client
from app.modules.whatsapp.pdf_service import (
    generate_customer_ledger_pdf_bytes,
    generate_invoice_pdf_bytes,
)

logger = logging.getLogger("celery.task")


@celery_app.task(name="tasks.send_invoice_whatsapp", bind=True, max_retries=3)
def send_invoice_whatsapp_task(self, invoice_id_str: str, phone: str, org_id_str: str):
    """બેકગ્રાઉન્ડ ટાસ્ક: ઇન્વોઇસ PDF જનરેટ કરી WhatsApp પર મોકલે છે."""
    db = SessionLocal()
    invoice_id = uuid.UUID(invoice_id_str)
    org_id = uuid.UUID(org_id_str)

    try:
        invoice = db.scalar(
            select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
        )
        if not invoice:
            logger.error("Invoice %s not found in background task", invoice_id)
            return

        items = db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all()
        payments = db.scalars(select(InvoicePayment).where(InvoicePayment.invoice_id == invoice.id)).all()
        org = db.get(Organization, org_id)
        b_settings = db.scalar(select(BusinessSettings).where(BusinessSettings.organization_id == org_id))
        customer = db.get(Customer, invoice.customer_id) if invoice.customer_id else None

        # ૧. બેકગ્રાઉન્ડમાં PDF બનાવો
        pdf_bytes = generate_invoice_pdf_bytes(
            invoice=invoice,
            items=items,
            org=org,
            settings=b_settings,
            customer=customer,
            payments=payments,
        )

        filename = f"Invoice-{invoice.invoice_number}.pdf"
        clean_phone = whatsapp_client.clean_phone_number(phone)
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

        # ૨. Meta WhatsApp API પર અપલોડ કરો અને મોકલો
        if whatsapp_client.is_configured:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            media_id = loop.run_until_complete(whatsapp_client.upload_pdf_media(pdf_bytes, filename))
            if media_id:
                res = loop.run_until_complete(
                    whatsapp_client.send_invoice_document(clean_phone, media_id, filename, caption)
                )
                loop.close()

                if res.get("success"):
                    wamid = res.get("data", {}).get("messages", [{}])[0].get("id")
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
                    logger.info("Invoice %s sent via WhatsApp to %s", invoice.invoice_number, clean_phone)
                    return

        # જો Cloud API ન હોય તો fallback રેકોર્ડ કરો
        msg_record = WhatsAppMessage(
            organization_id=org_id,
            invoice_id=invoice.id,
            recipient_phone=clean_phone,
            message_type="invoice_pdf",
            status="fallback",
        )
        db.add(msg_record)
        db.commit()

    except Exception as exc:
        logger.error("Error sending invoice WhatsApp: %s", exc)
        db.rollback()
        raise self.retry(exc=exc, countdown=15)
    finally:
        db.close()


@celery_app.task(name="tasks.send_ledger_whatsapp", bind=True, max_retries=3)
def send_ledger_whatsapp_task(self, customer_id_str: str, phone: str, org_id_str: str):
    """બેકગ્રાઉન્ડ ટાસ્ક: ગ્રાહકની ખાતાવહી સ્ટેટમેન્ટ PDF WhatsApp પર મોકલે છે."""
    db = SessionLocal()
    customer_id = uuid.UUID(customer_id_str)
    org_id = uuid.UUID(org_id_str)

    try:
        customer = db.scalar(
            select(Customer).where(Customer.id == customer_id, Customer.organization_id == org_id)
        )
        if not customer:
            return

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

        pdf_bytes = generate_customer_ledger_pdf_bytes(
            customer=customer,
            ledger_rows=rows,
            opening_balance=customer.opening_balance,
            outstanding_balance=current_due,
            org=org,
            settings=b_settings,
        )

        filename = f"Statement-{customer.name.replace(' ', '_')}.pdf"
        clean_phone = whatsapp_client.clean_phone_number(phone)
        org_title = org.name if org and org.name else "STORE"

        caption = (
            f"નમસ્તે {customer.name} જી!\n"
            f"*{org_title}* તરફથી તમારી ખાતાવહીનું સ્ટેટમેન્ટ:\n"
            f"💰 કુલ બાકી ઉધારી: *₹{float(current_due):.2f}*\n"
            f"જોડાયેલ PDF ફાઇલમાં તમામ લેવડ-દેવડની વિગત છે. આભાર!"
        )

        now = datetime.now(timezone.utc)

        if whatsapp_client.is_configured:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            media_id = loop.run_until_complete(whatsapp_client.upload_pdf_media(pdf_bytes, filename))
            if media_id:
                res = loop.run_until_complete(
                    whatsapp_client.send_invoice_document(clean_phone, media_id, filename, caption)
                )
                loop.close()
                if res.get("success"):
                    wamid = res.get("data", {}).get("messages", [{}])[0].get("id")
                    db.add(
                        WhatsAppMessage(
                            organization_id=org_id,
                            recipient_phone=clean_phone,
                            message_type="ledger_statement",
                            whatsapp_message_id=wamid,
                            status="sent",
                            sent_at=now,
                        )
                    )
                    db.commit()
                    return

    except Exception as exc:
        db.rollback()
        raise self.retry(exc=exc, countdown=15)
    finally:
        db.close()