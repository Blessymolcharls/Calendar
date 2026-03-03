/**
 * Birthday Reminder — Frontend Application
 * ==========================================
 * Modules:
 *   API      – all fetch calls to the Flask backend
 *   State    – centralised state management
 *   Calendar – renders the month grid
 *   Upcoming – renders the upcoming birthdays sidebar
 *   List     – renders the all-birthdays list
 *   Modal    – controls add/edit/day-detail modals
 *   Toast    – transient notification pop-up
 *   Theme    – dark / light mode toggle
 *   App      – boot & event wiring
 */

"use strict";

/* ══════════════════════════════════════════════════════════════
   1.  API MODULE
   All HTTP calls to the Flask backend.
══════════════════════════════════════════════════════════════ */
const API = (() => {
  const BASE = "/api";

  /**
   * Internal helper — shared fetch wrapper with JSON response.
   * Throws an Error with the server's message on non-2xx responses.
   */
  async function request(path, options = {}) {
    const response = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  return {
    /** Fetch all birthdays (optionally filtered by month "YYYY-MM") */
    fetchAll: (month = "") =>
      request(`/birthdays${month ? `?month=${month}` : ""}`),

    /** Fetch upcoming birthdays within `days` days */
    fetchUpcoming: (days = 30) =>
      request(`/upcoming?days=${days}`),

    /** Add a new birthday — body: { name, date, note } */
    addBirthday: (body) =>
      request("/birthdays", { method: "POST", body: JSON.stringify(body) }),

    /** Update an existing birthday by id */
    updateBirthday: (id, body) =>
      request(`/birthdays/${id}`, { method: "PUT", body: JSON.stringify(body) }),

    /** Delete a birthday by id */
    deleteBirthday: (id) =>
      request(`/birthdays/${id}`, { method: "DELETE" }),

    /** Fetch events for a specific date "YYYY-MM-DD" */
    fetchEvents: (date) =>
      request(`/events?date=${date}`),

    /** Add a new event — body: { title, date } */
    addEvent: (body) =>
      request("/events", { method: "POST", body: JSON.stringify(body) }),

    /** Delete an event by id */
    deleteEvent: (id) =>
      request(`/events/${id}`, { method: "DELETE" }),

    /** Generate AI birthday card messages — body: { name, age, relationship, tone } */
    generateCard: (body) =>
      request("/generate_card", { method: "POST", body: JSON.stringify(body) }),

    /** Generate AI background image — body: { theme, tone } */
    generateCardImage: (body) =>
      request("/generate_card_image", { method: "POST", body: JSON.stringify(body) }),
  };
})();


/* ══════════════════════════════════════════════════════════════
   2.  STATE MODULE
   Single source of truth for the app's runtime data.
══════════════════════════════════════════════════════════════ */
const State = (() => {
  const _state = {
    birthdays:  [],          // Array<{id, name, date, note, ...}>
    upcoming:   [],          // Array<{...birthday, days_until, turns_age}>
    currentYear:  new Date().getFullYear(),
    currentMonth: new Date().getMonth(),  // 0-indexed
    searchQuery:  "",
    upcomingDays: 30,
  };

  return {
    get: (key)        => _state[key],
    set: (key, value) => { _state[key] = value; },

    /** Returns today's ISO date string "YYYY-MM-DD" */
    todayISO: () => new Date().toISOString().split("T")[0],

    /** Returns birthdays matching the current search query */
    filteredBirthdays() {
      const q = _state.searchQuery.toLowerCase();
      if (!q) return _state.birthdays;
      return _state.birthdays.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.note || "").toLowerCase().includes(q) ||
          b.date.includes(q)
      );
    },

    /** Returns a Set of "YYYY-MM-DD" strings for the current month */
    birthdayDatesThisMonth() {
      const mm = String(_state.currentMonth + 1).padStart(2, "0");
      const prefix = `${_state.currentYear}-${mm}`;
      return new Set(
        _state.birthdays
          .filter((b) => b.date.startsWith(prefix))
          .map((b) => b.date)
      );
    },

    /** Map from "YYYY-MM-DD" → Array<birthday> for quick lookup */
    birthdaysByDate() {
      const map = {};
      for (const b of _state.birthdays) {
        if (!map[b.date]) map[b.date] = [];
        map[b.date].push(b);
      }
      return map;
    },
  };
})();


