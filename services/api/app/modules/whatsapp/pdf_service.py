import io
from decimal import Decimal
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from app.models import Invoice, InvoiceItem, BusinessSettings, Organization, Customer

def generate_invoice_pdf_bytes(
    invoice: Invoice,
    items: list[InvoiceItem],
    org: Organization,
    settings: BusinessSettings | None,
    customer: Customer | None,
) -> bytes:
    """Generates an emerald-branded PDF invoice buffer with clean Rs. formatting."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=25,
        leftMargin=25,
        topMargin=25,
        bottomMargin=25,
    )
    story = []
    styles = getSampleStyleSheet()

    primary_color = colors.HexColor("#065F46")
    secondary_color = colors.HexColor("#ECFDF5")

    title_style = ParagraphStyle(
        "HeaderTitle",
        parent=styles["Normal"],
        fontSize=20,
        fontName="Helvetica-Bold",
        textColor=colors.white,
    )
    body_white = ParagraphStyle(
        "HeaderBody",
        parent=styles["Normal"],
        fontSize=9,
        fontName="Helvetica",
        textColor=colors.HexColor("#D1FAE5"),
    )

    org_name = org.name.upper() if org and org.name else "STORE"
    org_address = f"{org.address or ''}, {org.city or ''}" if org else ""
    org_mobile = f"+91 {org.mobile}" if org and org.mobile else ""
    org_gst = f"GSTIN: {org.gst_number}" if org and org.gst_number else ""

    # 1. Top Header
    header_data = [
        [
            Paragraph(f"<b>{org_name}</b>", title_style),
            Paragraph("<b>TAX INVOICE</b>", ParagraphStyle("RightTax", parent=title_style, alignment=2, fontSize=14)),
        ],
        [
            Paragraph(f"{org_address}<br/>Phone: {org_mobile} | {org_gst}", body_white),
            Paragraph(
                f"<b>Invoice #:</b> {invoice.invoice_number}<br/><b>Date:</b> {invoice.invoice_date}",
                ParagraphStyle("RightInv", parent=body_white, alignment=2),
            ),
        ],
    ]
    header_table = Table(header_data, colWidths=[340, 205])
    header_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), primary_color),
            ("PADDING", (0, 0), (-1, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )
    story.append(header_table)
    story.append(Spacer(1, 15))

    # 2. Bill To & Payment Info
    cust_name = customer.name if customer else "Walk-in Customer"
    cust_phone = f"+91 {customer.mobile}" if customer and customer.mobile else "N/A"
    cust_addr = customer.address if customer and customer.address else ""

    info_data = [
        [
            Paragraph(f"<b>BILL TO:</b><br/>{cust_name}<br/>Phone: {cust_phone}<br/>{cust_addr}", styles["Normal"]),
            Paragraph(
                f"<b>Payment Status:</b> {'PAID' if invoice.paid_amount >= invoice.grand_total else 'DUE'}<br/>"
                f"<b>Payment Mode:</b> Cash / UPI<br/>"
                f"<b>Total Due:</b> Rs. {max(0, invoice.grand_total - invoice.paid_amount):.2f}",
                styles["Normal"],
            ),
        ]
    ]
    info_table = Table(info_data, colWidths=[340, 205])
    info_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), secondary_color),
            ("PADDING", (0, 0), (-1, -1), 10),
            ("LINEBELOW", (0, 0), (-1, -1), 1, colors.HexColor("#A7F3D0")),
        ])
    )
    story.append(info_table)
    story.append(Spacer(1, 15))

    # 3. Items Table (Rs. formatting)
    table_rows = [
        [
            Paragraph("<b>#</b>", styles["Normal"]),
            Paragraph("<b>Item Description</b>", styles["Normal"]),
            Paragraph("<b>Qty</b>", styles["Normal"]),
            Paragraph("<b>Rate (Rs.)</b>", styles["Normal"]),
            Paragraph("<b>Tax %</b>", styles["Normal"]),
            Paragraph("<b>Total (Rs.)</b>", styles["Normal"]),
        ]
    ]

    for idx, it in enumerate(items, start=1):
        table_rows.append([
            str(idx),
            it.product_name,
            f"{it.quantity:.2f}",
            f"{it.rate:.2f}",
            f"{it.tax_percent:.1f}%",
            f"{it.line_total:.2f}",
        ])

    items_table = Table(table_rows, colWidths=[30, 260, 55, 65, 55, 80])
    items_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), primary_color),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
            ("PADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ])
    )
    story.append(items_table)
    story.append(Spacer(1, 15))

    # 4. Totals Summary (Rs. formatting)
    totals_data = [
        ["Subtotal:", f"Rs. {invoice.subtotal:.2f}"],
        ["Discount:", f"-Rs. {invoice.discount_total:.2f}"],
        ["Tax (GST):", f"Rs. {invoice.tax_total:.2f}"],
        ["Grand Total:", f"Rs. {invoice.grand_total:.2f}"],
        ["Paid Amount:", f"Rs. {invoice.paid_amount:.2f}"],
    ]
    totals_table = Table(totals_data, colWidths=[120, 100], hAlign="RIGHT")
    totals_table.setStyle(
        TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
            ("PADDING", (0, 0), (-1, -1), 3),
            ("BACKGROUND", (0, 3), (-1, 3), primary_color),
            ("TEXTCOLOR", (0, 3), (-1, 3), colors.white),
            ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
        ])
    )
    story.append(totals_table)
    story.append(Spacer(1, 20))

    # 5. Footer Notes
    footer_text = (
        (settings.terms_and_conditions if settings else None)
        or "Thank you for your business! This is a computer-generated tax invoice."
    )
    story.append(Paragraph(f"<b>Terms & Conditions:</b><br/>{footer_text}", styles["Normal"]))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()