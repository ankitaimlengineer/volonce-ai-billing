import sys
from sqlalchemy import select
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import User, Organization

def make_super_admin(email: str, password: str, name: str = "Super Admin"):
    db = SessionLocal()
    try:
        email_clean = email.strip().lower()
        user = db.scalar(select(User).where(User.email == email_clean))
        if user:
            user.role = "super_admin"
            user.password_hash = hash_password(password)
            user.is_active = True
            db.commit()
            print(f"✅ યુઝર '{email_clean}' હવે Super Admin બની ગયો છે!")
        else:
            # નવી ઓર્ગેનાઇઝેશન બનાવીને સુપર એડમિન બનાવો
            org = Organization(name="VOLONCE Platform HQ", setup_completed=True)
            db.add(org)
            db.flush()

            admin_user = User(
                organization_id=org.id,
                email=email_clean,
                full_name=name,
                password_hash=hash_password(password),
                role="super_admin",
                is_active=True,
            )
            db.add(admin_user)
            db.commit()
            print(f"🎉 નવો Super Admin એકાઉન્ટ સફળતાપૂર્વક બની ગયો: {email_clean}")
    except Exception as e:
        print("❌ ભૂલ આવી:", e)
    finally:
        db.close()

if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@volonce.com"
    pwd = sys.argv[2] if len(sys.argv) > 2 else "Admin@12345"
    print(f"🚀 Creating Super Admin for: {email}")
    make_super_admin(email, pwd)