/* ══════════════════════════════════════════════════════════════
   3.  CALENDAR MODULE
   Renders the interactive monthly grid.
══════════════════════════════════════════════════════════════ */
const Calendar = (() => {
  const grid  = document.getElementById("calendarGrid");
  const label = document.getElementById("monthYearLabel");

  /** Re-draw the entire calendar for State.currentYear / State.currentMonth */
  function render() {
    grid.innerHTML = "";  // clear previous cells

    const year  = State.get("currentYear");
    const month = State.get("currentMonth");
    const today = State.todayISO();

    // Month/Year heading
    const heading = new Date(year, month, 1).toLocaleString("default", {
      month: "long", year: "numeric",
    });
    label.textContent = heading;

    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth    = new Date(year, month + 1, 0).getDate();
    const bdMap          = State.birthdaysByDate();

    // Leading empty cells (offset from Sunday)
    for (let i = 0; i < firstDayOfWeek; i++) {
      const blank = document.createElement("div");
      blank.classList.add("cal-day", "empty");
      blank.setAttribute("aria-hidden", "true");
      grid.appendChild(blank);
    }

    // One cell per day
    for (let d = 1; d <= daysInMonth; d++) {
      const mm    = String(month + 1).padStart(2, "0");
      const dd    = String(d).padStart(2, "0");
      const iso   = `${year}-${mm}-${dd}`;
      const cell  = document.createElement("div");
      const bds   = bdMap[iso] || [];

      cell.classList.add("cal-day");
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-label", `${d} ${heading}${bds.length ? `, ${bds.length} birthday(s)` : ""}`);
      cell.dataset.date = iso;
      cell.textContent  = d;

      // Special classes
      if (iso === today)      cell.classList.add("today");
      if (bds.length > 0)     cell.classList.add("has-birthday");

      // Birthday name chips  (up to 2 names; then "+N more")
      if (bds.length > 0) {
        const chipsWrap = document.createElement("div");
        chipsWrap.classList.add("event-chips");
        const MAX = 2;
        bds.slice(0, MAX).forEach((bd) => {
          const chip = document.createElement("span");
          chip.classList.add("event-chip", "bd-chip");
          chip.textContent = "\uD83C\uDF82 " + bd.name;
          chipsWrap.appendChild(chip);
        });
        if (bds.length > MAX) {
          const more = document.createElement("span");
          more.classList.add("chip-more");
          more.textContent = `+${bds.length - MAX} more`;
          chipsWrap.appendChild(more);
        }
        cell.appendChild(chipsWrap);
      }

      // Click → open day-detail modal
      cell.addEventListener("click", () => Modal.openDayModal(iso, bds));
      // Keyboard: Enter / Space → same as click
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          Modal.openDayModal(iso, bds);
        }
      });

      grid.appendChild(cell);
    }
  }

  /** Navigate months */
  function prevMonth() {
    let m = State.get("currentMonth") - 1;
    let y = State.get("currentYear");
    if (m < 0) { m = 11; y--; }
    State.set("currentMonth", m);
    State.set("currentYear",  y);
    render();
  }

  function nextMonth() {
    let m = State.get("currentMonth") + 1;
    let y = State.get("currentYear");
    if (m > 11) { m = 0; y++; }
    State.set("currentMonth", m);
    State.set("currentYear",  y);
    render();
  }

  return { render, prevMonth, nextMonth };
})();


/* ══════════════════════════════════════════════════════════════
   4.  UPCOMING MODULE
   Renders the "Upcoming Birthdays" sidebar panel.
══════════════════════════════════════════════════════════════ */
const Upcoming = (() => {
  const list  = document.getElementById("upcomingList");
  const badge = document.getElementById("upcomingBadge");

  function render() {
    const items = State.get("upcoming");
    badge.textContent = items.length;
    list.innerHTML = "";

    if (!items.length) {
      list.innerHTML = `<li class="no-birthdays-msg">None in the next ${State.get("upcomingDays")} days.</li>`;
      return;
    }

    for (const bd of items) {
      const initial = bd.name.charAt(0).toUpperCase();
      const isToday = bd.days_until === 0;

      const li = document.createElement("li");
      li.classList.add("upcoming-item");
      li.innerHTML = `
        <div class="upcoming-avatar">${initial}</div>
        <div class="upcoming-info">
          <div class="upcoming-name">${escHtml(bd.name)}</div>
          <div class="upcoming-meta">${formatDisplayDate(bd.date)} · turns ${bd.turns_age}</div>
        </div>
        <div class="upcoming-days ${isToday ? "today-bd" : ""}">
          ${isToday ? "🎉 Today!" : `In ${bd.days_until}d`}
        </div>
      `;
      list.appendChild(li);
    }
  }

  return { render };
})();


