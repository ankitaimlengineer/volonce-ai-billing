import uuid
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import log_activity
from app.core.deps import get_db, require_roles, require_setup_completed
from app.models import (
    InventoryMovement,
    Product,
    Shop,
    StockTransfer,
    StockTransferItem,
    User,
)
from app.schemas.stock_transfer import (
    StockTransferCreate,
    StockTransferItemOut,
    StockTransferOut,
)

router = APIRouter(prefix="/api/v1/inventory/transfers", tags=["stock-transfers"])
can_write = require_roles("owner", "manager")
can_read = require_setup_completed


def _org_id(user: User) -> uuid.UUID:
    if not user.organization_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No organization linked")
    return user.organization_id


def _get_shop_stock(db: Session, org_id: uuid.UUID, shop_id: uuid.UUID, product_id: uuid.UUID) -> Decimal:
    """ચોક્કસ ગોડાઉન કે શાખામાં પ્રોડક્ટનો કેટલો સ્ટોક છે તે ગણે છે."""
    res = db.scalar(
        select(func.coalesce(func.sum(InventoryMovement.quantity), 0)).where(
            InventoryMovement.organization_id == org_id,
            InventoryMovement.shop_id == shop_id,
            InventoryMovement.product_id == product_id,
        )
    )
    return Decimal(res)


def _to_transfer_out(db: Session, t: StockTransfer) -> StockTransferOut:
    shops_map = {
        s.id: s.name
        for s in db.scalars(
            select(Shop).where(Shop.organization_id == t.organization_id)
        ).all()
    }
    items = db.scalars(
        select(StockTransferItem).where(StockTransferItem.transfer_id == t.id)
    ).all()

    prods_map = {
        p.id: p.name
        for p in db.scalars(
            select(Product).where(Product.id.in_([i.product_id for i in items]))
        ).all()
    }

    out_items = [
        StockTransferItemOut(
            id=i.id,
            product_id=i.product_id,
            product_name=prods_map.get(i.product_id, "Product"),
            quantity=i.quantity,
            batch_no=i.batch_no,
            expiry_date=i.expiry_date,
        )
        for i in items
    ]

    return StockTransferOut(
        id=t.id,
        transfer_number=t.transfer_number,
        from_shop_id=t.from_shop_id,
        from_shop_name=shops_map.get(t.from_shop_id, "Source"),
        to_shop_id=t.to_shop_id,
        to_shop_name=shops_map.get(t.to_shop_id, "Destination"),
        transfer_date=t.transfer_date,
        status=t.status,
        notes=t.notes,
        created_at=t.created_at,
        items=out_items,
    )


