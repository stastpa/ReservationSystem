require('dotenv').config();

// Start Express server
require('./server/server');

// Start Discord bots
require('./bot/lol/LoLactivity');
require('./bot/Valo/Valoactivity');