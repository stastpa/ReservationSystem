window.addEventListener('load', () => {
    fetchUser();
    loadReservations();
    updateDateDisplay();
    updateCalendar();
    updateMap();
    setInterval(updateNowLine, 60000);
  
    document.querySelectorAll('.pc-box').forEach(el => {
      el.addEventListener('click', () => {
        const pcId = el.dataset.id;
        if (pcId === "Stanley") {
          showMessage("Pro rezervaci kontaktujte Standu na Discordu (@stenlyvesely)", true);
          return;
        }
  
        selectedPC = pcId;
        selectedReservation = null;
        document.querySelector('#reservationModal button[onclick="makeReservation()"]')
          .innerText = 'Rezervovat';
        document.getElementById('modalPC').innerText = `Rezervace PC ${selectedPC}`;
        document.getElementById('colorPicker').value = "#1a73e8";
        document.getElementById('descriptionInput').value = "";
        document.getElementById('startTime').value = "";
        document.getElementById('endTime').value = "";
        document.getElementById('deleteBtn').style.display = 'none';
        document.getElementById('overlay').style.display = 'block';
        document.getElementById('reservationModal').style.display = 'block';
      });
    });
  });
  
  function reserveAllFive() {
    selectedPC = "all";
    selectedReservation = null;
    document.getElementById('modalPC').innerText = `Rezervace všech 5 PC`;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('reservationModal').style.display = 'block';
    document.getElementById('deleteBtn').style.display = 'none';
  }
  
  async function makeReservation() {
    const from = document.getElementById('startTime').value;
    const to = document.getElementById('endTime').value;
    const color = document.getElementById('colorPicker').value || '#1a73e8';
    const description = document.getElementById('descriptionInput').value || '';
    const isEditing = selectedReservation !== null;
  
    if (!from || !to) {
      alert("Zadej platné časy");
      return;
    }
  
    const fromMins = timeToMinutes(from);
    const toMins = timeToMinutes(to);
  
    if (fromMins >= toMins) {
      alert("Čas 'Od' musí být před časem 'Do'.");
      return;
    }
  
    if (isInReceptionInterval(fromMins, toMins)) {
      alert("Prosím, ohlaste svou prezenci na recepci");
    }
  
    const date = getCurrentDateStr(currentDayIndex);
  
    if (isEditing) {
      const res = await fetch(`${API_BASE}/update-reservation`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pc: selectedReservation.pc,
          from,
          to,
          date,
          originalFrom: selectedReservation.from,
          description,
          color
        })
      });
  
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || 'Nepodařilo se upravit rezervaci', true);
        return;
      }
      showMessage("Rezervace upravena");
    } else {
      const pcList = selectedPC === "all" ? pcsToReserveAll : [selectedPC];

      if (selectedPC === "all") {
        const todayReservations = reservations;
        const conflict = pcList.some(pc => {
          const entries = todayReservations[pc] || [];
          return entries.some(r => r.date === date && timeOverlap(r.from, r.to, from, to));
        });
      
        if (conflict) {
          showMessage("Nelze rezervovat všech 5 PC – alespoň jedno je již obsazené.", true);
          return;
        }
      }
      
      for (const pc of pcList) {
        const ok = await saveReservations(pc, from, to, date, color, description);
        if (!ok) return;
      }
    }
  
    closeModal();
    await loadReservations();
  }