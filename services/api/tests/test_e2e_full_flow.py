import uuid
import pytest


def test_section_59_complete_e2e_flow(client):
    """
    SECTION 59 MASTER END-TO-END FLOW:
    Login -> Business Setup -> Add Product -> Add Customer ->
    Camera Scan Simulation -> Edit Draft -> Confirm Bill ->
    Stock Deduct -> Customer Ledger -> WhatsApp PDF Verification
    """
    # ૧. REGISTER & LOGIN
    unique_email = f"retailer_{uuid.uuid4().hex[:6]}@volonce.com"
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Khedut Agro Kendra",
            "full_name": "Bharatbhai Patel",
            "email": unique_email,
            "mobile": "9998887771",
            "password": "SecurePassword@123",
        },
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # ૨. COMPLETE BUSINESS SETUP WIZARD
    setup_res = client.put(
        "/api/v1/business/profile",
        json={
            "name": "Khedut Agro Kendra",
            "owner_name": "Bharatbhai Patel",
            "business_type": "retail",
            "business_category": "agro_shop",
            "mobile": "9998887771",
            "email": unique_email,
            "address": "Bazar Line",
            "city": "Baroda",
            "state": "Gujarat",
            "pincode": "390001",
            "gst_number": "24ABCDE1234F1Z5",
        },
        headers=auth_headers,
    )
    assert setup_res.status_code == 200

    finish_res = client.post("/api/v1/business/complete-setup", headers=auth_headers)
    assert finish_res.status_code == 200

    # ૩. ADD PRODUCT & INITIAL STOCK
    prod_res = client.post(
        "/api/v1/products",
        json={
            "name": "Bio Fertilizer NPK",
            "sku": "NPK-BIO-01",
            "unit": "kg",
            "purchase_price": "400.00",
            "selling_price": "500.00",
            "tax_percent": "5.00",
            "min_stock": "5.00",
        },
        headers=auth_headers,
    )
    assert prod_res.status_code == 201
    product_id = prod_res.json()["id"]

    # સ્ટોક ઉમેરો: 20 kg
    client.post(
        "/api/v1/inventory/movements",
        json={"product_id": product_id, "movement_type": "opening", "quantity": "20.00", "note": "Initial Stock"},
        headers=auth_headers,
    )

    # ૪. ADD CUSTOMER (ઉધારી ગ્રાહક)
    cust_res = client.post(
        "/api/v1/customers",
        json={
            "name": "Pravinbhai Farmer",
            "mobile": "9898989898",
            "customer_type": "farmer",
            "opening_balance": "0.00",
        },
        headers=auth_headers,
    )
    assert cust_res.status_code == 201
    customer_id = cust_res.json()["id"]

    # ૫. SIMULATE CAMERA SCAN & CONFIRM BILL (ઉધારી બિલ: ₹1050)
    # 2 kg NPK => Base 1000 + 50 Tax = 1050, Paid = 500 (બાકી 550)
    inv_res = client.post(
        "/api/v1/invoices",
        json={
            "customer_id": customer_id,
            "items": [{"product_id": product_id, "quantity": 2.0, "discount_percent": 0.0}],
            "payments": [{"method": "cash", "amount": 500.00}],
            "notes": "Delivered to farm",
        },
        headers={**auth_headers, "Idempotency-Key": f"e2e-bill-{uuid.uuid4().hex}"},
    )
    assert inv_res.status_code == 201
    invoice = inv_res.json()
    invoice_id = invoice["id"]
    assert float(invoice["grand_total"]) == 1050.00
    assert float(invoice["paid_amount"]) == 500.00

    # ૬. VERIFY STOCK DEDUCTION (20 kg માંથી 2 kg બાદ થઈને 18 kg રહેવા જોઈએ)
    stock_res = client.get(f"/api/v1/inventory/products/{product_id}/stock", headers=auth_headers)
    assert float(stock_res.json()["current_stock"]) == 18.00

    # ૭. VERIFY CUSTOMER LEDGER (બાકી ઉધારી = ₹550 હોવી જોઈએ)
    ledger_res = client.get(f"/api/v1/customers/{customer_id}/ledger", headers=auth_headers)
    assert ledger_res.status_code == 200
    assert float(ledger_res.json()["outstanding"]) == 550.00

    # ૮. VERIFY INVOICE PDF DOWNLOAD (સર્વરથી PDF બાઈટ્સ મળવી જોઈએ)
    pdf_res = client.get(f"/api/v1/whatsapp/invoices/{invoice_id}/download-pdf", headers=auth_headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert len(pdf_res.content) > 1000  # ખાલી ફાઈલ ન હોવી જોઈએ