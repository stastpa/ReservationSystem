function updateMap() {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.querySelectorAll('.pc-box').forEach(el => {
      const id = el.dataset.id;
      const inUse = (reservations[id] || []).some(r => r.date === getCurrentDateStr(currentDayIndex) && r.from <= timeStr && r.to > timeStr);
      el.classList.toggle('red', inUse);
    });
  }
  
  function toggleView() {
    const map = document.getElementById('mapView');
    const cal = document.getElementById('calendarView');
    map.style.display = map.style.display === 'none' ? 'block' : 'none';
    cal.style.display = cal.style.display === 'none' ? 'block' : 'none';
    updateCalendar();
    updateMap();
  }
  
  function prevDay() {
    currentDayIndex--;
    updateCalendar();
    updateMap();
    updateDateDisplay();
  }
  
  function nextDay() {
    currentDayIndex++;
    updateCalendar();
    updateMap();
    updateDateDisplay();
  }
  