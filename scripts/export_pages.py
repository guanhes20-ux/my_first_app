"""Build a public, data-free demo for GitHub Pages."""
import json
import secrets
import shutil
import tempfile
from pathlib import Path
from cryptography.fernet import Fernet
from flask import render_template
from app import create_app, CARS

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist"

def static_links(html):
    return (html.replace('href="/#','href="./#')
        .replace('href="/"','href="./"')
        .replace('href="/privacy"','href="./privacy.html"')
        .replace('href="/admin"','href="./demo.html"')
        .replace('href="/static/','href="./static/')
        .replace('src="/static/','src="./static/'))

def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(ROOT/"static",OUT/"static")
    public_cars=[{k:v for k,v in c.items() if k not in ("plate","vin")} for c in CARS]
    (OUT/"static"/"cars.json").write_text(json.dumps(public_cars,ensure_ascii=False),encoding="utf-8")
    with tempfile.TemporaryDirectory() as folder:
        app=create_app({"TESTING":True,"SECRET_KEY":secrets.token_urlsafe(48),
            "DATA_KEY":Fernet.generate_key(),"ADMIN_PASSWORD":secrets.token_urlsafe(32),
            "DATA_DIR":folder,"DEMO_MODE":True})
        with app.test_request_context("/"):
            index=render_template("index.html",demo=True)
            index=index.replace("</head>",'<meta name="static-demo" content="true"></head>')
            banner='<div class="notice demo-banner">Учебная демонстрация: каталог и расчёт работают в браузере. <a href="./demo.html">Оформление и документы →</a></div>'
            index=index.replace("<main>","<main>"+banner,1)
            index=index.replace("Заявка ожидает заполнения 30 минут.","В демонстрации заявка не отправляется и автомобиль не резервируется.")
            index=index.replace("Следующий шаг — анкета и согласие на обработку данных.","Переход открывает бот. Для оформления нужен отдельно работающий сервер.")
            index=index.replace("Бот сохранит заявку и даст ссылку на анкету. Документы вводятся на сайте.","В полной версии бот сохраняет заявку и даёт ссылку на анкету. Для этого нужен запуск сервера.")
            privacy=render_template("message.html",title="Учебная демонстрация",
                message="На этой странице не собираются персональные данные и не создаются бронирования. Выбор дат используется только для расчёта в браузере. Переход в Telegram открывает внешний сервис с его правилами обработки данных.")
            info=render_template("message.html",title="О проекте",
                message="GitHub Pages показывает каталог автомобилей, фильтры, выбор дат и времени, расчёт стоимости и переход к Telegram-боту. Полная версия на Python включает анкету, панель менеджера, договор в двух экземплярах и Excel-отчёт. Эти функции требуют отдельного работающего сервера. Инструкции находятся в README репозитория guanhes20-ux/my_first_app. В демонстрации не вводите настоящие паспортные данные.")
    for name,content in (("index.html",index),("privacy.html",privacy),("demo.html",info)):
        (OUT/name).write_text(static_links(content),encoding="utf-8")
    (OUT/".nojekyll").touch()
    assert not list(OUT.rglob("*.sqlite*"))
    assert not list(OUT.rglob(".env"))
    print("Static demo exported to dist/ (no database or secrets).")

if __name__=="__main__":
    main()
