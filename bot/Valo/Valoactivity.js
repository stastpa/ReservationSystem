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

const CHANNEL_ID = process.env.CHANNEL_ID_VALO;
const HENRIK_API_KEY = process.env.HENRIK_API_KEY;
const DISCORD_TOKEN = process.env.CLIENT_ID;
const ADMINS = ['344531980567838722'];

const players = require('./players.json');
let currentGoal = 10;

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
    start: start.getTime(),
    end: end.getTime(),
    label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`
  };
}

async function getPUUID(gameName, tagLine) {
  const url = `https://api.henrikdev.xyz/valorant/v2/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const res = await fetch(url, {
    headers: { Authorization: HENRIK_API_KEY }
  });
  if (!res.ok) throw new Error(`Failed to fetch account data: ${res.statusText}`);
  const data = await res.json();
  console.log(`🔍 Retrieved PUUID for ${gameName}#${tagLine}: ${data.data.puuid}`);
  return data.data.puuid;
}

async function getMatches(puuid) {
  const url = `https://api.henrikdev.xyz/valorant/v1/by-puuid/stored-matches/eu/${puuid}?size=100`;
  const res = await fetch(url, {
    headers: { Authorization: HENRIK_API_KEY }
  });
  if (!res.ok) throw new Error(`Failed to fetch match data: ${res.statusText}`);
  const data = await res.json();
  return data.data;
}

async function getWeeklyMatchCount(player, timeRange) {
  let total = 0;
  for (const account of player.accounts) {
    const [gameName, tagLine] = account.split('#');
    try {
      const puuid = await getPUUID(gameName, tagLine);
      const matches = await getMatches(puuid);

      console.log(`📥 Retrieved ${matches.length} stored matches for ${gameName}#${tagLine}`);

      const recent = matches.filter(match => {
        const start = new Date(match.meta.started_at).getTime();
        return start >= timeRange.start && start <= timeRange.end;
      });

      console.log(`📅 ${recent.length} matches in current week`);
      total += recent.length;
    } catch (err) {
      console.warn(`⚠️ Could not fetch data for ${account}:`, err.message);
    }
  }
  return total;
}

async function updateWeeklyMessage(channel) {
  const timeRange = getCurrentWeekDateRange();
  const weekLabel = `📊 Weekly Valorant stats for ${timeRange.label}:`;

  const messages = await channel.messages.fetch({ limit: 20 });
  let message = messages.find(msg =>
    msg.author.id === client.user.id &&
    msg.content.startsWith('📊 Weekly Valorant stats for') &&
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
  const matchCount = await getWeeklyMatchCount(player, timeRange);
  const passedGoal = matchCount >= currentGoal;
  const goalEmoji = passedGoal ? '✅' : '❌';
  const line = `👤 ${player.player}: ${matchCount} ${goalEmoji}`;

  const existingIndex = lines.findIndex(l => l.includes(`👤 ${player.player}:`));
  if (existingIndex !== -1) {
    lines[existingIndex] = line;
  } else {
    lines.push(line);
  }

  await message.edit(lines.join('\n'));
  currentPlayerIndex++;
  console.log(`✅ Updated ${player.player}. Next: ${players[currentPlayerIndex % players.length].player}`);
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
    return message.reply(`🎯 Goal set to **${currentGoal}** matches per player.`);
  }
});

client.once('ready', async () => {
  console.log('✅ Bot is ready. Starting updates immediately.');

  const channel = await client.channels.fetch(CHANNEL_ID);

  // Run the first update immediately
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

  // Repeat every 1 minute and 10 seconds
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
  }, 70 * 1000); // 1 minute and 10 seconds
});

client.login(DISCORD_TOKEN);