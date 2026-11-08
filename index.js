// Le .env doit être lu avant de charger le reste. Sur Railway il n'existe pas : les variables viennent du service.
try { process.loadEnvFile(); } catch {}

const path = require('path');
const express = require('express');
const api = require('./server/api');
const bot = require('./bot/discord');

const app = express();
app.use('/api', api);
app.use(express.static(path.join(__dirname, 'public')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[web] Dashboard disponible sur http://localhost:${port}`));

bot.start();
