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
import re

try:
    import openai
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False

# ── OpenAI Configuration ──────────────────────────────────────────────────────
# Set OPENAI_API_KEY in your environment variables or replace the default below.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

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


# ── AI Card Generation ─────────────────────────────────────────────────────────────


def _openai_client():
    """Return a configured OpenAI client, or abort 500 if unavailable."""
    if not _OPENAI_AVAILABLE:
        abort(500, description="openai package is not installed. Run: pip install openai")
    if not OPENAI_API_KEY:
        abort(500, description="OPENAI_API_KEY is not configured. Set it as an environment variable.")
    return openai.OpenAI(api_key=OPENAI_API_KEY)


def _strip_code_fences(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers from AI output."""
    text = text.strip()
    text = re.sub(r'^```[a-z]*\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    return text.strip()


def _template_card(name, age, relationship, tone):
    """Return a built-in template card when no OpenAI key is available."""
    import random
    age_str = f", turning {age}" if age else ""
    rel = relationship or "friend"

    templates = {
        "Funny": {
            "short": [
                f"Warning: {name} is now officially older! 🎉",
                f"Age is just a number, {name} — yours is just getting bigger! 😄",
                f"Happy Birthday {name}! You're not old, you're vintage! 🥂",
            ],
            "long": [
                f"Congratulations, {name}{age_str} on surviving another trip around the sun! "
                f"As your {rel}, I can confirm that you only get more fabulous with age — "
                f"like a fine cheese, or a vintage meme that never gets old. "
                f"Here's to another year of questionable decisions, great laughs, "
                f"and me being lucky enough to witness all of it. Cheers! 🎂",
            ],
        },
        "Emotional": {
            "short": [
                f"To {name}: thank you for making the world brighter. 💖",
                f"Happy Birthday {name} — here's to the person who means the world. 🌟",
                f"Every day is better with {name} in it. Happy Birthday! 💞",
            ],
            "long": [
                f"Dear {name}{age_str}, birthdays are a beautiful reminder of "
                f"how grateful we are to have you in our lives. "
                f"As your {rel}, I've had the privilege of watching you grow, "
                f"laugh, and light up every room you walk into. "
                f"Today I want you to know how deeply cherished and celebrated you are — "
                f"not just today, but every single day. Happy Birthday with all my heart. 💖",
            ],
        },
        "Professional": {
            "short": [
                f"Wishing {name} a wonderful birthday and continued success! 🎉",
                f"Happy Birthday {name} — your contributions make all the difference. 🌟",
                f"Warmest birthday wishes to {name} on this special day! 🥂",
            ],
            "long": [
                f"On behalf of everyone who has had the pleasure of working alongside you, "
                f"Happy Birthday {name}{age_str}! "
                f"Your dedication, professionalism, and positive attitude are an inspiration. "
                f"As your {rel}, I want to take this moment to recognise not just your "
                f"professional achievements, but the genuine warmth you bring to everything you do. "
                f"Wishing you a wonderful year ahead filled with well-deserved success and happiness.",
            ],
        },
        "Best Friend": {
            "short": [
                f"Happy Birthday to my absolute favourite human, {name}! 🥳",
                f"{name}!! It's your day — let's make it legendary! 🎊",
                f"To {name}: my ride-or-die, my partner in crime, HAPPY BIRTHDAY! 🎂",
            ],
            "long": [
                f"HAPPY BIRTHDAY {name.upper()}!! 🎉🎉🎉 "
                f"Okay I know I say this every year but I genuinely cannot believe "
                f"how lucky I am to call you my {rel}. "
                f"You're the person I text at 2am, the one who gets all my weird references, "
                f"and honestly the best human I know{age_str}. "
                f"Today is ALL about you — eat the cake, sleep in, and know that "
                f"I'm celebrating you with my whole heart. Love you to bits! 🥳💕",
            ],
        },
    }

    bucket = templates.get(tone, templates["Emotional"])
    return {
        "short_message": random.choice(bucket["short"]),
        "long_message":  random.choice(bucket["long"]),
    }


@app.route("/api/generate_card", methods=["POST"])
def generate_card():
    """
    POST /api/generate_card
    Body (JSON): { "name": str, "age": int|str (optional), "relationship": str, "tone": str }
    Returns: { "short_message": str, "long_message": str, "name", "age", "tone" }

    Tone options: Funny | Emotional | Professional | Best Friend
    Falls back to built-in templates when OPENAI_API_KEY is not set.
    """
    body = request.get_json(silent=True)
    if not body:
        abort(400, description="Request body must be JSON.")

    name         = (body.get("name")         or "").strip()
    age          = body.get("age", "")           # may be empty / 0
    relationship = (body.get("relationship") or "friend").strip()
    tone         = (body.get("tone")         or "Emotional").strip()

    if not name:
        abort(400, description="'name' is required.")

    # ── Fallback: use built-in templates when no API key is configured ─────────
    if not _OPENAI_AVAILABLE or not OPENAI_API_KEY:
        result = _template_card(name, age, relationship, tone)
        return jsonify({
            "short_message": result["short_message"],
            "long_message":  result["long_message"],
            "name":          name,
            "age":           age,
            "tone":          tone,
            "fallback":      True,
        }), 200

    # ── AI generation ─────────────────────────────────────────────────────────
    tone_guide = {
        "Funny":        "Use clever wordplay and lighthearted humour. Keep it witty and fun, not slapstick.",
        "Emotional":    "Express deep warmth and genuine affection. Let it feel sincere and moving without being overly dramatic.",
        "Professional": "Strike a polished, respectful tone — warm but workplace-appropriate.",
        "Best Friend":  "Write as if you've known this person for years — casual, inside-joke-friendly, bursting with fondness.",
    }.get(tone, "Express genuine warmth and care.")

    age_clause = f"who is turning {age}" if age else "who is celebrating their birthday"

    prompt = (
        f"Write a birthday message for {name} {age_clause}.\n"
        f"Relationship to sender: {relationship}\n"
        f"Tone: {tone}. {tone_guide}\n\n"
        "Return ONLY valid JSON — no markdown, no extra text — with exactly these two keys:\n"
        '{\n'
        '  "short_message": "One catchy birthday headline (max 15 words, no internal quotes)",\n'
        '  "long_message":  "A warm, detailed paragraph of 4-5 lines — make it feel personal and unique; avoid clichés like \'may all your dreams come true\'"\n'
        '}'
    )

    client = _openai_client()
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a creative birthday message writer. Respond with valid JSON only."},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.88,
            max_tokens=450,
        )
    except openai.AuthenticationError:
        abort(401, description="Invalid OpenAI API key. Check OPENAI_API_KEY environment variable.")
    except openai.RateLimitError:
        abort(429, description="OpenAI rate limit reached. Please wait a moment and try again.")
    except openai.APIError as exc:
        abort(502, description=f"OpenAI API error: {exc}")
    except Exception as exc:
        abort(500, description=f"Unexpected error calling OpenAI: {exc}")

    raw = _strip_code_fences(response.choices[0].message.content or "")
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        abort(500, description="AI returned malformed JSON. Please try again.")

    if "short_message" not in result or "long_message" not in result:
        abort(500, description="AI response is missing required fields. Please try again.")

    return jsonify({
        "short_message": result["short_message"],
        "long_message":  result["long_message"],
        "name":          name,
        "age":           age,
        "tone":          tone,
    }), 200


@app.route("/api/generate_card_image", methods=["POST"])
def generate_card_image():
    """
    POST /api/generate_card_image
    Body (JSON): { "theme": str, "tone": str }
    Returns: { "image_url": str }  — a temporary DALL-E URL (expires in ~1 hour)
             OR { "gradient": str, "fallback": true } when no API key is set.
    """
    body = request.get_json(silent=True) or {}
    theme = (body.get("theme") or "Classic").strip()
    tone  = (body.get("tone")  or "Emotional").strip()

    # Gradient fallbacks per theme — used when no DALL-E key is available
    GRADIENTS = {
        "Classic":  "linear-gradient(135deg, #fce4ec 0%, #f8bbd0 30%, #e1bee7 60%, #f3e5f5 100%)",
        "Cute":     "linear-gradient(135deg, #ffd6f5 0%, #ffb3e6 25%, #d4aaff 60%, #ffe0f7 100%)",
        "Modern":   "linear-gradient(135deg, #1a0533 0%, #2d1b69 35%, #0d47a1 70%, #1a237e 100%)",
        "Minimal":  "linear-gradient(135deg, #f5f5f5 0%, #ede7f6 50%, #e8eaf6 100%)",
    }

    # ── No API key: return a CSS gradient so the button still does something useful
    if not _OPENAI_AVAILABLE or not OPENAI_API_KEY:
        gradient = GRADIENTS.get(theme, GRADIENTS["Classic"])
        return jsonify({"gradient": gradient, "fallback": True}), 200

    theme_prompt = {
        "Classic":  "elegant birthday celebration, soft watercolour flowers, gold ribbon, cream background, timeless style",
        "Cute":     "adorable pastel birthday party, cartoon balloons, confetti, kawaii style, pink and lavender palette",
        "Modern":   "sleek modern birthday design, abstract geometric shapes, bold colours, dark background, neon accents",
        "Minimal":  "minimalist birthday card, clean white background, single delicate flower, thin elegant lines, subtle pastel accents",
    }.get(theme, "beautiful birthday celebration, colourful balloons and confetti")

    image_prompt = (
        f"Digital illustration: {theme_prompt}. "
        "No text or letters anywhere in the image. "
        "Suitable as a birthday card background. High quality, vibrant, celebratory."
    )

    client = _openai_client()
    try:
        img_response = client.images.generate(
            model="dall-e-3",
            prompt=image_prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )
        image_url = img_response.data[0].url
    except openai.AuthenticationError:
        abort(401, description="Invalid OpenAI API key.")
    except openai.RateLimitError:
        abort(429, description="OpenAI rate limit reached.")
    except openai.APIError as exc:
        abort(502, description=f"OpenAI image API error: {exc}")
    except Exception as exc:
        abort(500, description=f"Image generation failed: {exc}")

    return jsonify({"image_url": image_url}), 200


# ── Error Handlers ────────────────────────────────────────────────────────────

@app.errorhandler(400)
def bad_request(e):
    return jsonify({"error": str(e.description)}), 400


@app.errorhandler(401)
def unauthorized(e):
    return jsonify({"error": str(e.description)}), 401


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": str(e.description)}), 404


@app.errorhandler(429)
def rate_limited(e):
    return jsonify({"error": str(e.description)}), 429


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": str(e.description) if e.description else "Internal server error."}), 500


@app.errorhandler(502)
def bad_gateway(e):
    return jsonify({"error": str(e.description)}), 502


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Ensure storage files exist on first run
    if not os.path.exists(DATA_FILE):
        save_birthdays([])
    if not os.path.exists(EVENTS_FILE):
        save_events([])
    app.run(debug=True, port=5000)