/* ══════════════════════════════════════════════════════════════
   5.  LIST MODULE
   Renders the "All Birthdays" scrollable list with search.
══════════════════════════════════════════════════════════════ */
const BirthdayList = (() => {
  const list     = document.getElementById("birthdayList");
  const emptyMsg = document.getElementById("emptyMsg");

  function render() {
    list.innerHTML = "";
    const items = State.filteredBirthdays();

    if (!items.length) {
      emptyMsg.hidden = false;
      return;
    }
    emptyMsg.hidden = true;

    // Sort alphabetically by name
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

    for (const bd of sorted) {
      const initial = bd.name.charAt(0).toUpperCase();
      const li = document.createElement("li");
      li.classList.add("bd-item");
      li.dataset.id = bd.id;
      const birthYear = parseInt(bd.date.split("-")[0], 10);
      const age = birthYear >= 1900 ? new Date().getFullYear() - birthYear : null;
      const ageStr = age !== null ? ` <span class="age-badge">${age} yrs</span>` : "";
      li.innerHTML = `
        <div class="bd-avatar">${initial}</div>
        <div class="bd-info">
          <div class="bd-name">${escHtml(bd.name)}${ageStr}</div>
          <div class="bd-date">📅 ${formatDisplayDate(bd.date)}</div>
          ${bd.note ? `<div class="bd-note">📝 ${escHtml(bd.note)}</div>` : ""}
        </div>
        <div class="bd-actions">
          <button class="btn-card"   title="Generate AI Card" data-id="${bd.id}">🎂</button>
          <button class="btn-edit"   title="Edit"             data-id="${bd.id}">✏️</button>
          <button class="btn-delete" title="Delete"           data-id="${bd.id}">🗑️</button>
        </div>
      `;
      list.appendChild(li);
    }

    // Delegate card / edit / delete button clicks
    list.querySelectorAll(".btn-card").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        const bd = State.get("birthdays").find((b) => b.id === id);
        if (bd) CardGenerator.open(bd);
      })
    );
    list.querySelectorAll(".btn-edit").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        const bd = State.get("birthdays").find((b) => b.id === id);
        if (bd) Modal.openEditModal(bd);
      })
    );
    list.querySelectorAll(".btn-delete").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        App.deleteBirthday(id);
      })
    );
  }

  return { render };
})();


/* ══════════════════════════════════════════════════════════════
   6.  MODAL MODULE
   Controls the Add/Edit modal and the Day-Detail modal.
══════════════════════════════════════════════════════════════ */
const Modal = (() => {
  // ── Birthday Form Modal ────────────────────────────────────────────────────
  const bdModal   = document.getElementById("birthdayModal");
  const bdForm    = document.getElementById("birthdayForm");
  const bdTitle   = document.getElementById("modalTitle");
  const bdIdInput = document.getElementById("birthdayId");
  const nameInput = document.getElementById("bdName");
  const dateInput = document.getElementById("bdDate");
  const noteInput = document.getElementById("bdNote");
  const nameErr   = document.getElementById("nameError");
  const dateErr   = document.getElementById("dateError");

  // ── Day Detail Modal ───────────────────────────────────────────────────────
  const dayModal   = document.getElementById("dayModal");
  const dayTitle   = document.getElementById("dayModalTitle");
  const dayList    = document.getElementById("dayBirthdayList");
  const addOnDay   = document.getElementById("addOnDayBtn");

  // Tracks which ISO date was clicked (for "Add on this day" shortcut)
  let _selectedDate = null;

  // ── Open helpers ───────────────────────────────────────────────────────────

  /** Open modal in Add mode, optionally pre-filling a date */
  function openAddModal(date = "") {
    bdTitle.textContent    = "Add Birthday";
    bdIdInput.value        = "";
    bdForm.reset();
    clearErrors();
    if (date) dateInput.value = date;
    bdModal.hidden = false;
    nameInput.focus();
  }

  /** Open modal in Edit mode, pre-filling existing data */
  function openEditModal(bd) {
    bdTitle.textContent    = "Edit Birthday";
    bdIdInput.value        = bd.id;
    nameInput.value        = bd.name;
    dateInput.value        = bd.date;  // YYYY-MM-DD works natively with <input type="date">
    noteInput.value        = bd.note || "";
    clearErrors();
    bdModal.hidden = false;
    nameInput.focus();
  }

  /** Return age a person turns this year, or null if birth year is unknown */
  function _calcAge(dateISO) {
    const yr = parseInt((dateISO || "").split("-")[0], 10);
    if (!yr || yr < 1900) return null;
    return new Date().getFullYear() - yr;
  }

  /** Open day-detail modal for a given ISO date and its birthday list */
  async function openDayModal(iso, bds) {
    _selectedDate = iso;
    const isToday = iso === State.todayISO();
    dayTitle.textContent = `${isToday ? "🎉 Today — " : ""}${formatDisplayDate(iso)}`;
    dayList.innerHTML = "";

    if (!bds.length) {
      dayList.innerHTML = `<p class="no-birthdays-msg">No birthdays on this day.</p>`;
    } else {
      for (const bd of bds) {
        const age = _calcAge(bd.date);
        const ageLabel = age !== null
          ? (isToday
              ? ` <span class="age-badge today-age">Turns ${age}! 🎉</span>`
              : ` <span class="age-badge">Age ${age}</span>`)
          : "";
        const div = document.createElement("div");
        div.classList.add("day-bd-item");
        div.innerHTML = `
          <div class="bd-avatar" style="width:36px;height:36px;font-size:0.85rem;flex-shrink:0">${bd.name.charAt(0).toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div class="day-bd-name">${escHtml(bd.name)}${ageLabel}</div>
            ${bd.note ? `<div class="day-bd-note">📝 ${escHtml(bd.note)}</div>` : ""}
          </div>
          <div class="bd-actions">
            <button class="btn-card"   title="Generate AI Card" data-id="${bd.id}">🎂</button>
            <button class="btn-edit"   title="Edit"             data-id="${bd.id}">✏️</button>
            <button class="btn-delete" title="Delete"           data-id="${bd.id}">🗑️</button>
          </div>
        `;
        dayList.appendChild(div);
      }

      // Wire per-birthday action buttons
      dayList.querySelectorAll(".btn-card").forEach((btn) =>
        btn.addEventListener("click", () => {
          const bd = State.get("birthdays").find((b) => b.id === btn.dataset.id);
          if (bd) { closeDayModal(); CardGenerator.open(bd); }
        })
      );
      dayList.querySelectorAll(".btn-edit").forEach((btn) =>
        btn.addEventListener("click", () => {
          const bd = State.get("birthdays").find((b) => b.id === btn.dataset.id);
          if (bd) { closeDayModal(); Modal.openEditModal(bd); }
        })
      );
      dayList.querySelectorAll(".btn-delete").forEach((btn) =>
        btn.addEventListener("click", () => {
          closeDayModal();
          App.deleteBirthday(btn.dataset.id);
        })
      );
    }

    // Fetch and render events for this day
    Events.renderInModal([], true);
    try {
      const evs = await API.fetchEvents(iso);
      Events.renderInModal(evs, false);
    } catch (_) {
      Events.renderInModal([], false);
    }

    dayModal.hidden = false;
  }

  // ── Close helpers ──────────────────────────────────────────────────────────
  function closeBdModal()  { bdModal.hidden  = true;  }
  function closeDayModal() { dayModal.hidden = true; }

  // ── Validation ─────────────────────────────────────────────────────────────
  function clearErrors() {
    nameErr.textContent = "";
    dateErr.textContent = "";
    nameInput.classList.remove("error");
    dateInput.classList.remove("error");
  }

  function validate() {
    let valid = true;
    clearErrors();

    if (!nameInput.value.trim()) {
      nameErr.textContent = "Name is required.";
      nameInput.classList.add("error");
      valid = false;
    }
    if (!dateInput.value) {
      dateErr.textContent = "Please select a date.";
      dateInput.classList.add("error");
      valid = false;
    }
    return valid;
  }

  // ── Form submit handler ────────────────────────────────────────────────────
  bdForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      name: nameInput.value.trim(),
      date: dateInput.value,       // YYYY-MM-DD (native date input format)
      note: noteInput.value.trim(),
    };

    const id = bdIdInput.value;
    try {
      showSpinner(true);
      if (id) {
        await API.updateBirthday(id, payload);
        Toast.show("Birthday updated! 🎉", "success");
      } else {
        await API.addBirthday(payload);
        Toast.show("Birthday saved! 🎂", "success");
      }
      closeBdModal();
      await App.loadData();
    } catch (err) {
      Toast.show(err.message, "error");
    } finally {
      showSpinner(false);
    }
  });

  // "Add Birthday on This Day" button inside day-detail modal
  addOnDay.addEventListener("click", () => {
    closeDayModal();
    openAddModal(_selectedDate);
  });

  // Close buttons
  document.getElementById("closeModal").addEventListener("click",    closeBdModal);
  document.getElementById("cancelModal").addEventListener("click",   closeBdModal);
  document.getElementById("closeDayModal").addEventListener("click", closeDayModal);

  // Close on backdrop click
  bdModal.addEventListener("click",  (e) => { if (e.target === bdModal)  closeBdModal();  });
  dayModal.addEventListener("click", (e) => { if (e.target === dayModal) closeDayModal(); });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!bdModal.hidden)  closeBdModal();
      if (!dayModal.hidden) closeDayModal();
    }
  });

  return { openAddModal, openEditModal, openDayModal, selectedDate: () => _selectedDate };
})();