@router.get("/shop-stock/{shop_id}/{product_id}")
def check_shop_stock_endpoint(
    shop_id: uuid.UUID,
    product_id: uuid.UUID,
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    """UI માટે: ચોક્કસ ગોડાઉન પસંદ કરતાં તેમાં કેટલો સ્ટોક છે તે લાઈવ બતાવશે."""
    org_id = _org_id(user)
    available = _get_shop_stock(db, org_id, shop_id, product_id)
    return {"shop_id": shop_id, "product_id": product_id, "available_stock": float(available)}


@router.post("", response_model=StockTransferOut, status_code=status.HTTP_201_CREATED)
def create_stock_transfer(
    data: StockTransferCreate,
    idempotency_key: str = Header(min_length=8, max_length=100, alias="Idempotency-Key"),
    user: User = Depends(can_write),
    _setup: User = Depends(require_setup_completed),
    db: Session = Depends(get_db),
):
    """
    ગોડાઉનથી દુકાન કે એક શાખાથી બીજી શાખામાં સ્ટોક ટ્રાન્સફર કરે છે.
    સોર્સ ગોડાઉનમાંથી માલ ઘટશે અને ડેસ્ટિનેશનમાં માલ જમા થશે.
    """
    org_id = _org_id(user)

    if data.from_shop_id == data.to_shop_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "સોર્સ અને ડેસ્ટિનેશન ગોડાઉન અલગ અલગ હોવા જોઈએ."
        )

    # ૧. Idempotency Check (ડબલ-ક્લિક સેફ્ટી)
    existing = db.scalar(
        select(StockTransfer).where(
            StockTransfer.organization_id == org_id,
            StockTransfer.idempotency_key == idempotency_key,
        )
    )
    if existing:
        return _to_transfer_out(db, existing)

    # ૨. શાખાઓ ચકાસો
    from_shop = db.scalar(
        select(Shop).where(Shop.id == data.from_shop_id, Shop.organization_id == org_id)
    )
    to_shop = db.scalar(
        select(Shop).where(Shop.id == data.to_shop_id, Shop.organization_id == org_id)
    )
    if not from_shop or not to_shop:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "પસંદ કરેલી શાખા કે ગોડાઉન મળ્યું નથી.")

    # ૩. પ્રોડક્ટ્સ લોક કરો (Row Locking) અને સ્ટોક ચકાસો
    product_ids = sorted({it.product_id for it in data.items}, key=str)
    prods = {
        p.id: p
        for p in db.scalars(
            select(Product)
            .where(
                Product.id.in_(product_ids),
                Product.organization_id == org_id,
                Product.is_active.is_(True),
            )
            .order_by(Product.id)
            .with_for_update()
        ).all()
    }
    if len(prods) != len(product_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "અમાન્ય પ્રોડક્ટ પસંદ કરેલી છે.")

    # ૪. દરેક પ્રોડક્ટનો સોર્સ ગોડાઉનમાં સ્ટોક ચેક કરો
    for it in data.items:
        available = _get_shop_stock(db, org_id, from_shop.id, it.product_id)
        if available - it.quantity < Decimal("0"):
            p_name = prods[it.product_id].name
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"'{from_shop.name}' માં '{p_name}' નો પૂરતો સ્ટોક નથી! હાજર સ્ટોક: {available}, ટ્રાન્સફર કરવાનો જથ્થો: {it.quantity}",
            )

    # ૫. ટ્રાન્સફર નંબર જનરેટ કરો
    today = data.transfer_date or date.today()
    count = db.scalar(
        select(func.count(StockTransfer.id)).where(StockTransfer.organization_id == org_id)
    ) or 0
    transfer_no = f"TRF-{today.strftime('%Y%m')}-{str(count + 1).zfill(4)}"

    # ૬. એટોમિક ટ્રાન્ઝેક્શનમાં ટ્રાન્સફર અને ૨ સ્ટોક મુવમેન્ટ્સ બનાવો
    try:
        transfer = StockTransfer(
            organization_id=org_id,
            from_shop_id=from_shop.id,
            to_shop_id=to_shop.id,
            created_by=user.id,
            transfer_number=transfer_no,
            idempotency_key=idempotency_key,
            transfer_date=today,
            status="completed",
            notes=data.notes,
        )
        db.add(transfer)
        db.flush()

        for it in data.items:
            db.add(
                StockTransferItem(
                    organization_id=org_id,
                    transfer_id=transfer.id,
                    product_id=it.product_id,
                    quantity=it.quantity,
                    batch_no=it.batch_no,
                    expiry_date=it.expiry_date,
                )
            )

            # (A) સોર્સ ગોડાઉનમાંથી માલ ઓછો કરો (-)
            db.add(
                InventoryMovement(
                    organization_id=org_id,
                    shop_id=from_shop.id,
                    product_id=it.product_id,
                    movement_type="transfer_out",
                    quantity=-it.quantity,
                    batch_no=it.batch_no,
                    expiry_date=it.expiry_date,
                    reference_type="stock_transfer",
                    reference_id=transfer.id,
                    note=f"Transfer to {to_shop.name} ({transfer_no})",
                    created_by=user.id,
                )
            )

            # (B) ડેસ્ટિનેશન ગોડાઉનમાં માલ જમા કરો (+)
            db.add(
                InventoryMovement(
                    organization_id=org_id,
                    shop_id=to_shop.id,
                    product_id=it.product_id,
                    movement_type="transfer_in",
                    quantity=it.quantity,
                    batch_no=it.batch_no,
                    expiry_date=it.expiry_date,
                    reference_type="stock_transfer",
                    reference_id=transfer.id,
                    note=f"Received from {from_shop.name} ({transfer_no})",
                    created_by=user.id,
                )
            )

        db.commit()

        # ઓડિટ લોગ
        log_activity(
            db=db,
            action="stock_transfer",
            resource_type="stock_transfer",
            organization_id=org_id,
            user_id=user.id,
            resource_id=str(transfer.id),
            details={
                "transfer_number": transfer.transfer_number,
                "from_shop": from_shop.name,
                "to_shop": to_shop.name,
                "items_count": len(data.items),
            },
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"ટ્રાન્સફર સેવ થઈ શક્યું નથી: {str(e)}")

    return _to_transfer_out(db, transfer)


@router.get("", response_model=list[StockTransferOut])
def list_stock_transfers(
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    """તમામ સ્ટોક ટ્રાન્સફર્સની હિસ્ટ્રી."""
    org_id = _org_id(user)
    transfers = db.scalars(
        select(StockTransfer)
        .where(StockTransfer.organization_id == org_id)
        .order_by(StockTransfer.transfer_date.desc(), StockTransfer.created_at.desc())
        .limit(limit)
    ).all()
    return [_to_transfer_out(db, t) for t in transfers]


@router.get("/{transfer_id}", response_model=StockTransferOut)
def get_stock_transfer(
    transfer_id: uuid.UUID,
    user: User = Depends(can_read),
    db: Session = Depends(get_db),
):
    org_id = _org_id(user)
    t = db.scalar(
        select(StockTransfer).where(
            StockTransfer.id == transfer_id,
            StockTransfer.organization_id == org_id,
        )
    )
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stock transfer not found")
    return _to_transfer_out(db, t)