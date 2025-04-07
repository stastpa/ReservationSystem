function loginWithDiscord() {
  window.location.href = `${API_BASE}/login`;
}

function logout() {
  fetch(`${API_BASE}/logout`, {
    method: 'POST',
    credentials: 'include'
  }).then(() => {
    window.location.reload();
  });
}

async function fetchUser() {
  try {
    const res = await fetch(`${API_BASE}/me`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error("Not logged in");

    const user = await res.json();
    currentUser = user;
    ADMIN_ROLE_ID = user.adminRoleId;

    document.getElementById('userInfo').innerText = `Přihlášen: ${user.username}`;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'inline-block';
  } catch (e) {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('app').classList.add('hidden');
    document.getElementById('userInfo').innerText = `Nepřihlášen`;
    document.getElementById('loginBtn').style.display = 'inline-block';
    document.getElementById('logoutBtn').style.display = 'none';
  }
}