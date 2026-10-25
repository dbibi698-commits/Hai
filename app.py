"""BG Remover: a small Flask app that removes photo backgrounds with remove.bg."""
import json
import os
from pathlib import Path

import requests
from flask import (Flask, Response, flash, jsonify, redirect, render_template,
                   request, url_for)

BASE_DIR = Path(__file__).resolve().parent
SETTINGS_FILE = BASE_DIR / "settings.json"
REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
DEFAULT_SETTINGS = {"api_key": "", "auto_remove": True}
FRIENDLY_ERRORS = {
    401: "remove.bg did not accept the key. Check it in Settings.",
    402: "Your remove.bg credits are used up. Top up or use another key.",
    403: "The API key was rejected. Check it in Settings.",
    429: "Too many requests right now. Wait a moment and try again.",
}

app = Flask(__name__)
app.secret_key = os.environ.get("BG_REMOVER_SECRET", "change-me-locally")
app.config["MAX_CONTENT_LENGTH"] = 15 * 1024 * 1024


# ---------- settings: saved permanently in settings.json ----------

def load_settings():
    settings = dict(DEFAULT_SETTINGS)
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return settings
    if isinstance(data, dict):
        for key, default in DEFAULT_SETTINGS.items():
            if isinstance(data.get(key), type(default)):
                settings[key] = data[key]
    return settings


def save_settings(settings):
    tmp = SETTINGS_FILE.parent / (SETTINGS_FILE.name + ".tmp")
    tmp.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    tmp.replace(SETTINGS_FILE)  # swap in one step so a crash never leaves a broken file


def mask_key(key):
    return ("•" * 6 + key[-4:]) if key else ""


def explain_error(resp):
    if resp.status_code in FRIENDLY_ERRORS:
        return FRIENDLY_ERRORS[resp.status_code]
    try:
        return resp.json()["errors"][0]["title"]
    except (ValueError, KeyError, IndexError, TypeError):
        return f"remove.bg returned an error ({resp.status_code})."


# ---------- pages ----------

@app.get("/")
def index():
    settings = load_settings()
    return render_template(
        "index.html",
        auto_remove=settings["auto_remove"],
        has_key=bool(settings["api_key"]),
    )


@app.route("/settings", methods=["GET", "POST"])
def settings_page():
    settings = load_settings()
    if request.method == "POST":
        new_key = request.form.get("api_key", "").strip()
        if new_key:
            settings["api_key"] = new_key
            flash("New API key saved.", "ok")
        elif request.form.get("clear_key"):
            settings["api_key"] = ""
            flash("Saved API key removed.", "ok")
        else:
            flash("Settings saved.", "ok")
        save_settings(settings)
        return redirect(url_for("settings_page"))
    return render_template("settings.html", masked_key=mask_key(settings["api_key"]))


@app.get("/settings/export")
def export_settings():
    body = json.dumps(load_settings(), indent=2)
    return Response(
        body,
        mimetype="application/json",
        headers={"Content-Disposition": "attachment; filename=bg-remover-settings.json"},
    )


@app.post("/settings/import")
def import_settings():
    upload = request.files.get("settings_file")
    if not upload:
        flash("Choose a settings file first.", "error")
        return redirect(url_for("settings_page"))
    try:
        data = json.loads(upload.read().decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("not a settings object")
    except ValueError:
        flash("That file is not a valid settings file.", "error")
        return redirect(url_for("settings_page"))

    settings = load_settings()
    if isinstance(data.get("api_key"), str):
        settings["api_key"] = data["api_key"].strip()
    if isinstance(data.get("auto_remove"), bool):
        settings["auto_remove"] = data["auto_remove"]
    save_settings(settings)
    flash("Settings imported.", "ok")
    return redirect(url_for("settings_page"))


# ---------- api ----------

@app.post("/api/preferences")
def save_preferences():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    settings = load_settings()
    if isinstance(data.get("auto_remove"), bool):
        settings["auto_remove"] = data["auto_remove"]
        save_settings(settings)
    return jsonify(auto_remove=settings["auto_remove"])


@app.post("/api/remove")
def remove_background():
    api_key = load_settings()["api_key"]
    if not api_key:
        return jsonify(error="No API key yet. Add your remove.bg key in Settings first."), 400

    upload = request.files.get("image")
    if upload is None or not upload.filename:
        return jsonify(error="Choose a photo first."), 400
    if Path(upload.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        return jsonify(error="Use a JPG, PNG or WEBP photo."), 400

    try:
        resp = requests.post(
            REMOVE_BG_URL,
            headers={"X-Api-Key": api_key},
            files={"image_file": (
                upload.filename,
                upload.read(),
                upload.mimetype or "application/octet-stream",
            )},
            data={"size": "auto"},
            timeout=60,
        )
    except requests.RequestException:
        return jsonify(error="Could not reach remove.bg. Check your internet connection."), 502

    if resp.status_code == 200:
        return Response(resp.content, mimetype="image/png")

    status = resp.status_code if resp.status_code < 500 else 502
    return jsonify(error=explain_error(resp)), status


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
