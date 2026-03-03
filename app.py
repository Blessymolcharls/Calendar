"""
Birthday Reminder Web App - Flask Backend
==========================================
Handles all API routes for CRUD operations on birthday data.
Data is persisted in birthdays.json (JSON file storage).
"""

from flask import Flask, jsonify, request, render_template, abort
from flask_cors import CORS
import json
import os
import uuid
from datetime import datetime

# ── App Setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the frontend

# Path to JSON storage files (same directory as app.py)
DATA_FILE   = os.path.join(os.path.dirname(__file__), "birthdays.json")
EVENTS_FILE = os.path.join(os.path.dirname(__file__), "events.json")


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_birthdays() -> list:
    """Load all birthdays from the JSON file.
    Returns an empty list if the file doesn't exist or is empty."""
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def save_birthdays(data: list) -> None:
    """Persist the birthday list to the JSON file."""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_events() -> list:
    """Load all events from the JSON file."""
    if not os.path.exists(EVENTS_FILE):
        return []
    with open(EVENTS_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def save_events(data: list) -> None:
    """Persist the events list to the JSON file."""
    with open(EVENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def find_birthday(birthdays: list, birthday_id: str) -> dict | None:
    """Return the birthday dict matching the given id, or None."""
    return next((b for b in birthdays if b["id"] == birthday_id), None)


def validate_date(date_str: str) -> bool:
    """Validate that date_str is a valid YYYY-MM-DD date."""
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the main HTML page."""
    return render_template("index.html")


@app.route("/api/birthdays", methods=["GET"])
def get_birthdays():
    """
    GET /api/birthdays
    Returns all stored birthdays as a JSON array.
    Optional query param: ?month=YYYY-MM  → filter by year-month
    """
    birthdays = load_birthdays()
    month_filter = request.args.get("month")  # e.g. "2026-03"

    if month_filter:
        birthdays = [b for b in birthdays if b["date"].startswith(month_filter)]

    # Sort by date ascending
    birthdays.sort(key=lambda b: b["date"])
    return jsonify(birthdays), 200


@app.route("/api/birthdays", methods=["POST"])
def add_birthday():
    """
    POST /api/birthdays
    Body (JSON): { "name": str, "date": "YYYY-MM-DD", "note": str (optional) }
    Returns the newly created birthday object with a generated id.
    """
    body = request.get_json(silent=True)
    if not body:
        abort(400, description="Request body must be JSON.")

    name = (body.get("name") or "").strip()
    date = (body.get("date") or "").strip()
    note = (body.get("note") or "").strip()

    # ── Validation ────────────────────────────────────────────────────────────
    if not name:
        abort(400, description="'name' is required.")
    if not date or not validate_date(date):
        abort(400, description="'date' must be a valid YYYY-MM-DD string.")

    new_birthday = {
        "id":        str(uuid.uuid4()),   # Unique identifier
        "name":      name,
        "date":      date,                # Stored in ISO format: YYYY-MM-DD
        "note":      note,
        "created_at": datetime.utcnow().isoformat() + "Z"
    }

    birthdays = load_birthdays()
    birthdays.append(new_birthday)
    save_birthdays(birthdays)

    return jsonify(new_birthday), 201


@app.route("/api/birthdays/<string:birthday_id>", methods=["PUT"])
def update_birthday(birthday_id: str):
    """
    PUT /api/birthdays/<id>
    Body (JSON): { "name": str, "date": "YYYY-MM-DD", "note": str }
    Returns the updated birthday object.
    """
    body = request.get_json(silent=True)
    if not body:
        abort(400, description="Request body must be JSON.")

    birthdays = load_birthdays()
    birthday = find_birthday(birthdays, birthday_id)

    if birthday is None:
        abort(404, description="Birthday not found.")

    # Update only provided fields
    name = (body.get("name") or birthday["name"]).strip()
    date = (body.get("date") or birthday["date"]).strip()
    note = (body.get("note") if "note" in body else birthday.get("note", ""))
    note = (note or "").strip()

    if not name:
        abort(400, description="'name' cannot be empty.")
    if not validate_date(date):
        abort(400, description="'date' must be a valid YYYY-MM-DD string.")

    birthday["name"] = name
    birthday["date"] = date
    birthday["note"] = note
    birthday["updated_at"] = datetime.utcnow().isoformat() + "Z"

    save_birthdays(birthdays)
    return jsonify(birthday), 200


@app.route("/api/birthdays/<string:birthday_id>", methods=["DELETE"])
def delete_birthday(birthday_id: str):
    """
    DELETE /api/birthdays/<id>
    Removes the birthday with the given id.
    Returns { "message": "Deleted" } on success.
    """
    birthdays = load_birthdays()
    birthday = find_birthday(birthdays, birthday_id)

    if birthday is None:
        abort(404, description="Birthday not found.")

    birthdays = [b for b in birthdays if b["id"] != birthday_id]
    save_birthdays(birthdays)
    return jsonify({"message": "Deleted", "id": birthday_id}), 200


@app.route("/api/upcoming", methods=["GET"])
def get_upcoming():
    """
    GET /api/upcoming?days=<n>
    Returns birthdays whose month-day falls within the next <n> days (default 30).
    Year is ignored — treats every birthday as recurring annually.
    """
    try:
        days_ahead = int(request.args.get("days", 30))
    except ValueError:
        days_ahead = 30

    today = datetime.today()
    birthdays = load_birthdays()
    upcoming = []

    for b in birthdays:
        try:
            bd = datetime.strptime(b["date"], "%Y-%m-%d")
        except ValueError:
            continue

        # Substitute this year (or next) to calculate days until birthday
        this_year_bd = bd.replace(year=today.year)
        if this_year_bd < today.replace(hour=0, minute=0, second=0, microsecond=0):
            this_year_bd = bd.replace(year=today.year + 1)

        delta = (this_year_bd - today.replace(hour=0, minute=0, second=0, microsecond=0)).days

        if 0 <= delta <= days_ahead:
            upcoming.append({
                **b,
                "days_until": delta,
                "turns_age": this_year_bd.year - bd.year
            })

    # Sort by soonest first
    upcoming.sort(key=lambda x: x["days_until"])
    return jsonify(upcoming), 200


@app.route("/api/events", methods=["GET"])
def get_events():
    """
    GET /api/events
    Optional query param: ?date=YYYY-MM-DD  → filter by exact date
    """
    events = load_events()
    date_filter = request.args.get("date")
    if date_filter:
        events = [e for e in events if e["date"] == date_filter]
    events.sort(key=lambda e: e["date"])
    return jsonify(events), 200


@app.route("/api/events", methods=["POST"])
def add_event():
    """
    POST /api/events
    Body (JSON): { "title": str, "date": "YYYY-MM-DD" }
    Returns the newly created event object.
    """
    body = request.get_json(silent=True)
    if not body:
        abort(400, description="Request body must be JSON.")

    title = (body.get("title") or "").strip()
    date  = (body.get("date")  or "").strip()

    if not title:
        abort(400, description="'title' is required.")
    if not date or not validate_date(date):
        abort(400, description="'date' must be a valid YYYY-MM-DD string.")

    new_event = {
        "id":         str(uuid.uuid4()),
        "title":      title,
        "date":       date,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }

    events = load_events()
    events.append(new_event)
    save_events(events)
    return jsonify(new_event), 201


@app.route("/api/events/<string:event_id>", methods=["DELETE"])
def delete_event(event_id: str):
    """
    DELETE /api/events/<id>
    Removes the event with the given id.
    """
    events = load_events()
    event  = next((e for e in events if e["id"] == event_id), None)
    if event is None:
        abort(404, description="Event not found.")
    events = [e for e in events if e["id"] != event_id]
    save_events(events)
    return jsonify({"message": "Deleted", "id": event_id}), 200


# ── Error Handlers ────────────────────────────────────────────────────────────

@app.errorhandler(400)
def bad_request(e):
    return jsonify({"error": str(e.description)}), 400


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": str(e.description)}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error."}), 500


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Ensure storage files exist on first run
    if not os.path.exists(DATA_FILE):
        save_birthdays([])
    if not os.path.exists(EVENTS_FILE):
        save_events([])
    app.run(debug=True, port=5000)
