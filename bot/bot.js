const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const lolTracker = require('./lolTracker/lolTracker');
const valorantTracker = require('./valorantTracker/valorantTracker');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log('✅ Bot is online and trackers are starting...');

  try {
    await lolTracker.start(client);        // ⏳ Starts LoL tracker
    await valorantTracker.start(client);   // ⏳ Starts Valorant tracker
  } catch (err) {
    console.error('❌ Tracker startup error:', err);
  }
});

client.on('messageCreate', async (message) => {
  await lolTracker.handleCommand(message);
  await valorantTracker.handleCommand(message);
});

client.login(process.env.DISCORD_TOKEN);
