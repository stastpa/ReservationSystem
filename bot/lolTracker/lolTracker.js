const players = require('./players.json');

const CHANNEL_ID = process.env.CHANNEL_ID_LOL;
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const ADMINS = ['344531980567838722'];

let currentGoal = 12;
let currentIndex = 0;
let updateInProgress = false;

const ROLE_MAP = {
  'TOP': 'TOP',
  'JUNGLE': 'JUNGLE',
  'MID': 'MIDDLE',
  'ADC': 'BOTTOM',
  'SUPPORT': 'UTILITY'
};

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now);
  const offset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  start.setDate(now.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
    label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`
  };
}

async function getPUUID(gameName, tagLine) {
  const url = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${RIOT_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Riot ID: ${gameName}#${tagLine}`);
  const data = await res.json();
  return data.puuid;
}

async function getMatchIds(puuid, start, end) {
  const url = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${start}&endTime=${end}&count=100&api_key=${RIOT_API_KEY}`;
  const res = await fetch(url);
  return await res.json();
}

async function getMatchStats(matchId, puuid) {
  const url = `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${RIOT_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.info || data.info.queueId !== 420) return null;
  const duration = (data.info.gameEndTimestamp - data.info.gameStartTimestamp) / 1000;
  if (duration < 300) return null;
  const player = data.info.participants.find(p => p.puuid === puuid);
  return player?.teamPosition || null;
}

async function getWeeklyStats(player, range) {
  let total = 0, onRole = 0;
  for (const account of player.accounts) {
    const [name, tag] = account.split('#');
    try {
      const puuid = await getPUUID(name, tag);
      const matchIds = await getMatchIds(puuid, range.start, range.end);
      for (const id of matchIds) {
        const role = await getMatchStats(id, puuid);
        if (role && role !== 'INVALID') {
          total++;
          if (role === ROLE_MAP[player.mainRole.toUpperCase()]) {
            onRole++;
          }
        }
      }
    } catch (err) {
      console.warn(`LoL: Error for ${account}:`, err.message);
    }
  }
  return { total, onRole };
}

async function updateMessage(channel) {
  const time = getCurrentWeek();
  const label = `📊 Weekly stats for ${time.label}:`;

  const messages = await channel.messages.fetch({ limit: 20 });
  let msg = messages.find(m => m.author.id === channel.client.user.id && m.content.includes(label));

  let lines = msg ? msg.content.split('\n') : [label];
  if (!msg) msg = await channel.send(label);

  if (currentIndex >= players.length) currentIndex = 0;
  const player = players[currentIndex];
  const stats = await getWeeklyStats(player, time);
  const emoji = stats.onRole >= currentGoal ? '✅' : '❌';
  const line = `👤 ${player.player}: ${stats.onRole}/${stats.total} on ${player.mainRole.toUpperCase()} ${emoji}`;

  const index = lines.findIndex(l => l.includes(`👤 ${player.player}:`));
  if (index !== -1) lines[index] = line;
  else lines.push(line);

  await msg.edit(lines.join('\n'));
  currentIndex++;
  console.log(`✅ Updated ${player.player}. Next up: ${players[currentIndex % players.length].player}`);
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
        console.error('❌ Initial LoL update error:', e.message);
      } finally {
        updateInProgress = false;
      }
    }
    
    setInterval(async () => {
      if (updateInProgress) return;
      updateInProgress = true;
      try {
        await updateMessage(channel);
      } catch (e) {
        console.error('❌ LoL update error:', e.message);
      } finally {
        updateInProgress = false;
      }
    }, 2 * 60 * 1000 + 10 * 1000); // 2m10s
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
    return message.reply(`🎯 League goal set to **${currentGoal}** on-role games`);
  }
};
