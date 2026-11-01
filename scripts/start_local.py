"""Prepare and run the complete local site without changing existing secrets."""
import hashlib
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import threading
import time
import venv
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


def create_environment(root):
    target = root / ".env"
    if target.exists():
        return
    from cryptography.fernet import Fernet
    content = (
        f"APP_SECRET={secrets.token_urlsafe(48)}\n"
        f"DATA_KEY={Fernet.generate_key().decode()}\n"
        f"ADMIN_PASSWORD={secrets.token_urlsafe(24)}\n"
        "PUBLIC_URL=http://localhost:8000\n"
        "BOT_USERNAME=Renta_Car_777_bot\n"
        "TELEGRAM_BOT_TOKEN=\nDATA_DIR=data\nDEMO_MODE=true\n"
        "LEGAL_REVIEWED=false\nOPERATOR_NAME=\nOPERATOR_DETAILS=\nRETENTION_DAYS=30\n"
    )
    with target.open("x", encoding="utf-8") as handle:
        handle.write(content)
    if os.name != "nt":
        target.chmod(0o600)


def open_when_ready():
    for _ in range(60):
        try:
            with socket.create_connection(("127.0.0.1", 8000), timeout=0.3):
                webbrowser.open("http://localhost:8000")
                return
        except OSError:
            time.sleep(0.5)


def serve(bot=False):
    from dotenv import load_dotenv
    os.chdir(ROOT)
    create_environment(ROOT)
    load_dotenv(ROOT / ".env", override=False)
    if bot:
        if not os.environ.get("TELEGRAM_BOT_TOKEN"):
            raise RuntimeError("Set TELEGRAM_BOT_TOKEN in .env before starting the bot.")
        if not os.environ.get("PUBLIC_URL", "").startswith("https://"):
            raise RuntimeError("The bot requires a public HTTPS server URL in PUBLIC_URL.")
        return subprocess.call([sys.executable, str(ROOT / "bot.py")], cwd=ROOT)
    # Do not silently open another process already using this port.
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", 8000))
        except OSError as exc:
            raise RuntimeError("Port 8000 is busy. Stop the existing server and retry.") from exc
    print("Site: http://localhost:8000", flush=True)
    print("Admin: http://localhost:8000/admin", flush=True)
    print("Admin password: ADMIN_PASSWORD in the local .env file.", flush=True)
    print("Keep this window open. Press Ctrl+C to stop.", flush=True)
    threading.Thread(target=open_when_ready, daemon=True).start()
    return subprocess.call([sys.executable, str(ROOT / "app.py")], cwd=ROOT)


def main():
    if sys.version_info < (3, 12):
        raise RuntimeError("Install Python 3.12 or newer.")
    if "--serve" in sys.argv:
        return serve("--bot" in sys.argv)
    environment = ROOT / ".venv"
    python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        print("Creating local Python environment...", flush=True)
        venv.EnvBuilder(with_pip=True).create(environment)
    requirements = ROOT / "requirements.txt"
    digest = hashlib.sha256(requirements.read_bytes()).hexdigest()
    marker = environment / ".renta-requirements"
    if not marker.exists() or marker.read_text().strip() != digest:
        print("Installing dependencies (internet required)...", flush=True)
        subprocess.check_call([str(python), "-m", "pip", "install", "-r", str(requirements)], cwd=ROOT)
        marker.write_text(digest, encoding="utf-8")
    args = [str(python), str(Path(__file__).resolve()), "--serve"]
    if "--bot" in sys.argv:
        args.append("--bot")
    return subprocess.call(args, cwd=ROOT)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"Startup error: {exc}", file=sys.stderr)
        raise SystemExit(1)
