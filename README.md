# 🎂 Birthday Reminder Calendar

A full-stack **Birthday Reminder Calendar** built with **Python Flask** (backend) and vanilla **JavaScript** (frontend). Track birthdays, add calendar events, receive browser notifications, and celebrate with a polished pastel UI that supports dark mode.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📅 Interactive Calendar | Monthly grid with prev/next navigation |
| 🎂 Birthday Management | Add, edit, delete birthdays — multiple per day |
| 🎉 Age Calculation | Automatically computes current age from birth year |
| 🔔 Browser Notifications | Native alerts for today's birthdays on page load |
| 📅 Calendar Events | Add/delete short notes to any calendar day |
| 🌅 Upcoming Panel | Birthdays in the next 7 / 14 / 30 / 60 days |
| 🔍 Search | Live search across all saved birthdays |
| 🌙 Dark Mode | Toggle with smooth transition, saved to `localStorage` |
| 📱 Responsive | Mobile-friendly layout down to 320 px |
| ✅ Validation | Client-side and server-side input validation |
| 💾 Persistent Storage | JSON file storage — no database required |

---

## 🗂 Project Structure

```
Birthday-Reminder/
│
├── app.py                  # Flask backend — all API routes
├── birthdays.json          # Birthday data (auto-created)
├── events.json             # Calendar events (auto-created)
├── requirements.txt        # Python dependencies
│
├── templates/
│   └── index.html          # Single-page HTML (Jinja2)
│
└── static/
    ├── css/
    │   └── style.css       # Full design system (light + dark)
    └── js/
        └── app.js          # Frontend modules (API, Calendar, Modal …)
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.9 or newer
- pip

### Installation

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd Birthday-Reminder

# 2. Create and activate a virtual environment (recommended)
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the development server
python app.py
```

Open **http://localhost:5000** in your browser.

---

## 🔌 API Reference

All endpoints are prefixed with `/api`.

### Birthdays

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/birthdays` | Fetch all birthdays (optional `?month=YYYY-MM` filter) |
| `POST` | `/api/birthdays` | Create a birthday `{ name, date, note? }` |
| `PUT` | `/api/birthdays/<id>` | Update a birthday by id |
| `DELETE` | `/api/birthdays/<id>` | Delete a birthday by id |
| `GET` | `/api/upcoming` | Upcoming birthdays (optional `?days=30`) |

### Calendar Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/events` | Fetch events (optional `?date=YYYY-MM-DD` filter) |
| `POST` | `/api/events` | Create an event `{ title, date }` |
| `DELETE` | `/api/events/<id>` | Delete an event by id |

#### Example — Add a Birthday

```bash
curl -X POST http://localhost:5000/api/birthdays \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "date": "1995-03-15", "note": "Loves chocolate cake"}'
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3, Flask 3, Flask-CORS |
| Storage | JSON flat-file (no database) |
| Frontend | Vanilla JavaScript (ES2022, modules pattern) |
| Styling | Pure CSS — custom properties, CSS Grid, Flexbox |
| Fonts | Google Fonts — Inter |

---

## 📱 Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| > 820 px | Two-column (calendar + sidebar) |
| ≤ 820 px | Single-column (sidebar stacks above calendar) |
| ≤ 480 px | Compact mobile — full-width buttons, smaller font |

---

## 🌙 Dark Mode

The theme toggle (🌙 / ☀️) in the header switches between light and dark palettes. The user's preference is saved to `localStorage` under the key `bd-theme`. On first visit the system preference (`prefers-color-scheme`) is used automatically.

---

## 🔔 Browser Notifications

On page load the app requests notification permission once. If granted, it fires a native browser notification for every birthday whose **month and day** match today's date. Birth year doesn't need to match — birthdays recur annually.

> **Note:** The Notification API requires a secure context (HTTPS or `localhost`). Notifications will not fire on plain HTTP remote URLs.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push and open a Pull Request

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
