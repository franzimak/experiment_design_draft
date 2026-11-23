#!/usr/bin/env python3
"""
Local server for the Nova AI onboarding experiment.

Start:   python serve.py            (Windows: py serve.py)
Then:    http://localhost:8000              -> the study
         http://localhost:8000/?debug       -> with debug bar
         http://localhost:8000/?debug&cond=3 -> force condition 3

What it does
  * serves index.html, css/, js/ and content.json
  * receives each finished response (POST /api/save) and stores it as
    data/<participant_id>.json  +  one line in data/responses.csv
  * sends "no-cache" headers, so edits show up after a normal reload

Only the Python standard library is used – nothing to install.
Stop the server with Ctrl+C.
"""

import csv
import json
import re
import sys
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8000
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CSV_FILE = DATA_DIR / "responses.csv"
MAX_BODY = 200_000  # bytes – one response is only a few KB

# Columns of the summary CSV (one row per participant). The full
# record is always in the JSON file, so nothing is lost if a field
# is missing here.
CSV_COLUMNS = [
    "participant_id", "condition_id", "condition_label", "default_share", "frame", "ui",
    "forced_condition", "started_at", "finished_at",
    "decision.consent_to_share", "decision.changed_default",
    "decision.toggle_initial", "decision.toggle_final", "decision.toggle_changes",
    "decision.choice", "decision.learn_more_clicks",
    "decision.first_interaction_ms", "decision.decision_time_ms",
]


def flatten(d, prefix=""):
    """{'a': {'b': 1}} -> {'a.b': 1}; lists become ';'-joined strings."""
    out = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(flatten(v, key + "."))
        elif isinstance(v, list):
            out[key] = ";".join(map(str, v))
        else:
            out[key] = v
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # Never serve the collected data or Python files to the browser
    def send_head(self):
        path = self.path.split("?", 1)[0].lower()
        if path.startswith("/data") or path.endswith(".py"):
            self.send_error(404)
            return None
        return super().send_head()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/save":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BODY:
            self.send_error(413)
            return
        try:
            record = json.loads(self.rfile.read(length).decode("utf-8"))
            pid = str(record.get("participant_id", ""))
            if not re.fullmatch(r"[a-z0-9]{6,30}", pid):
                raise ValueError("invalid participant_id")
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_error(400, str(exc))
            return

        record["saved_at"] = datetime.now().isoformat(timespec="seconds")
        DATA_DIR.mkdir(exist_ok=True)
        (DATA_DIR / f"{pid}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")

        flat = flatten(record)
        columns = CSV_COLUMNS + sorted(k for k in flat if k.startswith(("onboarding.", "answers.")))
        new_file = not CSV_FILE.exists()
        if not new_file:
            with CSV_FILE.open(encoding="utf-8") as f:
                columns = next(csv.reader(f), columns)   # keep the existing header
        with CSV_FILE.open("a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
            if new_file:
                writer.writeheader()
            writer.writerow(flat)

        print(f"  saved {pid}  (condition {record.get('condition_id')}, "
              f"consent_to_share={record.get('decision', {}).get('consent_to_share')})")
        body = b'{"ok": true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet; saved responses are printed above


def main():
    nums = [a for a in sys.argv[1:] if a.isdigit()]
    port = int(nums[0]) if nums else PORT
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        sys.exit(f"Port {port} is already in use. Try: python serve.py {port + 1}")
    url = f"http://localhost:{port}/?debug"
    print(f"Nova study running at http://localhost:{port}")
    print(f"Debug view:            {url}")
    print(f"Responses are saved in {DATA_DIR}")
    print("Stop with Ctrl+C\n")
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
