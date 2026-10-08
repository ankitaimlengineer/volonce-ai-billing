from fastapi import APIRouter, Depends

from app.core.deps import get_current_user, require_roles, require_setup_completed
from app.models import User

router = APIRouter(prefix="/api/v1/debug", tags=["debug (temporary)"])


@router.get("/any-user")
def any_user(user: User = Depends(get_current_user)):
    return {"ok": True, "role": user.role}


@router.get("/setup-required")
def setup_required(user: User = Depends(require_setup_completed)):
    return {"ok": True, "message": "Setup is completed"}


@router.get("/owner-only")
def owner_only(user: User = Depends(require_roles("owner"))):
    return {"ok": True, "message": "You are an owner"}


@router.get("/cashier-only")
def cashier_only(user: User = Depends(require_roles("cashier"))):
    return {"ok": True, "message": "You are a cashier"}