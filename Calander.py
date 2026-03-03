#!/usr/bin/env python
from flask import Flask, render_template_string

app = Flask(__name__)

HTML = """<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='UTF-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1.0' />
  <title>Birthday Calendar App</title>
  <style>
    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: linear-gradient(135deg, #f8fafc 0%, #e0eafc 100%); margin: 0; padding: 0; color: #444; }
    header { background: linear-gradient(90deg, #a3d2ca 60%, #f7d9c4 100%); padding: 1.2rem 2rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #fff; box-shadow: 0 2px 8px rgba(163, 210, 202, 0.15); }
    header h1 { margin: 0; font-size: 2rem; font-weight: 700; letter-spacing: 1px; color: #355c7d; }
    nav button { background: none; border: none; margin: 0 0.7rem; font-size: 1.1rem; cursor: pointer; color: #355c7d; padding: 0.4rem 0.8rem; border-radius: 20px; transition: background 0.2s, color 0.2s; }
    nav button.active, nav button:hover { background: #f7d9c4; color: #6c5b7b; font-weight: bold; box-shadow: 0 2px 8px rgba(247, 217, 196, 0.15); }
    main { padding: 2rem 1rem; max-width: 900px; margin: 0 auto; }
    #monthYear { font-size: 1.3rem; font-weight: 600; color: #6c5b7b; margin-bottom: 1.5rem; letter-spacing: 1px; }
    .calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(163, 210, 202, 0.08); padding: 1rem; }
    .day { background: linear-gradient(135deg, #f7d9c4 0%, #a3d2ca 100%); padding: 0.7rem; border-radius: 12px; border: none; height: 70px; position: relative; cursor: pointer; box-shadow: 0 2px 8px rgba(163, 210, 202, 0.10); transition: transform 0.2s, box-shadow 0.2s; }
    .day:hover { transform: scale(1.04); box-shadow: 0 6px 16px rgba(163, 210, 202, 0.18); background: linear-gradient(135deg, #e0eafc 0%, #f7d9c4 100%); }
    .date-number { font-weight: bold; font-size: 1.1rem; color: #355c7d; }
    .birthday-marker { position: absolute; bottom: 8px; right: 10px; font-size: 1.3rem; filter: drop-shadow(0 2px 4px #fff); }
    /* Other CSS styling for views, modals, forms, toast omitted for brevity */
  </style>
</head>
<body>
  <header>
    <h1>Birthday Calendar</h1>
    <nav>
      <button id='navCalendar' class='active'>Calendar</button>
      <button id='navList'>Birthday List</button>
      <button id='navUpcoming'>Upcoming</button>
      <button id='addBirthdayBtn'>Add Birthday</button>
    </nav>
  </header>
  <main>
    <!-- Calendar View -->
    <section id='calendarView' class='active' aria-label='Calendar View'>
      <div id='monthYear' style='text-align: center; margin-bottom:1rem;'></div>
      <div class='calendar' id='calendarGrid'></div>
    </section>
    <!-- Birthday List View -->
    <section id='listView' aria-label='Birthday List'>
      <h2>All Birthdays</h2>
      <div class='birthday-list' id='birthdayList'></div>
    </section>
    <!-- Upcoming Birthdays View -->
    <section id='upcomingView' aria-label='Upcoming Birthdays'>
      <h2>Upcoming Birthdays</h2>
      <div class='birthday-list' id='upcomingList'></div>
    </section>
  </main>
  <!-- Day Modal, Add/Edit Birthday Modal, and Toast omitted for brevity in HTML -->
  <script>
    // JavaScript for rendering calendar and handling UI interactions
    let birthdays = JSON.parse(localStorage.getItem('birthdays')) || [];
    let currentDate = new Date();
    let editing = false;
    // Element selectors
    const calendarView = document.getElementById('calendarView');
    const listView = document.getElementById('listView');
    const upcomingView = document.getElementById('upcomingView');
    const navCalendar = document.getElementById('navCalendar');
    const navList = document.getElementById('navList');
    const navUpcoming = document.getElementById('navUpcoming');
    const addBirthdayBtn = document.getElementById('addBirthdayBtn');
    const calendarGrid = document.getElementById('calendarGrid');
    const monthYear = document.getElementById('monthYear');
    
    function formatDisplayDate(dateStr) {
      const [yyyy, mm, dd] = dateStr.split('-');
      return `${dd}-${mm}-${yyyy}`;
    }
    
    function showView(view) {
      [calendarView, listView, upcomingView].forEach(v => v.classList.remove('active'));
      [navCalendar, navList, navUpcoming].forEach(btn => btn.classList.remove('active'));
      view.classList.add('active');
    }
    
    navCalendar.addEventListener('click', () => {
      showView(calendarView);
      navCalendar.classList.add('active');
      renderCalendar();
    });
    navList.addEventListener('click', () => {
      showView(listView);
      navList.classList.add('active');
      renderBirthdayList();
    });
    navUpcoming.addEventListener('click', () => {
      showView(upcomingView);
      navUpcoming.classList.add('active');
      renderUpcoming();
    });
    
    function renderCalendar() {
      calendarGrid.innerHTML = '';
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      monthYear.textContent = currentDate.toLocaleString('default', { month: 'long' }) + ' ' + year;
      const firstDay = new Date(year, month, 1);
      const startingDay = firstDay.getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let i = 0; i < startingDay; i++) {
        const blank = document.createElement('div');
        blank.classList.add('day');
        blank.style.background = 'transparent';
        blank.style.border = 'none';
        calendarGrid.appendChild(blank);
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const dd = String(day).padStart(2, '0');
        const mm = String(month + 1).padStart(2, '0');
        const yyyy = year;
        const dateKey = `${yyyy}-${mm}-${dd}`;
        const dayElem = document.createElement('div');
        dayElem.classList.add('day');
        dayElem.setAttribute('data-date', dateKey);
        dayElem.innerHTML = `<div class='date-number'>${day}</div>`;
        if (birthdays.some(b => b.date === dateKey)) {
          dayElem.innerHTML += `<div class='birthday-marker'>🎂</div>`;
        }
        dayElem.addEventListener('click', () => openDayModal(dateKey));
        calendarGrid.appendChild(dayElem);
      }
    }
    
    // Additional functions for modals, adding, editing, deleting birthdays, etc. omitted for brevity
    
    // Initialize
    renderCalendar();
    // ...existing initialization for list and upcoming views...
  </script>
</body>
</html>"""

@app.route("/")
def index():
    return render_template_string(HTML)

if __name__ == "__main__":
    app.run(debug=True)
