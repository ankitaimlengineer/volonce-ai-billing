import uuid
import pytest


def test_invoice_math_and_idempotency(client, test_business_data):
    """બિલના ડિસ્કાઉન્ટ, ટેક્સ અને ડબલ-ક્લિક Idempotency કન્સ્ટ્રેઇન્ટની ચોકસાઈ."""
    headers = test_business_data["headers"]

    # ૧. પ્રોડક્ટ ઉમેરો: ભાવ = ₹100, GST = 18%
    p_res = client.post(
        "/api/v1/products",
        json={
            "name": "Kreo GoRec Duo 1L",
            "sku": "KREO-1L",
            "unit": "bottle",
            "purchase_price": "80.00",
            "selling_price": "100.00",
            "tax_percent": "18.00",
            "min_stock": "5.00",
        },
        headers=headers,
    )
    product_id = p_res.json()["id"]

    # સ્ટોક ઉમેરો: 50 bottles
    client.post(
        "/api/v1/inventory/movements",
        json={"product_id": product_id, "movement_type": "opening", "quantity": "50.00", "note": "Stock"},
        headers=headers,
    )

    # ૨. બિલ બનાવો: QTY = 2, Discount = 10%
    # Base = 200, Discount 10% = -20 => Taxable = 180, Tax 18% = 32.40 => Total = 212.40
    idempotency_key = f"test-key-{uuid.uuid4().hex}"
    invoice_payload = {
        "customer_id": None,
        "items": [
            {
                "product_id": product_id,
                "quantity": 2.0,
                "discount_percent": 10.0,
            }
        ],
        "payments": [{"method": "cash", "amount": 212.40}],
    }

    req_headers = {**headers, "Idempotency-Key": idempotency_key}

    # પહેલો કોલ
    res1 = client.post("/api/v1/invoices", json=invoice_payload, headers=req_headers)
    assert res1.status_code == 201
    inv_data = res1.json()

    assert float(inv_data["subtotal"]) == 200.00
    assert float(inv_data["discount_total"]) == 20.00
    assert float(inv_data["tax_total"]) == 32.40
    assert float(inv_data["grand_total"]) == 212.40

    # ૩. ડબલ-ક્લિક ચેક: સેમ કી સાથે ફરી કોલ કરીએ તો ડુપ્લિકેટ ન બનવું જોઈએ, સેમ બિલ મળવું જોઈએ
    res2 = client.post("/api/v1/invoices", json=invoice_payload, headers=req_headers)
    assert res2.status_code == 200 or res2.status_code == 201
    assert res2.json()["id"] == inv_data["id"]

    # ૪. સ્ટોક ચેક: ૫૦ માંથી ૨ કપાઈ ગયા હોવા જોઈએ => ૪૮ વધવા જોઈએ
    stock_check = client.get(f"/api/v1/inventory/products/{product_id}/stock", headers=headers)
    assert float(stock_check.json()["current_stock"]) == 48.0