// js/calendar.js

function updateDateDisplay() {
    const date = new Date(getCurrentDateStr(currentDayIndex));
    document.getElementById('dateDisplay').innerText = date.toLocaleDateString('cs-CZ', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
  
  function updateNowLine() {
    const line = document.getElementById('nowLine');
    const now = new Date();
    const isToday = currentDayIndex === 0;
    if (!isToday) return line.style.display = 'none';
  
    const offset = ((now.getHours() + 1) + now.getMinutes() / 60) * 60;
    line.style.top = `${offset}px`;
    line.style.display = 'block';
  }
  
  async function loadReservations() {
    try {
      const res = await fetch(`${API_BASE}/reservations`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error("Failed to load reservations");
      reservations = await res.json();
      updateCalendar();
      updateMap();
    } catch (err) {
      console.error("Nepodařilo se načíst rezervace:", err);
    }
  }
  
  function updateCalendar() {
    const body = document.getElementById('calendarBody');
    body.innerHTML = '';
    const slotHeight = 60;
  
    for (let hour = 0; hour < 24; hour++) {
      const row = document.createElement('tr');
      const timeCell = document.createElement('td');
      timeCell.textContent = `${hour}:00`;
      row.appendChild(timeCell);
  
      pcs.forEach(pc => {
        const cell = document.createElement('td');
        cell.dataset.pc = pc;
        cell.dataset.hour = hour;
  
        cell.onclick = () => {
          if (pc === "Stanley") {
            showMessage("Pro rezervaci kontaktujte Standu na Discordu (@stenlyvesely)", true);
            return;
          }
  
          const slotStart = `${String(hour).padStart(2, '0')}:00`;
          const slotEnd = `${String(hour).padStart(2, '0')}:30`;
          const today = getCurrentDateStr(currentDayIndex);
  
          const overlaps = (reservations[pc] || []).filter(r =>
            r.date === today && timeOverlap(r.from, r.to, slotStart, slotEnd)
          );
  
          const isAdminUser = currentUser && currentUser.roles?.includes(ADMIN_ROLE_ID);
          const isOwner = overlaps.length === 0 || overlaps.every(r => r.user === currentUser?.username);
  
          if (!isAdminUser && !isOwner) {
            showMessage("Tuto dobu nemůžeš rezervovat", true);
            return;
          }
  
          selectedPC = pc;
          document.getElementById('startTime').value = slotStart;
          document.getElementById('endTime').value = slotEnd;
          document.getElementById('modalPC').innerText = `Rezervace PC ${selectedPC}`;
          selectedReservation = null;
          document.getElementById('deleteBtn').style.display = 'none';
          document.querySelector('#reservationModal button[onclick="makeReservation()"]')
            .innerText = 'Rezervovat';
          document.getElementById('overlay').style.display = 'block';
          document.getElementById('reservationModal').style.display = 'block';
        };
  
        row.appendChild(cell);
      });
  
      body.appendChild(row);
    }
  
    pcs.forEach((pc, pcIndex) => {
      const entries = reservations[pc] || [];
      entries.forEach(e => {
        if (e.date !== getCurrentDateStr(currentDayIndex) || !e.from || !e.to) return;
  
        const [startHour, startMin] = e.from.split(":").map(Number);
        const [endHour, endMin] = e.to.split(":").map(Number);
        const duration = (endHour + endMin / 60) - (startHour + startMin / 60);
  
        const row = body.querySelector(`tr:nth-child(${startHour + 1})`);
        const cell = row?.querySelector(`td:nth-child(${pcIndex + 2})`);
        if (!cell) return;
  
        const div = document.createElement('div');
        div.className = 'reservation-entry';
        div.innerText = `${e.user}\n${e.from}–${e.to}${e.description ? `\n${e.description}` : ''}`;
        div.style.top = `${(startMin / 60) * slotHeight}px`;
        div.style.height = `${duration * slotHeight}px`;
        div.style.backgroundColor = e.color || '#1a73e8';
        div.style.color = isBrightColor(e.color || '#1a73e8') ? 'black' : 'white';
  
        const isOwner = currentUser && (e.user === currentUser.username);
        const isAdminUser = currentUser && currentUser.roles?.includes(ADMIN_ROLE_ID);
  
        if (isOwner || isAdminUser) {
          div.onclick = (e2) => {
            e2.stopPropagation();
            selectedReservation = {
              pc,
              from: e.from,
              date: e.date,
              user: e.user,
              color: e.color || '#1a73e8'
            };
            document.querySelector('#reservationModal button[onclick="makeReservation()"]').innerText = 'Upravit';
            document.getElementById('startTime').value = e.from;
            document.getElementById('endTime').value = e.to;
            document.getElementById('colorPicker').value = e.color || '#1a73e8';
            document.getElementById('modalPC').innerText = `Upravit rezervaci PC ${pc}`;
            document.getElementById('descriptionInput').value = e.description || '';
            document.getElementById('deleteBtn').style.display = 'inline-block';
            document.getElementById('overlay').style.display = 'block';
            document.getElementById('reservationModal').style.display = 'block';
          };
        }
  
        cell.appendChild(div);
      });
    });
  
    updateNowLine();
  }
  