/* ══════════════════════════════════════════════════════════════
   6b. EVENTS MODULE
   Handles per-day calendar events inside the day-detail modal.
══════════════════════════════════════════════════════════════ */
const Events = (() => {
  const eventList  = document.getElementById("dayEventList");
  const addForm    = document.getElementById("eventAddForm");
  const titleInput = document.getElementById("eventTitleInput");
  const titleError = document.getElementById("eventTitleError");

  /**
   * Render events inside the day modal.
   * @param {Array}   events  - Array of event objects from the API
   * @param {boolean} loading - When true, show a loading placeholder
   */
  function renderInModal(events, loading = false) {
    eventList.innerHTML = "";
    if (loading) {
      eventList.innerHTML = `<p class="event-empty-msg">Loading…</p>`;
      return;
    }
    if (!events.length) {
      eventList.innerHTML = `<p class="event-empty-msg">No events for this day.</p>`;
      return;
    }
    for (const ev of events) {
      const item = document.createElement("div");
      item.classList.add("event-list-item");
      item.innerHTML = `
        <div class="event-dot"></div>
        <span class="event-list-title">${escHtml(ev.title)}</span>
        <button class="btn-delete-event" title="Delete event" data-id="${ev.id}">&times;</button>
      `;
      item.querySelector(".btn-delete-event").addEventListener("click", async () => {
        try {
          await API.deleteEvent(ev.id);
          const updated = await API.fetchEvents(Modal.selectedDate());
          renderInModal(updated, false);
        } catch (err) {
          Toast.show(err.message, "error");
        }
      });
      eventList.appendChild(item);
    }
  }

  // Wire the inline add-event form
  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    titleError.textContent = "";
    const title = titleInput.value.trim();
    if (!title) { titleError.textContent = "Event title is required."; return; }
    const date = Modal.selectedDate();
    if (!date) return;
    try {
      await API.addEvent({ title, date });
      titleInput.value = "";
      const updated = await API.fetchEvents(date);
      renderInModal(updated, false);
    } catch (err) {
      Toast.show(err.message, "error");
    }
  });

  return { renderInModal };
})();


