"""Read-only checks of the isolated Neon deployment."""
import json
import time
import urllib.error
import urllib.request

BASE = "https://br-misty-lake-bachd4fm-rentatest.compute.c-8.eu-central-1.aws.neon.tech"


def check():
    with urllib.request.urlopen(BASE + "/health", timeout=30) as response:
        assert response.status == 200
        data = json.load(response)
    assert data["ok"] is True
    assert data["service"] == "renta-car-neon-test"
    assert data["databaseTested"] is False
    assert data["telegramConfigured"] is False
    with urllib.request.urlopen(BASE + "/", timeout=30) as response:
        assert response.status == 200
        assert "Neon Functions works" in response.read().decode()
    for path, method, status in [("/missing", "GET", 404), ("/health", "POST", 405)]:
        try:
            urllib.request.urlopen(urllib.request.Request(BASE + path, method=method), timeout=30)
        except urllib.error.HTTPError as error:
            assert error.code == status, error.code
        else:
            raise AssertionError(f"Expected {status}")
    print("PASS: HTTPS homepage 200, health JSON 200, missing route 404, POST 405")


if __name__ == "__main__":
    for attempt in range(6):
        try:
            check()
            break
        except Exception:
            if attempt == 5:
                raise
            time.sleep(3)
