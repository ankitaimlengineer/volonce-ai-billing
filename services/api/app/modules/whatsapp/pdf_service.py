import html
import io
import logging
import urllib.parse
from decimal import Decimal
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Group

from app.core.storage import storage
from app.models import Invoice, InvoiceItem, BusinessSettings, Organization, Customer

logger = logging.getLogger("uvicorn.error")


def number_to_words_inr(num: float) -> str:
    """રૂપિયાની રકમને અંગ્રેજી શબ્દોમાં ફેરવે છે."""
    a = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
    ]
    b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def in_words(n: int) -> str:
        if n == 0:
            return ""
        if n < 20:
            return a[n] + " "
        if n < 100:
            return b[n // 10] + " " + a[n % 10] + " "
        if n < 1000:
            return a[n // 100] + " Hundred " + in_words(n % 100)
        if n < 100000:
            return in_words(n // 1000) + "Thousand " + in_words(n % 1000)
        if n < 10000000:
            return in_words(n // 100000) + "Lakh " + in_words(n % 100000)
        return in_words(n // 10000000) + "Crore " + in_words(n % 10000000)

    try:
        integer_part = int(num)
        decimal_part = round((num - integer_part) * 100)

        result = "Rupees " + (in_words(integer_part).strip() if integer_part > 0 else "Zero")
        if decimal_part > 0:
            result += " and " + in_words(decimal_part).strip() + " Paise"
        return result + " Only"
    except Exception:
        return f"Rupees {num:.2f} Only"


def _make_safe_qr(upi_url: str, size: float = 70):
    """સેફ QR કોડ જનરેટર."""
    try:
        from reportlab.graphics.barcode.qr import QrCodeWidget
        qr = QrCodeWidget(upi_url)
        bounds = qr.getBounds()
        w = bounds[2] - bounds[0]
        h = bounds[3] - bounds[1]
        if w <= 0 or h <= 0:
            return None
        scale = size / max(w, h)
        d = Drawing(size, size)
        g = Group()
        g.translate(-bounds[0] * scale, -bounds[1] * scale)
        g.scale(scale, scale)
        g.add(qr)
        d.add(g)
        return d
    except Exception as e:
        logger.warning("QR code skipped: %s", e)
        return None


def generate_invoice_pdf_bytes(
    invoice: Invoice,
    items: list[InvoiceItem],
    org: Organization,
    settings: BusinessSettings | None,
    customer: Customer | None,
    payments: list | None = None,
) -> bytes:
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20,
        leftMargin=20,
        topMargin=20,
        bottomMargin=20,
    )
    story = []
    styles = getSampleStyleSheet()

    c_primary = colors.HexColor("#065F46")
    c_primary_dark = colors.HexColor("#044E3A")
    c_bg_mint = colors.HexColor("#ECFDF5")
    c_text_dark = colors.HexColor("#0F172A")
    c_text_muted = colors.HexColor("#64748B")
    c_border = colors.HexColor("#E2E8F0")

    org_name = html.escape((org.name if org and org.name else "STORE").upper())
    org_address = html.escape(f"{org.address or ''}, {org.city or ''} {org.pincode or ''}".strip().strip(","))
    org_mobile = html.escape(f"+91 {org.mobile}" if org and org.mobile else "")
    org_email = html.escape(org.email or "")
    org_gst = html.escape(f"GSTIN: {org.gst_number}" if org and org.gst_number else "")

    # ================= 1. HEADER (CENTER TITLE + LOGO + STORE INFO) =================
    logo_flowable = None
    if settings and settings.logo_key:
        try:
            logo_data = storage.read(settings.logo_key)
            if logo_data and len(logo_data) > 0:
                logo_flowable = RLImage(io.BytesIO(logo_data), width=48, height=48)
        except Exception:
            logo_flowable = None

    if not logo_flowable:
        init_char = org_name[0] if org_name else "V"
        logo_flowable = Paragraph(
            f"<font size=24 color='#065F46'><b>{init_char}</b></font>",
            ParagraphStyle("Init", alignment=1)
        )

    # બિલની બરાબર સેન્ટરમાં હેડિંગ
    top_center_title = Paragraph(
        "<font size=8 color='#A7F3D0'><b>OFFICIAL BUSINESS TAX INVOICE</b></font>",
        ParagraphStyle("TopCenterTitle", alignment=1, leading=10)
    )

    left_header_html = (
        f"<font size=16 color='#FFFFFF'><b>{org_name}</b></font><br/>"
    )
    if org_address:
        left_header_html += f"<font size=8 color='#D1FAE5'>{org_address}</font><br/>"
    left_header_html += (
        f"<font size=8 color='#D1FAE5'>Phone: {org_mobile}"
        + (f" | {org_email}" if org_email else "")
        + f"</font><br/><font size=8 color='#FEF08A'><b>{org_gst}</b></font>"
    )

    header_left = [
        [
            logo_flowable,
            Paragraph(left_header_html, ParagraphStyle("HLeft", parent=styles["Normal"], leading=12)),
        ]
    ]
    header_left_table = Table(header_left, colWidths=[55, 320])
    header_left_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 0),
    ]))

    header_right_html = (
        f"<font size=13 color='#FFFFFF'><b>{html.escape(str(invoice.invoice_number))}</b></font><br/>"
        f"<font size=8.5 color='#D1FAE5'>Date: <b>{html.escape(str(invoice.invoice_date))}</b></font>"
    )
    header_right_p = Paragraph(header_right_html, ParagraphStyle("HRight", parent=styles["Normal"], alignment=2, leading=12))

    # ૨ રો વાળી ટેબલ: ઉપર સેન્ટર ટાઇટલ અને નીચે દુકાનની વિગત + બિલ નંબર
    header_table = Table(
        [
            [top_center_title, ""],
            [header_left_table, header_right_p]
        ],
        colWidths=[375, 180]
    )
    header_table.setStyle(
        TableStyle([
            ("SPAN", (0, 0), (1, 0)),
            ("ALIGN", (0, 0), (1, 0), "CENTER"),
            ("BACKGROUND", (0, 0), (-1, -1), c_primary),
            ("PADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (1, 0), 2),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )
    story.append(header_table)

    # ================= 2. BILL TO & PAYMENT STATUS =================
    cust_name = html.escape(customer.name if customer else "Walk-in Customer")
    cust_phone = html.escape(f"+91 {customer.mobile}" if customer and customer.mobile else "N/A")
    cust_addr = html.escape(customer.address if customer and customer.address else "Direct Counter Sale")

    grand_total_num = float(invoice.grand_total or 0)
    paid_amount_num = float(invoice.paid_amount or 0)
    due_num = max(0.0, grand_total_num - paid_amount_num)
    is_paid = due_num <= 0.001

    status_badge_text = "PAID (ચૂકતે)" if is_paid else f"DUE: Rs. {due_num:.2f}"
    status_badge_color = "#047857" if is_paid else "#DC2626"

    payment_method = "CASH"
    if payments and len(payments) > 0:
        payment_method = html.escape(str(payments[0].method).upper())

    info_left = Paragraph(
        f"<font size=7 color='#065F46'><b>BILL TO / CUSTOMER:</b></font><br/>"
        f"<font size=11 color='#0F172A'><b>{cust_name}</b></font><br/>"
        f"<font size=8 color='#475569'>Phone: {cust_phone} | Address: {cust_addr}</font>",
        ParagraphStyle("CustInfo", parent=styles["Normal"], leading=11)
    )

    info_right = Paragraph(
        f"Payment Status: <font color='{status_badge_color}'><b>{status_badge_text}</b></font><br/>"
        f"Payment Mode: <b>{payment_method}</b><br/>"
        f"Balance Due: <b>Rs. {due_num:.2f}</b>",
        ParagraphStyle("PayInfo", parent=styles["Normal"], alignment=2, leading=11, fontSize=8)
    )

    info_table = Table([[info_left, info_right]], colWidths=[365, 190])
    info_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), c_bg_mint),
            ("PADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEBELOW", (0, 0), (-1, -1), 1.5, c_primary),
        ])
    )
    story.append(info_table)
    story.append(Spacer(1, 8))

    # ================= 3. ITEMS TABLE =================
    table_rows = [
        [
            Paragraph("<b>#</b>", ParagraphStyle("TH", textColor=colors.white, fontSize=8, alignment=1)),
            Paragraph("<b>Item Description</b>", ParagraphStyle("THL", textColor=colors.white, fontSize=8)),
            Paragraph("<b>Qty</b>", ParagraphStyle("THC", textColor=colors.white, fontSize=8, alignment=1)),
            Paragraph("<b>Rate (Rs.)</b>", ParagraphStyle("THR", textColor=colors.white, fontSize=8, alignment=2)),
            Paragraph("<b>Disc.</b>", ParagraphStyle("THR", textColor=colors.white, fontSize=8, alignment=2)),
            Paragraph("<b>GST %</b>", ParagraphStyle("THR", textColor=colors.white, fontSize=8, alignment=2)),
            Paragraph("<b>Total (Rs.)</b>", ParagraphStyle("THR", textColor=colors.white, fontSize=8, alignment=2)),
        ]
    ]

    for idx, it in enumerate(items, start=1):
        p_name = html.escape(str(it.product_name or "Item"))
        qty_val = float(it.quantity or 0)
        rate_val = float(it.rate or 0)
        disc_val = float(it.discount_amount or 0)
        tax_val = float(it.tax_percent or 0)
        total_val = float(it.line_total or 0)

        table_rows.append([
            Paragraph(f"<font color='#065F46'><b>{idx}</b></font>", ParagraphStyle("TD", alignment=1, fontSize=8)),
            Paragraph(f"<b>{p_name}</b>", ParagraphStyle("TDL", fontSize=8.5, textColor=c_text_dark)),
            Paragraph(f"{qty_val:.2f}", ParagraphStyle("TDC", alignment=1, fontSize=8)),
            Paragraph(f"{rate_val:.2f}", ParagraphStyle("TDR", alignment=2, fontSize=8)),
            Paragraph(f"{disc_val:.2f}", ParagraphStyle("TDR", alignment=2, fontSize=8, textColor=c_text_muted)),
            Paragraph(f"{tax_val:.1f}%", ParagraphStyle("TDR", alignment=2, fontSize=8, textColor=c_primary)),
            Paragraph(f"<b>{total_val:.2f}</b>", ParagraphStyle("TDRB", alignment=2, fontSize=8.5, textColor=c_primary)),
        ])

    items_table = Table(table_rows, colWidths=[25, 235, 45, 65, 55, 45, 85])
    items_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), c_primary),
            ("PADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, c_border),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ])
    )
    story.append(items_table)
    story.append(Spacer(1, 6))

    # ================= 4. AMOUNT IN WORDS BOX =================
    words_text = number_to_words_inr(grand_total_num)
    words_p = Paragraph(
        f"<font size=7 color='#065F46'><b>AMOUNT IN WORDS:</b></font> "
        f"<font size=8 color='#0F172A'><i>{html.escape(words_text)}</i></font>",
        styles["Normal"]
    )
    words_table = Table([[words_p]], colWidths=[555])
    words_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), c_bg_mint),
            ("PADDING", (0, 0), (-1, -1), 4),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#A7F3D0")),
        ])
    )
    story.append(words_table)
    story.append(Spacer(1, 8))

    # ================= 5. DYNAMIC UPI QR + BANK DETAILS + TOTALS =================
    upi_id = html.escape((settings.upi_id if settings and settings.upi_id else "") or "store@upi")
    store_title = org.name or "Store"
    upi_qr_url = f"upi://pay?pa={upi_id}&pn={urllib.parse.quote(store_title)}&am={grand_total_num:.2f}&cu=INR"

    qr_drawing = _make_safe_qr(upi_qr_url, size=65)
    if qr_drawing:
        qr_block = [
            [qr_drawing],
            [Paragraph("<font size=6 color='#065F46'><b>SCAN & PAY (UPI)</b></font>", ParagraphStyle("QRLbl", alignment=1))]
        ]
        qr_table = Table(qr_block, colWidths=[70])
        qr_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("PADDING", (0, 0), (-1, -1), 1),
        ]))
    else:
        qr_table = Paragraph("<font size=7 color='#065F46'><b>Scan & Pay UPI</b></font>", styles["Normal"])

    bank_name = html.escape(settings.bank_name if settings and settings.bank_name else "")
    bank_acc = html.escape(settings.bank_account_number if settings and settings.bank_account_number else "")
    bank_ifsc = html.escape(settings.bank_ifsc if settings and settings.bank_ifsc else "")

    bank_text = f"<font size=7 color='#065F46'><b>BANK & PAYMENT DETAILS:</b></font><br/>"
    if bank_name or bank_acc:
        bank_text += f"<font size=7.5>Bank: <b>{bank_name}</b><br/>A/C No: <b>{bank_acc}</b><br/>IFSC: <b>{bank_ifsc}</b></font><br/>"
    bank_text += f"<font size=7.5 color='#047857'>UPI ID: <b>{upi_id}</b></font>"

    bank_p = Paragraph(bank_text, ParagraphStyle("BankP", parent=styles["Normal"], leading=9.5))

    left_payment_box = Table([[qr_table, bank_p]], colWidths=[75, 245])
    left_payment_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.5, c_border),
        ("PADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))

    subtotal_num = float(invoice.subtotal or 0)
    disc_total_num = float(invoice.discount_total or 0)
    tax_total_num = float(invoice.tax_total or 0)

    totals_data = [
        [Paragraph("<font color='#64748B'>Subtotal:</font>", styles["Normal"]), Paragraph(f"Rs. {subtotal_num:.2f}", ParagraphStyle("R", alignment=2))],
        [Paragraph("<font color='#64748B'>Discount:</font>", styles["Normal"]), Paragraph(f"-Rs. {disc_total_num:.2f}", ParagraphStyle("R", alignment=2, textColor=colors.HexColor("#10B981")))],
        [Paragraph("<font color='#64748B'>GST Tax Total:</font>", styles["Normal"]), Paragraph(f"Rs. {tax_total_num:.2f}", ParagraphStyle("R", alignment=2))],
        [Paragraph("<font size=8.5 color='#FFFFFF'><b>TOTAL AMOUNT:</b></font>", styles["Normal"]), Paragraph(f"<font size=11 color='#FFFFFF'><b>Rs. {grand_total_num:.2f}</b></font>", ParagraphStyle("R", alignment=2))],
        [Paragraph("<font color='#475569'>Paid Amount:</font>", styles["Normal"]), Paragraph(f"Rs. {paid_amount_num:.2f}", ParagraphStyle("R", alignment=2))],
    ]
    if due_num > 0:
        totals_data.append([
            Paragraph("<font color='#DC2626'><b>Balance Due:</b></font>", styles["Normal"]),
            Paragraph(f"<font color='#DC2626'><b>Rs. {due_num:.2f}</b></font>", ParagraphStyle("R", alignment=2))
        ])

    totals_table = Table(totals_data, colWidths=[120, 110])
    totals_table.setStyle(
        TableStyle([
            ("PADDING", (0, 0), (-1, -1), 2.5),
            ("BACKGROUND", (0, 3), (-1, 3), c_primary),
            ("BOX", (0, 3), (-1, 3), 1, c_primary_dark),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )

    bottom_grid = Table([[left_payment_box, totals_table]], colWidths=[325, 230])
    bottom_grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(bottom_grid)
    story.append(Spacer(1, 8))

    # ================= 6. TERMS & AUTHORIZED SIGNATURE =================
    raw_terms = (
        (settings.terms_and_conditions if settings and settings.terms_and_conditions else "")
        or "1. Goods once sold will not be returned.\n2. Subject to local jurisdiction."
    )
    terms_escaped = html.escape(raw_terms).replace("\n", "<br/>")
    terms_p = Paragraph(
        f"<font size=7 color='#065F46'><b>TERMS & CONDITIONS:</b></font><br/>"
        f"<font size=7 color='#64748B'>{terms_escaped}</font>",
        ParagraphStyle("Terms", parent=styles["Normal"], leading=9)
    )

    sig_flowable = None
    if settings and settings.signature_key:
        try:
            sig_data = storage.read(settings.signature_key)
            if sig_data and len(sig_data) > 0:
                sig_flowable = RLImage(io.BytesIO(sig_data), width=85, height=30)
        except Exception:
            sig_flowable = None

    if not sig_flowable:
        sig_flowable = Paragraph(
            "<i>Digitally Signed</i>",
            ParagraphStyle("SigItalic", alignment=1, fontSize=8, textColor=colors.HexColor("#065F46"))
        )

    sig_block = [
        [sig_flowable],
        [Paragraph(f"<b>For {org_name}</b><br/><font size=6.5 color='#64748B'>Authorized Signatory</font>", ParagraphStyle("SigLbl", alignment=1, leading=8))]
    ]
    sig_table = Table(sig_block, colWidths=[150])
    sig_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LINEBELOW", (0, 0), (-1, 0), 1, c_primary),
        ("PADDING", (0, 0), (-1, -1), 1),
    ]))

    terms_sig_table = Table([[terms_p, sig_table]], colWidths=[405, 150])
    terms_sig_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("PADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(terms_sig_table)
    story.append(Spacer(1, 6))

    # ================= 7. FOOTER BAR =================
    raw_footer = settings.invoice_footer if settings and settings.invoice_footer else "Thank you for your business! Visit again."
    footer_p = Paragraph(
        f"<font size=7 color='#D1FAE5'>✓ Computer Generated Official GST Tax Invoice | {html.escape(raw_footer)} | <b>VOLONCE AI BILLING</b></font>",
        ParagraphStyle("Foot", alignment=1)
    )
    footer_table = Table([[footer_p]], colWidths=[555])
    footer_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), c_primary),
        ("PADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.append(footer_table)

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    pdf_bytes = buffer.getvalue()
    logger.info("PDF generated successfully: %d bytes", len(pdf_bytes))
    return pdf_bytes