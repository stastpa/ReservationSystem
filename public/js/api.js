const API_BASE = 'https://reservationsystem-pxrs.onrender.com';

async function saveReservations(pc, from, to, date, color = '#1a73e8', description = '') {
  const res = await fetch(`${API_BASE}/reserve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pc, from, to, date, color, description })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Nepodařilo se uložit rezervaci');
    return false;
  }

  return true;
}

function deleteReservation() {
  if (!selectedReservation) return;

  const { pc, from, date } = selectedReservation;

  fetch(`${API_BASE}/update-reservation`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pc,
      from: '',
      to: '',
      date,
      originalFrom: from
    })
  })
    .then(async (res) => {
      const data = await res.json();
      if (res.ok) {
        showMessage("Rezervace byla smazána");
        await loadReservations();
        closeModal();
      } else {
        showMessage(data.error || "Nepodařilo se smazat rezervaci", true);
      }
    })
    .catch(() => {
      showMessage("Chyba serveru při mazání", true);
    });
}