/* ══════════════════════════════════════════════════════════════
   7.  TOAST MODULE
   Transient notification at the bottom of the screen.
══════════════════════════════════════════════════════════════ */
const Toast = (() => {
  const el = document.getElementById("toast");
  let _timer = null;

  /**
   * Show a toast notification.
   * @param {string} msg  - Message text
   * @param {"success"|"error"|""} type - Optional style variant
   * @param {number} duration - Auto-dismiss in ms (default 3500)
   */
  function show(msg, type = "", duration = 3500) {
    el.textContent = msg;
    el.className   = "toast" + (type ? ` ${type}` : "");
    el.classList.add("show");

    clearTimeout(_timer);
    _timer = setTimeout(() => el.classList.remove("show"), duration);
  }

  return { show };
})();


/* ══════════════════════════════════════════════════════════════
   8.  THEME MODULE
   Persists dark/light preference to localStorage.
══════════════════════════════════════════════════════════════ */
const Theme = (() => {
  const root     = document.documentElement;
  const btn      = document.getElementById("themeToggle");
  const icon     = document.getElementById("themeIcon");
  const STORAGE_KEY = "bd-theme";

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    icon.textContent = theme === "dark" ? "☀️" : "🌙";
    localStorage.setItem(STORAGE_KEY, theme);
  }

  function toggle() {
    const current = root.getAttribute("data-theme") || "light";
    apply(current === "dark" ? "light" : "dark");
  }

  /** Load saved preference or system preference */
  function init() {
    const saved  = localStorage.getItem(STORAGE_KEY);
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    apply(saved || system);
  }

  btn.addEventListener("click", toggle);
  return { init };
})();


/* ══════════════════════════════════════════════════════════════
   8b. NOTIFICATIONS MODULE
   Browser Notification API — fires native alerts for today's
   birthdays on page load (after permission is granted).
══════════════════════════════════════════════════════════════ */
const Notifications = (() => {
  /** Request browser notification permission exactly once. */
  async function requestPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  /**
   * Fire a browser notification for every birthday whose month-day
   * matches today (birth year is ignored — annual recurrence).
   */
  function notifyTodayBirthdays(birthdays) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const todayISO = new Date().toISOString().split("T")[0];
    const [, tm, td] = todayISO.split("-");
    birthdays
      .filter((b) => {
        const [, m, d] = b.date.split("-");
        return m === tm && d === td;
      })
      .forEach((bd) => {
        const birthYear = parseInt(bd.date.split("-")[0], 10);
        const age  = birthYear >= 1900 ? new Date().getFullYear() - birthYear : null;
        const body = age !== null
          ? `Turns ${age} today! 🎂${bd.note ? " · " + bd.note : ""}`
          : `🎂${bd.note ? " " + bd.note : ""}`;
        try {
          new Notification(`🎉 Happy Birthday, ${bd.name}!`, { body });
        } catch (_) { /* silently ignore in non-HTTPS context */ }
      });
  }

  return { requestPermission, notifyTodayBirthdays };
})();


/* ══════════════════════════════════════════════════════════════
   9.  SPINNER HELPER
══════════════════════════════════════════════════════════════ */
const spinner = document.getElementById("spinner");
function showSpinner(visible) {
  spinner.hidden = !visible;
}


/* ══════════════════════════════════════════════════════════════
   10. UTILITIES
══════════════════════════════════════════════════════════════ */

/**
 * Escape HTML special characters to prevent XSS when injecting
 * user-provided strings into innerHTML.
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Convert "YYYY-MM-DD" to a human-readable "DD Mon YYYY" string.
 * e.g. "1990-03-15" → "15 Mar 1990"
 */
function formatDisplayDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}


