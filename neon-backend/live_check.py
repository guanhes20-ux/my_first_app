"""Read-only smoke check of the deployed development backend."""
import http.cookiejar
import json
import time
import urllib.error
import urllib.request

BASE = "https://br-silent-cloud-bad4q8g3-rentadev.compute.c-8.eu-central-1.aws.neon.tech"
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def get(path):
    with client.open(BASE + path, timeout=45) as response:
        assert response.status == 200
        return response.read().decode(), response.headers


def check():
    health = json.loads(get("/health")[0])
    assert health["ok"] and health["demo"]
    assert health["service"] == "renta-neon-backend"
    assert health["telegramConfigured"] is False
    html, headers = get("/")
    assert 'class="hero-title-coral"' in html
    assert 'name="static-demo"' not in html
    assert 'name="csrf-token"' in html
    cookie = headers.get("Set-Cookie", "")
    assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=Lax" in cookie
    catalogue = json.loads(get("/api/cars")[0])
    assert len(catalogue) == 6
    assert all("vin" not in car and "plate" not in car for car in catalogue)
    login = get("/admin")[0]
    assert 'name="password"' in login
    assert "Ваши данные" in get("/privacy")[0]
    assert "hero-title-coral" in get("/static/hero-title-coral.css")[0]
    request = urllib.request.Request(BASE + "/api/bookings", data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
    try:
        client.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        assert error.code == 400
    else:
        raise AssertionError("Booking accepted without CSRF")
    print("PASS: live HTTPS, PostgreSQL catalogue, UI, secure session cookie, admin gate, privacy, static assets and CSRF rejection.")


if __name__ == "__main__":
    for attempt in range(4):
        try:
            check()
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3)
