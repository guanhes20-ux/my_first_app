"""Telegram carries only an opaque booking reference and link, never document fields."""
import os, time, logging
from datetime import timedelta
import requests
from app import create_app, now
import secrets

def handle(app, message, send):
    uid = message.get("from",{}).get("id")
    chat = message.get("chat",{})
    if chat.get("type") != "private" or chat.get("id") != uid or not uid:
        return
    text = message.get("text","").strip()
    db = app.extensions["rental_db"]
    if text.startswith("/start "):
        ident = text.split(maxsplit=1)[1]
        with db() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT * FROM bookings WHERE id=? AND status='hold' AND expires > ?",(ident,now().isoformat())).fetchone()
            if not row or row["telegram_id"] not in (None, uid):
                send(uid,"Заявка недоступна или время оформления истекло. Выберите автомобиль на сайте.")
                return
            token = secrets.token_urlsafe(32)
            conn.execute("UPDATE bookings SET telegram_id=?,form_token=?,form_expires=? WHERE id=?",
                (uid,token,min(row["expires"],(now()+timedelta(minutes=20)).isoformat()),ident))
        send(uid,"Автомобиль и даты сохранены на 30 минут с момента выбора. Заполните анкету на сайте; не отправляйте паспорт и права в этот чат. Для проверки: /status. Для отмены незавершённых заявок: /cancel. Для удаления неподтверждённых заявок: /delete.",
            {"inline_keyboard":[[{"text":"Заполнить защищённую анкету","url":app.config["PUBLIC_URL"]+"/application/"+token}]]})
    elif text == "/status":
        with db() as conn:
            conn.execute("UPDATE bookings SET status='expired',form_token=NULL WHERE status='hold' AND expires < ?",(now().isoformat(),))
            rows = conn.execute("SELECT id,status FROM bookings WHERE telegram_id=? ORDER BY created DESC LIMIT 5",(uid,)).fetchall()
        labels = {"hold":"ожидает анкету","submitted":"на проверке","confirmed":"подтверждена менеджером","cancelled":"отменена","expired":"время оформления истекло"}
        send(uid,"\n".join(f"{r['id'][:10]}: {labels.get(r['status'],r['status'])}" for r in rows) or "У вас пока нет заявок.")
    elif text == "/cancel":
        with db() as conn:
            conn.execute("UPDATE bookings SET status='cancelled',form_token=NULL WHERE telegram_id=? AND status IN ('hold','submitted')",(uid,))
        send(uid,"Незавершённые заявки отменены. Для отмены подтверждённой аренды свяжитесь с арендодателем.")
    elif text == "/delete":
        with db() as conn:
            conn.execute("DELETE FROM bookings WHERE telegram_id=? AND status != 'confirmed'",(uid,))
        send(uid,"Неподтверждённые заявки удалены из базы проекта. По данным подтверждённого договора обратитесь к оператору: применимые сроки хранения могут требовать сохранения. Сообщения в Telegram удаляются отдельно средствами Telegram.")
    else:
        send(uid,"Выберите автомобиль и даты на сайте, затем нажмите «Продолжить в Telegram». Команды: /status, /cancel, /delete. Не отправляйте документы в чат.")

def main():
    app = create_app()
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN after rotating it with BotFather")
    if not app.config["PUBLIC_URL"].startswith("https://"):
        raise SystemExit("Telegram requires a publicly accessible HTTPS PUBLIC_URL for the application link")
    db = app.extensions["rental_db"]
    api = "https://api.telegram.org/bot"+token+"/"
    logging.getLogger("urllib3").setLevel(logging.CRITICAL)
    def call(method,payload):
        response = requests.post(api+method,json=payload,timeout=40)
        response.raise_for_status()
        result = response.json()
        if not result.get("ok"):
            raise RuntimeError("Telegram API operation failed")
        return result["result"]
    def send(uid,text,markup=None):
        payload = {"chat_id":uid,"text":text}
        if markup:
            payload["reply_markup"] = markup
        call("sendMessage",payload)
    while True:
        try:
            with db() as conn:
                row = conn.execute("SELECT value FROM bot_state WHERE key='offset'").fetchone()
            offset = int(row["value"]) if row else 0
            for update in call("getUpdates",{"offset":offset,"timeout":25,"allowed_updates":["message"]}):
                handle(app,update.get("message",{}),send)
                with db() as conn:
                    conn.execute("INSERT OR REPLACE INTO bot_state VALUES ('offset',?)",(str(update["update_id"]+1),))
        except (requests.RequestException, RuntimeError, ValueError):
            # Never log exception strings: Telegram API URLs contain the bot token.
            print("Telegram connection failed; retrying.",flush=True)
            time.sleep(5)

if __name__ == "__main__":
    main()