/* ══════════════════════════════════════════════════════════════
   11. APP MODULE — Boot & Event Wiring
══════════════════════════════════════════════════════════════ */
const App = (() => {
  /** Load all birthday data from backend and refresh UI */
  async function loadData() {
    try {
      showSpinner(true);
      const [allBds, upcomingBds] = await Promise.all([
        API.fetchAll(),
        API.fetchUpcoming(State.get("upcomingDays")),
      ]);
      State.set("birthdays", allBds);
      State.set("upcoming",  upcomingBds);
    } catch (err) {
      Toast.show("Failed to load data: " + err.message, "error");
    } finally {
      showSpinner(false);
    }

    // Refresh all UI components
    Calendar.render();
    Upcoming.render();
    BirthdayList.render();
    checkTodayBirthdays();
    Notifications.notifyTodayBirthdays(allBds);
  }

  /** Show a toast if any birthday falls on today */
  function checkTodayBirthdays() {
    const today = State.todayISO();
    const todayBds = State.get("birthdays").filter((b) => b.date === today);
    if (todayBds.length) {
      const names = todayBds.map((b) => b.name).join(", ");
      Toast.show(`🎉 Happy Birthday to ${names}!`, "success", 6000);
    }
  }

  /** Delete a birthday after confirmation */
  async function deleteBirthday(id) {
    if (!confirm("Delete this birthday?")) return;
    try {
      showSpinner(true);
      await API.deleteBirthday(id);
      Toast.show("Birthday deleted.", "");
      await loadData();
    } catch (err) {
      Toast.show(err.message, "error");
    } finally {
      showSpinner(false);
    }
  }

  /** Wire up global UI events */
  function wireEvents() {
    // Calendar navigation
    document.getElementById("prevMonth").addEventListener("click", async () => {
      Calendar.prevMonth();
      // Reload so birthday markers are correct for the new month
      // (all birthdays already in state — just re-render)
      Calendar.render();
    });
    document.getElementById("nextMonth").addEventListener("click", () => {
      Calendar.nextMonth();
      Calendar.render();
    });

    // Add birthday button (header)
    document.getElementById("addBirthdayBtn").addEventListener("click", () =>
      Modal.openAddModal()
    );

    // Upcoming days selector
    document.getElementById("upcomingDays").addEventListener("change", async (e) => {
      State.set("upcomingDays", Number(e.target.value));
      try {
        const up = await API.fetchUpcoming(State.get("upcomingDays"));
        State.set("upcoming", up);
        Upcoming.render();
      } catch (err) {
        Toast.show(err.message, "error");
      }
    });

    // Search input (client-side filter — no extra API call needed)
    document.getElementById("searchInput").addEventListener("input", (e) => {
      State.set("searchQuery", e.target.value);
      BirthdayList.render();
    });
  }

  /** Application entry point */
  async function init() {
    Theme.init();                           // Apply saved dark/light preference
    wireEvents();                           // Bind UI events
    await Notifications.requestPermission(); // Ask once for browser notifications
    await loadData();                       // Fetch data & render everything
  }

  return { init, loadData, deleteBirthday };
})();


