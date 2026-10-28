import uuid
from decimal import Decimal
import pytest


def test_stock_movement_and_negative_stock_prevention(client, test_business_data):
    """પ્રોડક્ટ ઉમેરો, ઓપનિંગ સ્ટોક નાખો અને નેગેટિવ સ્ટોક અટકાવો."""
    headers = test_business_data["headers"]

    # ૧. નવી પ્રોડક્ટ ઉમેરો (દા.ત. યુરિયા ખાતર)
    prod_payload = {
        "name": "Neem Urea 50kg",
        "sku": "UREA-50KG",
        "unit": "bag",
        "purchase_price": "250.00",
        "selling_price": "270.00",
        "tax_percent": "5.00",
        "min_stock": "10.00",
    }
    prod_res = client.post("/api/v1/products", json=prod_payload, headers=headers)
    assert prod_res.status_code == 201
    product = prod_res.json()
    product_id = product["id"]

    # ૨. ૧૦૦ બેગનો ઓપનિંગ સ્ટોક ઉમેરો
    movement_payload = {
        "product_id": product_id,
        "movement_type": "opening",
        "quantity": "100.000",
        "note": "Initial opening stock",
    }
    mov_res = client.post("/api/v1/inventory/movements", json=movement_payload, headers=headers)
    assert mov_res.status_code == 201

    # ૩. સ્ટોક વેલ્યુ ચકાસો (૧૦૦ બેગ હોવી જોઈએ)
    stock_res = client.get(f"/api/v1/inventory/products/{product_id}/stock", headers=headers)
    assert stock_res.status_code == 200
    assert float(stock_res.json()["current_stock"]) == 100.0

    # ૪. નેગેટિવ સ્ટોક ચેક: ૧૦૦ બેગ છે ને ૧૫૦ ડેમેજ/કાઢવા જઈએ તો સિસ્ટમે 409 Conflict આપવું જોઈએ
    invalid_adjust = {
        "product_id": product_id,
        "movement_type": "damage",
        "quantity": "150.000",
        "note": "Exceeding damage",
    }
    fail_res = client.post("/api/v1/inventory/movements", json=invalid_adjust, headers=headers)
    assert fail_res.status_code == 409
    assert "Stock negative thai jashe" in fail_res.json()["detail"]