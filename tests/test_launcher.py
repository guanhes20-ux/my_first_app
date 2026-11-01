import importlib.util
from pathlib import Path
import py_compile

LAUNCHER = Path(__file__).resolve().parents[1] / "scripts" / "start_local.py"
spec = importlib.util.spec_from_file_location("start_local", LAUNCHER)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


def test_launcher_compiles(tmp_path):
    py_compile.compile(str(LAUNCHER), cfile=str(tmp_path / "launcher.pyc"), doraise=True)


def test_environment_is_created_and_existing_secrets_preserved(tmp_path):
    from dotenv import dotenv_values
    from cryptography.fernet import Fernet
    launcher.create_environment(tmp_path)
    config = dotenv_values(tmp_path / ".env")
    assert len(config["APP_SECRET"]) >= 32
    assert len(config["ADMIN_PASSWORD"]) >= 16
    Fernet(config["DATA_KEY"])
    assert config["PUBLIC_URL"] == "http://localhost:8000"
    assert config["DEMO_MODE"] == "true"
    original = (tmp_path / ".env").read_bytes()
    launcher.create_environment(tmp_path)
    assert (tmp_path / ".env").read_bytes() == original