/* ══════════════════════════════════════════════════════════════
   16. CARD GENERATOR — AI-powered birthday card modal
══════════════════════════════════════════════════════════════ */
const CardGenerator = (() => {
  /* ── DOM refs ── */
  const cardModal        = document.getElementById("cardModal");
  const cardOptions      = document.getElementById("cardOptions");
  const cardPreviewEl    = document.getElementById("cardPreview");
  const cardForName      = document.getElementById("cardForName");
  const cardForAge       = document.getElementById("cardForAge");
  const cardRelationship = document.getElementById("cardRelationship");
  const birthdayCard     = document.getElementById("birthdayCard");
  const cardBgOverlay    = document.getElementById("cardBgOverlay");
  const cardEmoji        = document.getElementById("cardEmoji");
  const cardRecipient    = document.getElementById("cardRecipient");
  const cardShortMsg     = document.getElementById("cardShortMsg");
  const cardLongMsg      = document.getElementById("cardLongMsg");
  const cardFooterDate   = document.getElementById("cardFooterDate");
  const confettiCanvas   = document.getElementById("confettiCanvas");
  const generateCardBtn  = document.getElementById("generateCardBtn");
  const regenCardBtn     = document.getElementById("regenCardBtn");
  const aiBgBtn          = document.getElementById("aiBgBtn");
  const dlPng            = document.getElementById("downloadPng");
  const dlPdf            = document.getElementById("downloadPdf");
  const closeBtn         = document.getElementById("closeCardModal");
  const cancelBtn        = document.getElementById("cancelCardModal");

  /* ── State ── */
  let _activeBd    = null;
  let _activeTone  = "Emotional";
  let _activeTheme = "Classic";
  let _useAiBg     = false;
  let _confettiRAF = null;
  let _confettiPieces = [];

  /* ── Pill selection ── */
  function _wire() {
    document.querySelectorAll(".tone-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tone-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        _activeTone = btn.dataset.tone;
      })
    );
    document.querySelectorAll(".theme-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        document.querySelectorAll(".theme-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        _activeTheme = btn.dataset.theme;
      })
    );
    document.getElementById("useAiBg").addEventListener("change", (e) => {
      _useAiBg = e.target.checked;
    });

    generateCardBtn?.addEventListener("click",  generate);
    regenCardBtn?.addEventListener("click",     generate);
    aiBgBtn?.addEventListener("click",          _generateAiBg);
    dlPng?.addEventListener("click",            downloadPng);
    dlPdf?.addEventListener("click",            downloadPdf);
    closeBtn?.addEventListener("click",         close);
    cancelBtn?.addEventListener("click",        close);

    cardModal?.addEventListener("click", (e) => {
      if (e.target === cardModal) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && cardModal && !cardModal.hidden) close();
    });
  }

  /* ── Public: open ── */
  function open(bd) {
    if (!cardModal) return;
    _activeBd = bd;

    // Reset to step 1
    cardOptions.hidden   = false;
    cardPreviewEl.hidden = true;
    cardRelationship.value = "";

    // Default pill selections
    document.querySelectorAll(".tone-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".theme-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('.tone-btn[data-tone="Emotional"]')?.classList.add("active");
    document.querySelector('.theme-btn[data-theme="Classic"]')?.classList.add("active");
    _activeTone  = "Emotional";
    _activeTheme = "Classic";
    _useAiBg     = false;
    document.getElementById("useAiBg").checked = false;

    // Populate banner
    const age = _calcAgeCard(bd.date);
    cardForName.textContent = escHtml(bd.name);
    cardForAge.textContent  = age !== null ? `Age ${age}` : "";

    cardModal.hidden = false;
    cardRelationship.focus();
  }

  function _calcAgeCard(dateISO) {
    const yr = parseInt((dateISO || "").split("-")[0], 10);
    if (!yr || yr < 1900) return null;
    return new Date().getFullYear() - yr;
  }

  /* ── Public: close ── */
  function close() {
    if (!cardModal) return;
    stopConfetti();
    cardModal.hidden = true;
    _activeBd = null;
  }

  /* ── Generate card text ── */
  async function generate() {
    if (!_activeBd) return;
    const age = _calcAgeCard(_activeBd.date);
    const body = {
      name:         _activeBd.name,
      age:          age,
      relationship: cardRelationship.value.trim() || "friend",
      tone:         _activeTone,
    };

    generateCardBtn && (generateCardBtn.disabled = true);
    regenCardBtn    && (regenCardBtn.disabled    = true);

    try {
      showSpinner(true);
      const data = await API.generateCard(body);
      if (data.fallback) {
        Toast.show("No API key — using built-in card template.", "info");
      }
      if (aiBgBtn) { aiBgBtn.disabled = false; aiBgBtn.title = "Generate themed background"; }
      _showCard(data);
    } catch (err) {
      Toast.show(err.message || "Card generation failed.", "error");
    } finally {
      showSpinner(false);
      generateCardBtn && (generateCardBtn.disabled = false);
      regenCardBtn    && (regenCardBtn.disabled    = false);
    }
  }

  /* ── Render card preview ── */
  function _showCard(data) {
    const TONE_EMOJI = { Funny: "😂", Emotional: "💖", Professional: "🤝", "Best Friend": "🥳" };

    birthdayCard.setAttribute("data-cardtheme", _activeTheme);
    cardEmoji.textContent      = TONE_EMOJI[data.tone] ?? "🎂";
    cardRecipient.textContent  = data.name;
    cardShortMsg.textContent   = data.short_message;
    cardLongMsg.textContent    = data.long_message;
    cardFooterDate.textContent = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    // Clear old AI background (overlay image + any inline gradient on the card)
    cardBgOverlay.style.backgroundImage = "";
    cardBgOverlay.classList.remove("loaded");
    birthdayCard.style.background = "";  // clear any gradient fallback

    cardOptions.hidden   = true;
    cardPreviewEl.hidden = false;

    // Defer confetti until after the browser has laid out the newly-visible card
    // so offsetWidth/Height return real pixel dimensions.
    requestAnimationFrame(() => requestAnimationFrame(launchConfetti));

    if (_useAiBg) _generateAiBg();
  }

  /* ── AI Background image ── */
  async function _generateAiBg() {
    if (!_activeBd) return;
    aiBgBtn && (aiBgBtn.disabled = true);
    try {
      showSpinner(true);
      const data = await API.generateCardImage({ theme: _activeTheme, tone: _activeTone });

      if (data.gradient && data.fallback) {
        // No API key — paint the gradient directly onto the card so it exports
        // correctly in PNG/PDF without fighting the white image scrim.
        birthdayCard.style.background = data.gradient;
        Toast.show("Using themed gradient (add OPENAI_API_KEY for DALL·E images).", "info");
      } else if (data.image_url) {
        const img = new Image();
        img.onload = () => {
          cardBgOverlay.style.backgroundImage = `url('${data.image_url}')`;
          cardBgOverlay.classList.add("loaded");
        };
        img.src = data.image_url;
      }
    } catch (err) {
      Toast.show(err.message || "Background image generation failed.", "error");
    } finally {
      showSpinner(false);
      aiBgBtn && (aiBgBtn.disabled = false);
    }
  }

  /* ── Confetti ── */
  function launchConfetti() {
    if (!confettiCanvas) return;
    stopConfetti();
    const ctx = confettiCanvas.getContext("2d");
    const W   = confettiCanvas.width  = confettiCanvas.offsetWidth;
    const H   = confettiCanvas.height = confettiCanvas.offsetHeight;
    const COLORS = ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#ff922b","#cc5de8","#f06595"];
    _confettiPieces = Array.from({ length: 110 }, () => ({
      x: Math.random() * W, y: Math.random() * H - H,
      r: Math.random() * 7 + 3,
      d: Math.random() * 110 + 20,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      t: Math.random() * Math.PI * 2,
      ts: Math.random() * 0.04 + 0.02,
    }));
    let frame = 0;
    const TOTAL = 250;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      const alpha = frame < 150 ? 1 : 1 - (frame - 150) / 100;
      ctx.globalAlpha = Math.max(0, alpha);
      _confettiPieces.forEach((p) => {
        p.t += p.ts;
        p.y += Math.cos(p.d) + 1.2 + p.r / 6;
        p.x += Math.sin(frame / 20);
        if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c;
        ctx.fill();
      });
      frame++;
      if (frame < TOTAL) _confettiRAF = requestAnimationFrame(draw);
      else stopConfetti();
    }
    _confettiRAF = requestAnimationFrame(draw);
  }

  function stopConfetti() {
    if (_confettiRAF) { cancelAnimationFrame(_confettiRAF); _confettiRAF = null; }
    if (confettiCanvas) {
      const ctx = confettiCanvas.getContext("2d");
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  /* ── Stamp live computed styles into the html2canvas clone ── */
  function _fixCloneColors(clonedDoc) {
    const cloneCard = clonedDoc.getElementById("birthdayCard");
    if (!cloneCard) return;
    // Propagate the data-cardtheme attribute explicitly (html2canvas may miss it)
    cloneCard.setAttribute("data-cardtheme", birthdayCard.getAttribute("data-cardtheme") || "Classic");
    // Inline computed color + opacity for every text node so attr-selector rules
    // that html2canvas fails to resolve are replaced with concrete values.
    const targets = [
      "#cardEmoji", "#cardRecipient", "#cardShortMsg",
      "#cardLongMsg", "#cardFooterDate", ".card-divider",
      ".card-top-band", ".card-corner"
    ];
    targets.forEach(sel => {
      const live  = birthdayCard.querySelector(sel);
      const clone = cloneCard.querySelector(sel);
      if (!live || !clone) return;
      const cs = window.getComputedStyle(live);
      clone.style.color      = cs.color;
      clone.style.opacity    = cs.opacity;
      clone.style.fontWeight = cs.fontWeight;
      clone.style.fontStyle  = cs.fontStyle;
      clone.style.background = cs.background;
    });
    // Also fix the card's own background (covers both theme gradient and gradient fallback)
    const cs = window.getComputedStyle(birthdayCard);
    cloneCard.style.background = birthdayCard.style.background || cs.background;
    cloneCard.style.color      = cs.color;
    // If a DALL-E background image is loaded on the overlay, copy it too
    const liveOverlay  = birthdayCard.querySelector("#cardBgOverlay");
    const cloneOverlay = cloneCard.querySelector("#cardBgOverlay");
    if (liveOverlay && cloneOverlay && liveOverlay.style.backgroundImage) {
      cloneOverlay.style.backgroundImage = liveOverlay.style.backgroundImage;
      cloneOverlay.style.opacity = "1";
    }
  }

  /* ── Downloads ── */
  async function downloadPng() {
    if (!birthdayCard || typeof html2canvas === "undefined") {
      Toast.show("html2canvas not loaded.", "error"); return;
    }
    try {
      showSpinner(true);
      const canvas = await html2canvas(birthdayCard, {
        scale: 3, useCORS: true, allowTaint: true,
        onclone: (_doc) => _fixCloneColors(_doc)
      });
      const a = document.createElement("a");
      a.href     = canvas.toDataURL("image/png");
      a.download = `birthday-card-${(_activeBd?.name || "card").replace(/\s+/g, "_")}.png`;
      a.click();
    } catch (e) {
      Toast.show("PNG export failed.", "error");
    } finally { showSpinner(false); }
  }

  async function downloadPdf() {
    if (!birthdayCard || typeof html2canvas === "undefined" || !window.jspdf?.jsPDF) {
      Toast.show("PDF library failed to load. Check your internet connection.", "error"); return;
    }
    try {
      showSpinner(true);
      const canvas = await html2canvas(birthdayCard, {
        scale: 2, useCORS: true, allowTaint: true,
        onclone: (_doc) => _fixCloneColors(_doc)
      });
      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
      const pW = pdf.internal.pageSize.getWidth();
      const pH = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, "PNG", 0, 0, pW, pH);
      pdf.save(`birthday-card-${(_activeBd?.name || "card").replace(/\s+/g, "_")}.pdf`);
    } catch (e) {
      Toast.show("PDF export failed.", "error");
    } finally { showSpinner(false); }
  }

  /* ── Init ── */
  document.addEventListener("DOMContentLoaded", _wire);

  return { open, close };
})();

/* ══════════════════════════════════════════════════════════════
   Boot the app once the DOM is ready.
══════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", App.init);
