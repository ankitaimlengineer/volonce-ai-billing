"""
VOLONCE AI BILLING - Universal "Newest on Top" Auto-Patcher
આ સ્ક્રિપ્ટ આખા પ્રોજેક્ટની તમામ ફાઇલોમાં નવી એન્ટ્રી હંમેશા સૌથી ઉપર આવે તેવો ફેરફાર ૧-ક્લિકમાં કરી દેશે.
"""

import os
import re
from pathlib import Path

# પ્રોજેક્ટનું રૂટ ફોલ્ડર શોધો
cwd = Path.cwd().resolve()
if (cwd / "services" / "api").exists():
    ROOT = cwd
elif (cwd.parent / "services" / "api").exists():
    ROOT = cwd.parent
elif (cwd / "app").exists():
    ROOT = cwd.parent.parent
else:
    ROOT = cwd

print(f"\n🚀 VOLONCE AI Auto-Patcher શરૂ થઈ રહ્યું છે...")
print(f"📁 Project Root: {ROOT}\n")

updated_count = 0


def patch_file(rel_path: str, find_pattern: str, replace_with: str, is_regex=False):
    global updated_count
    file_path = ROOT / rel_path
    if not file_path.exists():
        print(f"⚠️  ફાઇલ મળી નથી: {rel_path}")
        return

    content = file_path.read_text(encoding="utf-8")

    if is_regex:
        new_content, count = re.subn(find_pattern, replace_with, content)
        if count > 0:
            file_path.write_text(new_content, encoding="utf-8")
            print(f"✅ [સુધારી દીધી] {rel_path} (ફેરફાર: {count})")
            updated_count += 1
        else:
            print(f"ℹ️  [પહેલેથી સુધારેલી છે] {rel_path}")
    else:
        if find_pattern in content:
            new_content = content.replace(find_pattern, replace_with)
            file_path.write_text(new_content, encoding="utf-8")
            print(f"✅ [સુધારી દીધી] {rel_path}")
            updated_count += 1
        else:
            print(f"ℹ️  [પહેલેથી સુધારેલી છે અથવા પેટર્ન મેચ નથી] {rel_path}")


# ---------------- ૧. પ્રોડક્ટ્સ લિસ્ટ: નવી પ્રોડક્ટ્સ સૌથી ઉપર ----------------
patch_file(
    "services/api/app/modules/catalog/router.py",
    "stmt.order_by(Product.name)",
    "stmt.order_by(Product.created_at.desc())",
)

# ---------------- ૨. સપ્લાયર લિસ્ટ: નવા સપ્લાયર સૌથી ઉપર ----------------
patch_file(
    "services/api/app/modules/purchase/suppliers.py",
    "stmt.order_by(Supplier.name)",
    "stmt.order_by(Supplier.created_at.desc())",
)

# ---------------- ૩. સપ્લાયર ખાતાવહી: નવી પેમેન્ટ/એન્ટ્રી સૌથી ઉપર ----------------
ledger_path = ROOT / "services/api/app/modules/purchase/ledger.py"
if ledger_path.exists():
    content = ledger_path.read_text(encoding="utf-8")
    if "rows.reverse()" not in content and "return LedgerOut(" in content:
        content = content.replace("return LedgerOut(", "rows.reverse()\n    return LedgerOut(")
        ledger_path.write_text(content, encoding="utf-8")
        print("✅ [સુધારી દીધી] services/api/app/modules/purchase/ledger.py (rows.reverse ઉમેર્યું)")
        updated_count += 1
    else:
        print("ℹ️  [પહેલેથી અપડેટ છે] services/api/app/modules/purchase/ledger.py")

# ---------------- ૪. ગ્રાહક લિસ્ટ: નવા ગ્રાહક સૌથી ઉપર ----------------
patch_file(
    "services/api/app/modules/sales/customers.py",
    "stmt.order_by(Customer.name)",
    "stmt.order_by(Customer.created_at.desc())",
)

# ---------------- ૫. ગ્રાહક ખાતાવહી: નવી પેમેન્ટ/સોદો સૌથી ઉપર ----------------
cust_path = ROOT / "services/api/app/modules/sales/customers.py"
if cust_path.exists():
    content = cust_path.read_text(encoding="utf-8")
    if "rows.reverse()" not in content and "return CustomerLedgerOut(" in content:
        content = content.replace("return CustomerLedgerOut(", "rows.reverse()\n    return CustomerLedgerOut(")
        cust_path.write_text(content, encoding="utf-8")
        print("✅ [સુધારી દીધી] services/api/app/modules/sales/customers.py (rows.reverse ઉમેર્યું)")
        updated_count += 1
    else:
        print("ℹ️  [પહેલેથી અપડેટ છે] services/api/app/modules/sales/customers.py")

# ---------------- ૬. AI કેમેરા સ્કેનિંગ: નવો ફોટો હંમેશા પહેલો (Top) ----------------
patch_file(
    "apps/mobile/src/screens/AiCameraBillingScreen.tsx",
    "setPhotos((prev) => [...prev, uri]);",
    "setPhotos((prev) => [uri, ...prev]);",
)

# ---------------- ૭. મોબાઇલ ગ્રાહક ખાતાવહી સ્ક્રીન: Newest on Top ----------------
patch_file(
    "apps/mobile/src/screens/CustomerLedgerScreen.tsx",
    "data={data?.items || []}",
    "data={[...(data?.items || [])].reverse()}",
)

print(f"\n🎉 અભિનંદન! કુલ {updated_count} ફાઇલો આપોઆપ સુધારી લેવામાં આવી છે.")
print("✨ હવે આખી એપ્લિકેશનમાં કોઈપણ નવી એન્ટ્રી હંમેશા સૌથી ઉપર જ આવશે!\n")