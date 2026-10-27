import json
from pathlib import Path
from scripts.export_pages import main, OUT

def test_public_export_has_relative_assets_and_no_private_data():
    main()
    html=(OUT/"index.html").read_text(encoding="utf-8")
    assert 'name="static-demo"' in html
    assert 'href="./static/style.css"' in html
    assert 'src="./static/app.js"' in html
    assert 'href="/' not in html
    assert 'src="/' not in html
    assert "{{" not in html and "{%" not in html
    cars=json.loads((OUT/"static/cars.json").read_text())
    assert len(cars)==6
    assert all("vin" not in car and "plate" not in car for car in cars)
    assert not list(OUT.rglob("*.sqlite*"))
    assert not list(OUT.rglob(".env"))
    assert (OUT/"demo.html").exists() and (OUT/"privacy.html").exists()
