import asyncio
import logging
import uuid
from datetime import datetime, timezone
from celery.exceptions import MaxRetriesExceededError
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
    """બેકગ્રાઉન્ડ ટાસ્ક: ઇન્વોઇસ PDF જનરેટ કરી WhatsApp પર મોકલે છે (Auto 24-hr Template Fallback સાથે)."""
    db = SessionLocal()
    invoice_id = uuid.UUID(invoice_id_str)
    org_id = uuid.UUID(org_id_str)
    clean_phone = whatsapp_client.clean_phone_number(phone)
    now = datetime.now(timezone.utc)

    try:
        invoice = db.scalar(
            select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
        )
        if not invoice:
            logger.error("Invoice %s not found in background worker", invoice_id)
            return

        items = db.scalars(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all()
        payments = db.scalars(select(InvoicePayment).where(InvoicePayment.invoice_id == invoice.id)).all()
        org = db.get(Organization, org_id)
        b_settings = db.scalar(select(BusinessSettings).where(BusinessSettings.organization_id == org_id))
        customer = db.get(Customer, invoice.customer_id) if invoice.customer_id else None

        # ૧. બેકગ્રાઉન્ડમાં હાઈ-ડેફિનેશન PDF બનાવો
        pdf_bytes = generate_invoice_pdf_bytes(
            invoice=invoice,
            items=items,
            org=org,
            settings=b_settings,
            customer=customer,
            payments=payments,
        )

        filename = f"Invoice-{invoice.invoice_number}.pdf"
        org_title = org.name if org and org.name else "STORE"
        cust_name = customer.name if customer else "Customer"
        grand_total_val = float(invoice.grand_total or 0)

        caption = (
            f"નમસ્તે! *{org_title}* તરફથી તમારું બિલ:\n"
            f"📄 બિલ નં: *{invoice.invoice_number}*\n"
            f"📅 તારીખ: {invoice.invoice_date}\n"
            f"💰 કુલ રકમ: *₹{grand_total_val:.2f}*\n"
            f"ધન્યવાદ! ફરી પધારશો."
        )

        # ૨. Meta WhatsApp Cloud API દ્વારા અસિંક્રોનસ મોકલો
        if whatsapp_client.is_configured:
            async def _send_async():
                media_id = await whatsapp_client.upload_pdf_media(pdf_bytes, filename)
                if not media_id:
                    return None, {"success": False, "error": "WhatsApp media upload failed"}

                # પ્રથમ સામાન્ય ડાયરેક્ટ મેસેજ મોકલવાનો પ્રયાસ કરો
                res = await whatsapp_client.send_invoice_document(clean_phone, media_id, filename, caption)

                # જો ૨૪ કલાકની વિન્ડો પૂરી થઈ ગઈ હોય (Error Code 131047), તો આપોઆપ Official Template વાપરો
                if not res.get("success") and res.get("code") == 131047:
                    logger.info("24-hr window expired. Switching to official WhatsApp Template for %s", clean_phone)
                    res = await whatsapp_client.send_template_document(
                        recipient_phone=clean_phone,
                        media_id=media_id,
                        filename=filename,
                        customer_name=cust_name,
                        invoice_number=invoice.invoice_number,
                        grand_total=f"{grand_total_val:.2f}",
                        store_name=org_title,
                    )

                return media_id, res

            media_id, res = asyncio.run(_send_async())

            if res and res.get("success"):
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
                logger.info("✓ Invoice %s sent via WhatsApp to %s (Msg ID: %s)", invoice.invoice_number, clean_phone, wamid)
                return
            else:
                error_detail = res.get("error", "Unknown WhatsApp Error") if res else "Failed to send document"
                raise RuntimeError(error_detail)

        # જો Cloud API કન્ફિગર ન હોય તો fallback રેકોર્ડ કરો
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
        logger.error("Error sending invoice WhatsApp (Attempt %s/%s): %s", self.request.retries + 1, self.max_retries, exc)
        db.rollback()

        # જો બધા રિ-ટ્રાય પૂરા થઈ ગયા હોય તો ડેટાબેઝમાં Failed સ્ટેટસ સેવ કરો
        if self.request.retries >= self.max_retries:
            try:
                db.add(
                    WhatsAppMessage(
                        organization_id=org_id,
                        invoice_id=invoice_id,
                        recipient_phone=clean_phone,
                        message_type="invoice_pdf",
                        status="failed",
                        error_message=str(exc),
                    )
                )
                db.commit()
            except Exception:
                db.rollback()
            return

        raise self.retry(exc=exc, countdown=15)
    finally:
        db.close()


@celery_app.task(name="tasks.send_ledger_whatsapp", bind=True, max_retries=3)
def send_ledger_whatsapp_task(self, customer_id_str: str, phone: str, org_id_str: str):
    """બેકગ્રાઉન્ડ ટાસ્ક: ગ્રાહકની ખાતાવહી સ્ટેટમેન્ટ PDF WhatsApp પર મોકલે છે (Auto 24-hr Template Fallback સાથે)."""
    db = SessionLocal()
    customer_id = uuid.UUID(customer_id_str)
    org_id = uuid.UUID(org_id_str)
    clean_phone = whatsapp_client.clean_phone_number(phone)
    now = datetime.now(timezone.utc)

    try:
        customer = db.scalar(
            select(Customer).where(Customer.id == customer_id, Customer.organization_id == org_id)
        )
        if not customer:
            logger.error("Customer %s not found in background worker", customer_id)
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

        # ૧. ખાતાવહી સ્ટેટમેન્ટ PDF બનાવો
        pdf_bytes = generate_customer_ledger_pdf_bytes(
            customer=customer,
            ledger_rows=rows,
            opening_balance=customer.opening_balance,
            outstanding_balance=current_due,
            org=org,
            settings=b_settings,
        )

        filename = f"Statement-{customer.name.replace(' ', '_')}.pdf"
        org_title = org.name if org and org.name else "STORE"
        due_str = f"{float(current_due):.2f}"

        caption = (
            f"નમસ્તે {customer.name} જી!\n"
            f"*{org_title}* તરફથી તમારી ખાતાવહીનું સ્ટેટમેન્ટ:\n"
            f"💰 કુલ બાકી ઉધારી: *₹{due_str}*\n"
            f"જોડાયેલ PDF ફાઇલમાં તમામ લેવડ-દેવડની વિગત છે. આભાર!"
        )

        # ૨. Meta WhatsApp Cloud API દ્વારા અસિંક્રોનસ મોકલો
        if whatsapp_client.is_configured:
            async def _send_ledger_async():
                media_id = await whatsapp_client.upload_pdf_media(pdf_bytes, filename)
                if not media_id:
                    return None, {"success": False, "error": "WhatsApp media upload failed"}

                # પ્રથમ સામાન્ય દસ્તાવેજ મોકલો
                res = await whatsapp_client.send_invoice_document(clean_phone, media_id, filename, caption)

                # જો ૨૪ કલાકની વિન્ડો પૂરી થઈ ગઈ હોય, તો ટેમ્પલેટ દ્વારા મોકલો
                if not res.get("success") and res.get("code") == 131047:
                    logger.info("24-hr window expired. Switching to Template for Statement to %s", clean_phone)
                    res = await whatsapp_client.send_template_document(
                        recipient_phone=clean_phone,
                        media_id=media_id,
                        filename=filename,
                        customer_name=customer.name,
                        invoice_number=f"Statement-{datetime.now().strftime('%Y%m')}",
                        grand_total=due_str,
                        store_name=org_title,
                    )

                return media_id, res

            media_id, res = asyncio.run(_send_ledger_async())

            if res and res.get("success"):
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
                logger.info("✓ Ledger statement sent to %s (Msg ID: %s)", clean_phone, wamid)
                return
            else:
                error_detail = res.get("error", "Unknown WhatsApp Error") if res else "Failed to send document"
                raise RuntimeError(error_detail)

        # Fallback રેકોર્ડ કરો
        db.add(
            WhatsAppMessage(
                organization_id=org_id,
                recipient_phone=clean_phone,
                message_type="ledger_statement",
                status="fallback",
            )
        )
        db.commit()

    except Exception as exc:
        logger.error("Error sending ledger WhatsApp (Attempt %s/%s): %s", self.request.retries + 1, self.max_retries, exc)
        db.rollback()

        if self.request.retries >= self.max_retries:
            try:
                db.add(
                    WhatsAppMessage(
                        organization_id=org_id,
                        recipient_phone=clean_phone,
                        message_type="ledger_statement",
                        status="failed",
                        error_message=str(exc),
                    )
                )
                db.commit()
            except Exception:
                db.rollback()
            return

        raise self.retry(exc=exc, countdown=15)
    finally:
        db.close()