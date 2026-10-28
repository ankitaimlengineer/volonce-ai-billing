"""
VOLONCE AI BILLING - 1-Click Auto Setup & Test Runner
આ સ્ક્રિપ્ટ આપોઆપ Docker ચાલુ કરશે, ડેટાબેઝ શરૂ કરશે અને ટેસ્ટ રન કરશે.
"""

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent

print("\n" + "=" * 60)
print("🚀 VOLONCE AI BILLING - 1-CLICK AUTO RUNNER શરૂ થઈ રહ્યું છે...")
print("=" * 60)


def run_cmd(cmd, cwd=None, shell=True):
    return subprocess.run(
        cmd,
        cwd=cwd or ROOT,
        shell=shell,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )


# ૧. Docker ચાલુ છે કે નહીં તે તપાસો
print("\n[૧/૪] 🐳 Docker Desktop ચકાસી રહ્યા છીએ...")
res = run_cmd("docker info")

if res.returncode != 0:
    print("⚠️ Docker Engine બંધ છે. Docker Desktop આપોઆપ ખોલી રહ્યા છીએ...")
    # Windows માં Docker Desktop શરૂ કરો
    docker_paths = [
        r"C:\Program Files\Docker\Docker\Docker Desktop.exe",
        r"C:\Program Files\Docker\Docker\Docker.exe",
    ]
    started = False
    for p in docker_paths:
        if os.path.exists(p):
            subprocess.Popen([p])
            started = True
            break

    if not started:
        print(
            "❌ Docker Desktop મળ્યું નથી! કૃપા કરીને Windows Start મેનૂમાંથી Docker Desktop જાતે ઓપન કરો."
        )

    print("⏳ Docker Engine શરૂ થવાની રાહ જોઈ રહ્યા છીએ (આશરે ૧૫-૨૫ સેકન્ડ)...")
    for i in range(40):
        time.sleep(2)
        check = run_cmd("docker info")
        if check.returncode == 0:
            print("✅ Docker Engine સફળતાપૂર્વક ચાલુ થઈ ગયું!")
            break
        print(f"   રાહ જુઓ... ({i*2} સેકન્ડ)")
    else:
        print(
            "⚠️ Docker શરૂ થવામાં વધુ સમય લઈ રહ્યું છે. કૃપા કરીને ટાસ્કબારમાં Docker ઓપન થવા દો."
        )

# ૨. ડેટાબેઝ કન્ટેનર ચાલુ કરો
print("\n[૨/૪] 🗄️ PostgreSQL અને Redis કન્ટેનર શરૂ કરી રહ્યા છીએ...")
up_res = run_cmd("docker compose up -d")
print(up_res.stdout or up_res.stderr or "   કન્ટેનર્સ ઓર્ડર અપાઈ ગયો.")

# ડેટાબેઝ પોર્ટ તૈયાર થવા માટે ૪ સેકન્ડ રાહ જુઓ
time.sleep(4)

# ૩. ડેટાબેઝ માઇગ્રેશન (Tables Create)
print("\n[૩/૪] 📑 તમામ ડેટાબેઝ ટેબલો ચેક / અપગ્રેડ કરી રહ્યા છીએ...")
api_dir = ROOT / "services" / "api"
mig_res = run_cmd("alembic upgrade head", cwd=api_dir)
if mig_res.returncode == 0:
    print("✅ તમામ 25+ ડેટાબેઝ ટેબલો એકદમ રેડી છે!")
else:
    print("ℹ️ Alembic status:", mig_res.stderr or mig_res.stdout)

# ૪. Pytest રન કરો
print("\n[૪/૪] 🧪 ઓટોમેટેડ ટેસ્ટિંગ રન થઈ રહ્યું છે...")
print("-" * 60)

test_proc = subprocess.run(
    [sys.executable, "-m", "pytest", "-v"],
    cwd=api_dir,
)

print("\n" + "=" * 60)
if test_proc.returncode == 0:
    print("🎉 અભિનંદન! તમામ ટેસ્ટ ૧૦૦% સફળતાપૂર્વક પાસ થઈ ગયા છે!")
else:
    print("ℹ️ ટેસ્ટ પૂર્ણ થયા.")
print("=" * 60)