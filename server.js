const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  REQUIRED_GUILD_ID,
  ADMIN_ROLE_ID
} = process.env;

const RESERVATION_FILE = path.join(__dirname, 'reservations.json');
let reservations = fs.existsSync(RESERVATION_FILE)
  ? JSON.parse(fs.readFileSync(RESERVATION_FILE, 'utf8'))
  : {};

function saveReservations() {
  fs.writeFileSync(RESERVATION_FILE, JSON.stringify(reservations, null, 2));
}

function isAdmin(user) {
  return user?.roles?.includes(ADMIN_ROLE_ID);
}

app.use(cors({ origin: true, credentials: true }));
app.use(session({
  secret: 'super-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, sameSite: 'lax' }
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
  const scope = 'identify guilds guilds.members.read';
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}`;
  res.redirect(authUrl);
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send('Missing authorization code');

  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        scope: 'identify guilds guilds.members.read'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const memberRes = await axios.get(`https://discord.com/api/users/@me/guilds/${REQUIRED_GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    req.session.user = {
      username: userRes.data.username,
      id: userRes.data.id,
      roles: memberRes.data.roles
    };

    res.redirect('/index.html');
  } catch (error) {
    console.error('[OAuth Error]', error.response?.data || error.message);
    res.status(500).send(`<h2>OAuth Failed</h2><pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>`);
  }
});

app.get('/me', (req, res) => {
  req.session.user
    ? res.json(req.session.user)
    : res.status(401).json({ error: 'Not logged in' });
});

app.get('/reservations', (req, res) => res.json(reservations));

app.post('/reserve', (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(403).json({ error: 'Not logged in' });

  const { pc, from, to, date, color = '#1a73e8' } = req.body;
  reservations[pc] = reservations[pc] || [];

  const overlap = reservations[pc].some(r =>
    r.date === date && r.user !== user.username && from < r.to && to > r.from
  );
  if (overlap) return res.status(409).json({ error: 'Čas je již rezervován jiným uživatelem.' });

  reservations[pc] = reservations[pc].filter(r =>
    !(r.date === date && r.user === user.username && from < r.to && to > r.from)
  );
  reservations[pc].push({ from, to, date, user: user.username, color });
  saveReservations();
  res.json({ success: true });
});

app.post('/update-reservation', (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(403).json({ error: 'Not logged in' });

  const { pc, from, to, date, originalFrom } = req.body;
  const pcReservations = reservations[pc];
  if (!pcReservations) return res.status(404).json({ error: 'PC not found' });

  const index = pcReservations.findIndex(r => r.from === originalFrom && r.date === date);
  if (index === -1) return res.status(404).json({ error: 'Reservation not found' });

  const reservation = pcReservations[index];
  const authorized = reservation.user === user.username || isAdmin(user);
  if (!authorized) return res.status(403).json({ error: 'Unauthorized action' });

  if (!from && !to) {
    pcReservations.splice(index, 1);
  } else {
    pcReservations[index] = { from, to, date, user: reservation.user };
  }
  saveReservations();
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));