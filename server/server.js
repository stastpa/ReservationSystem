require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const supabase = require('./supabase');
require('../bot/lol/LoLactivity');
require('../bot/Valo/Valoactivity');


const app = express();
const PORT = process.env.PORT || 3000;

const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  REQUIRED_GUILD_ID,
  ADMIN_ROLE_ID
} = process.env;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: 'super-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, sameSite: 'lax' }
}));

const isAdmin = (user) => user?.roles?.includes(ADMIN_ROLE_ID);

// Discord Login
app.get('/login', (req, res) => {
  const scope = 'identify guilds guilds.members.read';
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}`;
  res.redirect(authUrl);
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Discord OAuth callback
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

    const [userRes, memberRes] = await Promise.all([
      axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      }),
      axios.get(`https://discord.com/api/users/@me/guilds/${REQUIRED_GUILD_ID}/member`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
    ]);

    const discordUser = {
      discord_id: userRes.data.id,
      username: userRes.data.username,
      roles: memberRes.data.roles
    };

    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('discord_id', discordUser.discord_id)
      .maybeSingle();

    if (fetchError) {
      console.error('[Supabase fetch error]', fetchError);
      return res.status(500).json({ error: 'Error checking user in DB' });
    }

    let userId = existingUser?.id;

    if (!existingUser) {
      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert({
          discord_id: discordUser.discord_id,
          username: discordUser.username,
          preferred_color: '#1a73e8'
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Supabase insert error]', insertError);
        return res.status(500).json({ error: 'Failed to create user' });
      }
      userId = inserted.id;
    }

    req.session.user = {
      id: userId,
      discord_id: discordUser.discord_id,
      username: discordUser.username,
      roles: discordUser.roles
    };

    res.redirect('/');
  } catch (error) {
    console.error('[OAuth Error]', error.response?.data || error.message);
    res.status(500).send(`<h2>OAuth Failed</h2><pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>`);
  }
});

app.get('/me', (req, res) => {
  return req.session.user
    ? res.json({ ...req.session.user, adminRoleId: ADMIN_ROLE_ID })
    : res.status(401).json({ error: 'Not logged in' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/reservations', async (req, res) => {
  const { data, error } = await supabase
    .from('reservations')
    .select(`id, pc, date, from_time, to_time, color, description, user:user_id ( id, username, preferred_color )`);

  if (error) return res.status(500).json({ error: 'Failed to fetch reservations' });

  const grouped = {};
  for (const r of data) {
    if (!grouped[r.pc]) grouped[r.pc] = [];
    grouped[r.pc].push({
      from: r.from_time,
      to: r.to_time,
      date: r.date,
      user: r.user.username,
      color: r.color || r.user.preferred_color,
      description: r.description || ''
    });
  }
  res.json(grouped);
});

app.post('/reserve', async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(403).json({ error: 'Not logged in' });

  const { pc, from, to, date, color = null, description = '' } = req.body;

  const { data: overlaps, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('pc', pc)
    .eq('date', date);

  if (error) return res.status(500).json({ error: 'Error checking for conflicts' });

  const conflict = overlaps.some(r => r.user_id !== user.id && from < r.to_time && to > r.from_time);
  if (conflict) return res.status(409).json({ error: 'Čas je již rezervován jiným uživatelem.' });

  const { error: insertError } = await supabase.from('reservations').insert({
    pc,
    date,
    from_time: from,
    to_time: to,
    user_id: user.id,
    color,
    description
  });

  if (insertError) return res.status(500).json({ error: 'Nepodařilo se uložit rezervaci do Supabase.' });

  res.json({ success: true });
});

app.post('/update-reservation', async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(403).json({ error: 'Not logged in' });

  const { pc, from, to, date, originalFrom, description = '', color = null } = req.body;

  const { data: existing, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('pc', pc)
    .eq('date', date)
    .eq('from_time', originalFrom)
    .maybeSingle();

  if (!existing || error) return res.status(404).json({ error: 'Reservation not found' });
  if (existing.user_id !== user.id && !isAdmin(user)) return res.status(403).json({ error: 'Unauthorized action' });

  if (!from && !to) {
    await supabase.from('reservations').delete().match({ id: existing.id });
  } else {
    await supabase.from('reservations')
      .update({ from_time: from, to_time: to, description, color })
      .match({ id: existing.id });
  }

  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));