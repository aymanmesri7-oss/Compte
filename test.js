// Vérification rapide : npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Collection } = require('discord.js');

process.env.RAILWAY_VOLUME_MOUNT_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'kyce-'));
const db = require('./db/database');
const { extractLinks, scrapeChannel } = require('./bot/discord');

(async () => {
  // Extraction des liens
  assert.deepStrictEqual(extractLinks('https://www.instagram.com/bella.hejj?psln=ZW94NzkzeWE3Z2Rs'), [
    { url: 'https://www.instagram.com/bella.hejj?psln=ZW94NzkzeWE3Z2Rs', key: 'bella.hejj' },
  ]);
  assert.strictEqual(extractLinks('https://www.instagram.com/hannah.hdjje?srtk=MW5wbWV4ajRsa3N2dg==')[0].key, 'hannah.hdjje');
  assert.strictEqual(extractLinks('<https://instagram.com/Bella_/>.')[0].key, 'bella_');
  assert.strictEqual(extractLinks('instagram.com/sophia')[0].url, 'https://instagram.com/sophia');
  assert.deepStrictEqual(extractLinks('Good 💪'), []);
  assert.deepStrictEqual(extractLinks('https://notinstagram.com/x https://evil.com/instagram.com/x'), []);
  assert.strictEqual(extractLinks('https://instagram.com/a\nhttps://instagram.com/b').length, 2);

  // Historique : tous les messages lus, doublon ignoré, la première publication est conservée
  const now = Date.now();
  const channel = { id: 'c1', name: 'va-anna' };
  const author = { id: 'u1', bot: false, displayName: 'Anna' };
  const msg = (id, ageMs, content, a = author, c = channel) => [id, { id, author: a, content, channel: c, createdAt: new Date(now - ageMs) }];
  const newest = [...Array(100)].map((_, i) => msg(`m${i}`, 1000 * (i + 1), `https://instagram.com/user${i}`));
  const older = [
    msg('dup', 200000, 'https://instagram.com/user0?other=param'),
    msg('bot', 300000, 'https://instagram.com/frombot', { id: 'b', bot: true, displayName: 'Bot' }),
  ];
  let pages = [new Collection(newest), new Collection(older)];
  let fetches = 0;
  channel.messages = { fetch: async () => (fetches++, pages.shift() ?? new Collection()) };

  await scrapeChannel(channel);
  assert.strictEqual(fetches, 2);
  let va = db.getVA('u1', 1);
  assert.strictEqual(va.name, 'Anna');
  assert.strictEqual(va.total, 100, 'doublon et bot exclus');
  assert.strictEqual(va.links.length, 50, 'pagination à 50');
  assert.strictEqual(va.pages, 2);
  assert.strictEqual(db.getVA('u1', 2).links.at(-1).url, 'https://instagram.com/user0?other=param', 'plus ancienne publication gardée');
  assert.ok(db.channelScrapedAt('c1'));

  // Redémarrage : seul le neuf est relu, on s'arrête au dernier passage
  await new Promise((r) => setTimeout(r, 5));
  pages = [new Collection([msg('new', -60000, 'https://instagram.com/fresh'), ...newest])];
  fetches = 0;
  await scrapeChannel(channel);
  assert.strictEqual(fetches, 1, 'une seule page relue');
  assert.strictEqual(db.getVA('u1', 1).total, 101);

  // Stats à une date choisie
  const today = db.dayStr();
  const stats = db.getStats(today);
  assert.strictEqual(stats.date, today);
  assert.strictEqual(stats.activeVAs, 1);
  assert.strictEqual(db.getStats('2020-01-01').accounts, 0, 'date choisie respectée');
  assert.strictEqual(db.getVAs('2020-01-01').length, 0, 'pas de VA avant son premier lien');
  assert.strictEqual(db.getInactive(today).length, 0);
  assert.strictEqual(db.getVA('inconnu', 1), null);

  // Alerte "rien depuis plus d'1 jour" : 30 h oui, 10 h non, 8 jours (ancien VA) non
  const HOUR = 3600000;
  for (const [id, ageMs] of [['silent', 30 * HOUR], ['recent', 10 * HOUR], ['gone', 192 * HOUR]]) {
    const other = { id: `c-${id}`, name: `va-${id}` };
    const message = msg(id, ageMs, `https://instagram.com/${id}`, { id, bot: false, displayName: id }, other);
    other.messages = { fetch: async () => new Collection([message]) };
    await scrapeChannel(other);
  }
  assert.deepStrictEqual(db.getSilentVAs().map((v) => v.id), ['silent']);
  assert.strictEqual(db.getVA('silent', 1).total, 1);

  console.log('OK : tous les tests passent');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
