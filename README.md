# BG Remover

A Flask app that removes photo backgrounds using the remove.bg API.

## Run it

```
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000

## First time

1. Open **Settings**, paste your remove.bg API key, and press **Save settings**.
   The key is saved in `settings.json` and stays after restart.
2. Go back to the tool, choose a photo, and it is cut out automatically
   (or turn off **Remove automatically on upload** and press the button yourself).
3. Pick a background color or keep it transparent, then **Download PNG**.

## Files

- `app.py` - server, remove.bg proxy, settings save/import/export
- `templates/` - pages
- `static/style.css` - styling
- `static/app.js` - upload, preview, background color, download
- `settings.json` - created on first save; holds your key, so keep it private
