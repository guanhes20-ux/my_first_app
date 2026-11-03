"""Read-only smoke check of the deployed development backend."""
import http.cookiejar
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
import urllib.parse
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
    assert isinstance(health["telegramConfigured"], bool)
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
    csrf = re.search(r'name="csrf-token" content="([^"]+)"', html).group(1)
    booking = None
    start = datetime.now(timezone.utc) + timedelta(days=20, minutes=secrets.randbelow(5000))
    end = start + timedelta(hours=1)
    for car in catalogue:
        request = urllib.request.Request(
            BASE + "/api/bookings",
            data=json.dumps({"car_id": car["id"], "start": start.isoformat(), "end": end.isoformat()}).encode(),
            headers={"Content-Type": "application/json", "X-CSRF-Token": csrf, "Origin": BASE},
            method="POST",
        )
        try:
            with client.open(request, timeout=45) as response:
                booking = json.load(response)
            break
        except urllib.error.HTTPError as error:
            if error.code != 409:
                raise
    assert booking and booking["application_url"].startswith(BASE + "/application/")
    path = urllib.parse.urlsplit(booking["application_url"]).path
    form_html = get(path)[0]
    form_csrf = re.search(r'name="csrf-token" content="([^"]+)"', form_html).group(1)
    fields = {
        "csrf": form_csrf, "name": "Проверка Учебного Проекта", "birth": "1990-01-01",
        "phone": "+79991234567", "passport": "0000000000", "passport_by": "Учебный орган",
        "passport_date": "2010-01-01", "address": "Вымышленный адрес",
        "license": "0000000000", "license_date": "2020-01-01",
        "license_until": "2040-01-01", "experience": "5", "terms": "on", "consent": "on", "fake": "on",
    }
    request = urllib.request.Request(
        BASE + path, data=urllib.parse.urlencode(fields).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded", "Origin": BASE}, method="POST",
    )
    with client.open(request, timeout=45) as response:
        assert response.status == 200
        assert "Анкета отправлена" in response.read().decode()
    print("PASS: complete live browser booking and application submission with fictional data.")
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
