const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

let updateInProgress = false;
let currentPlayerIndex = 0;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_ID = process.env.CHANNEL_ID_LOL;
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMINS = ['344531980567838722'];

const ROLE_MAP = {
  'TOP': 'TOP',
  'JUNGLE': 'JUNGLE',
  'MID': 'MIDDLE',
  'ADC': 'BOTTOM',
  'SUPPORT': 'UTILITY'
};

const players = require('./players.json');
let currentGoal = 12;

function getCurrentWeekDateRange() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
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

async function getPUUIDFromRiotId(gameName, tagLine) {
  const url = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${RIOT_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Riot ID: ${gameName}#${tagLine}`);
  const data = await res.json();
  return data.puuid;
}

async function getMatchIds(puuid, startTime, endTime) {
  const url = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${startTime}&endTime=${endTime}&count=100&api_key=${RIOT_API_KEY}`;
  const res = await fetch(url);
  return await res.json();
}

async function getMatchStats(matchId, puuid) {
  const url = `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${RIOT_API_KEY}`;
  const res = await fetch(url);
  const match = await res.json();

  if (!match.info || match.info.queueId !== 420) return null;
  const duration = (match.info.gameEndTimestamp - match.info.gameStartTimestamp) / 1000;
  if (duration < 300) return null;

  const player = match.info.participants.find(p => p.puuid === puuid);
  return player?.teamPosition || null;
}

async function getWeeklyStatsForPlayer(player, timeRange) {
  let total = 0;
  let onRole = 0;
  for (const account of player.accounts) {
    const [gameName, tagLine] = account.split('#');
    try {
      const puuid = await getPUUIDFromRiotId(gameName, tagLine);
      const matchIds = await getMatchIds(puuid, timeRange.start, timeRange.end);
      for (const matchId of matchIds) {
        const role = await getMatchStats(matchId, puuid);
        if (role && role !== 'INVALID') {
          total++;
          if (role === ROLE_MAP[player.mainRole.toUpperCase()]) {
            onRole++;
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️ Could not fetch data for ${account}:`, err.message);
    }
  }
  return { total, onRole };
}

async function updateWeeklyMessage(channel) {
  const timeRange = getCurrentWeekDateRange();
  const weekLabel = `📊 Weekly stats for ${timeRange.label}:`;

  const messages = await channel.messages.fetch({ limit: 20 });
  let message = messages.find(msg =>
    msg.author.id === client.user.id &&
    msg.content.startsWith('📊 Weekly stats for') &&
    msg.content.includes(timeRange.label)
  );

  let lines;
  if (message) {
    lines = message.content.split('\n');
  } else {
    lines = [weekLabel];
    message = await channel.send(lines.join('\n'));
  }

  if (currentPlayerIndex >= players.length) {
    currentPlayerIndex = 0;
  }

  const player = players[currentPlayerIndex];
  const stats = await getWeeklyStatsForPlayer(player, timeRange);
  const passedGoal = stats.onRole >= currentGoal;
  const goalEmoji = passedGoal ? '✅' : '❌';
  const line = `👤 ${player.player}: ${stats.onRole}/${stats.total} on ${player.mainRole.toUpperCase()} ${goalEmoji}`;

  const existingIndex = lines.findIndex(l => l.includes(`👤 ${player.player}:`));
  if (existingIndex !== -1) {
    lines[existingIndex] = line;
  } else {
    lines.push(line);
  }

  await message.edit(lines.join('\n'));

  currentPlayerIndex++;
  console.log(`✅ Updated ${player.player}. Next up: ${players[currentPlayerIndex % players.length].player}`);
}

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!')) return;

  if (message.content.startsWith('!setgoal')) {
    const [_, value] = message.content.split(' ');
    const num = parseInt(value);

    if (!ADMINS.includes(message.author.id)) {
      return message.reply('🚫 You are not authorized to change the goal.');
    }
    if (isNaN(num)) return message.reply('❌ Invalid number.');

    currentGoal = num;
    return message.reply(`🎯 Goal set to **${currentGoal}** games on main role for all players.`);
  }
});

client.once('ready', async () => {
  console.log('✅ Bot is ready. Starting updates immediately.');

  const channel = await client.channels.fetch(CHANNEL_ID);

  // Immediately run the first update
  if (!updateInProgress) {
    updateInProgress = true;
    try {
      await updateWeeklyMessage(channel);
    } catch (err) {
      console.error('❌ Initial update failed:', err.message);
    } finally {
      updateInProgress = false;
    }
  }

  // Repeat every 2 minutes and 10 seconds
  setInterval(async () => {
    if (updateInProgress) return;
    updateInProgress = true;

    try {
      if (currentPlayerIndex >= players.length) {
        currentPlayerIndex = 0;
      }

      await updateWeeklyMessage(channel);
    } catch (err) {
      console.error('❌ Scheduled update failed:', err.message);
    } finally {
      updateInProgress = false;
    }
  }, 2 * 60 * 1000 + 10 * 1000); // 2 minutes and 10 seconds
});

client.login(DISCORD_TOKEN);
