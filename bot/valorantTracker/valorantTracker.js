const players = require('./players.json');

const CHANNEL_ID = process.env.CHANNEL_ID_VALO;
const API_KEY = process.env.HENRIK_API_KEY;
const ADMINS = ['344531980567838722'];

let currentGoal = 10;
let currentIndex = 0;
let updateInProgress = false;

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now);
  const offset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  start.setDate(now.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime(), label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}` };
}

async function getPUUID(name, tag) {
  const res = await fetch(`https://api.henrikdev.xyz/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, {
    headers: { Authorization: API_KEY }
  });
  const data = await res.json();
  return data.data.puuid;
}

async function getMatches(puuid) {
  const res = await fetch(`https://api.henrikdev.xyz/valorant/v1/by-puuid/stored-matches/eu/${puuid}?size=100`, {
    headers: { Authorization: API_KEY }
  });
  const data = await res.json();
  return data.data;
}

async function getMatchCount(player, range) {
  let total = 0;
  for (const acc of player.accounts) {
    const [name, tag] = acc.split('#');
    try {
      const puuid = await getPUUID(name, tag);
      const matches = await getMatches(puuid);
      total += matches.filter(m => {
        const time = new Date(m.meta.started_at).getTime();
        return time >= range.start && time <= range.end;
      }).length;
    } catch (e) {
      console.warn(`Valorant: Error for ${acc}:`, e.message);
    }
  }
  return total;
}

async function updateMessage(channel) {
  const time = getCurrentWeek();
  const label = `📊 Weekly Valorant stats for ${time.label}:`;

  const messages = await channel.messages.fetch({ limit: 20 });
  let msg = messages.find(m => m.author.id === channel.client.user.id && m.content.includes(label));

  let lines = msg ? msg.content.split('\n') : [label];
  if (!msg) msg = await channel.send(label);

  if (currentIndex >= players.length) currentIndex = 0;
  const player = players[currentIndex];
  const count = await getMatchCount(player, time);
  const emoji = count >= currentGoal ? '✅' : '❌';
  const line = `👤 ${player.player}: ${count} ${emoji}`;

  const index = lines.findIndex(l => l.includes(`👤 ${player.player}:`));
  if (index !== -1) lines[index] = line;
  else lines.push(line);

  await msg.edit(lines.join('\n'));
  currentIndex++;
  console.log(`✅ Updated ${player.player}. Next: ${players[currentIndex % players.length].player}`);
}

module.exports = {
  async start(client) {
    const channel = await client.channels.fetch(CHANNEL_ID);

    // ⏱️ Run the first update immediately
    if (!updateInProgress) {
      updateInProgress = true;
      try {
        await updateMessage(channel);
      } catch (e) {
        console.error('❌ Initial Valorant update error:', e.message);
      } finally {
        updateInProgress = false;
      }
    }

    // 🔁 Schedule next updates every 1m10s
    setInterval(async () => {
      if (updateInProgress) return;
      updateInProgress = true;
      try {
        await updateMessage(channel);
      } catch (e) {
        console.error('❌ Scheduled Valorant update error:', e.message);
      } finally {
        updateInProgress = false;
      }
    }, 70 * 1000); // 1m10s
  },

  async handleCommand(message) {
    if (!message.content.startsWith('!') || !message.content.startsWith('!setgoal')) return;
    if (!ADMINS.includes(message.author.id)) {
      return message.reply('🚫 Unauthorized.');
    }

    const [, value] = message.content.split(' ');
    const goal = parseInt(value);
    if (isNaN(goal)) return message.reply('❌ Invalid number.');
    currentGoal = goal;
    return message.reply(`🎯 Valorant goal set to **${currentGoal}**`);
  }
};
