function showMessage(text, isError = false) {
    const el = document.getElementById('message');
    el.textContent = text;
    el.style.background = isError ? 'crimson' : '#333';
    el.style.display = 'block';
    setTimeout(() => {
      el.style.display = 'none';
    }, 3000);
  }
  
  function closeModal() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('reservationModal').style.display = 'none';
  }
  
  function showRules() {
    document.getElementById('rulesModal').style.display = 'block';
    document.getElementById('overlay').style.display = 'block';
  }
  
  function closeRules() {
    document.getElementById('rulesModal').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
  }
  