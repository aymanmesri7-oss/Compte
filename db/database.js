const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Railway fournit RAILWAY_VOLUME_MOUNT_PATH dès qu'un volume est attaché au service.
const dir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'kyce.sqlite'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS vas (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS links (
    id           INTEGER PRIMARY KEY,
    va_id        TEXT NOT NULL REFERENCES vas(id),
    url          TEXT NOT NULL,
    link_key     TEXT NOT NULL,
    posted_at    TEXT NOT NULL,
    day          TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    UNIQUE (va_id, link_key)
  );
  CREATE INDEX IF NOT EXISTS links_day       ON links(day);
  CREATE INDEX IF NOT EXISTS links_va_day    ON links(va_id, day);
  CREATE INDEX IF NOT EXISTS links_va_posted ON links(va_id, posted_at);

  CREATE TABLE IF NOT EXISTS channels (
    id         TEXT PRIMARY KEY,
    scraped_at TEXT NOT NULL
  );
`);

const LINKS_PER_PAGE = 50;
// Un VA est "actif" s'il a posté au moins un lien sur cette période.
// Sans ça, les anciens VA récupérés dans l'historique resteraient en alerte pour toujours.
const ACTIVE_DAYS = 7;
const DAY_MS = 86400000;

// Toutes les dates sont en UTC.
const dayStr = (daysAgo = 0) => new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
const lastDays = (n) => Array.from({ length: n }, (_, i) => dayStr(n - 1 - i));
const mondayStr = () => dayStr((new Date().getUTCDay() + 6) % 7);
const shiftDay = (day, delta) => new Date(Date.parse(day) + delta * DAY_MS).toISOString().slice(0, 10);

const upsertVaName = db.prepare(
  'INSERT INTO vas (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name'
);
const insertVaIfNew = db.prepare('INSERT OR IGNORE INTO vas (id, name) VALUES (?, ?)');
// En cas de doublon, on garde la toute première publication du lien.
const insertLink = db.prepare(`
  INSERT INTO links (va_id, url, link_key, posted_at, day, channel_name)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(va_id, link_key) DO UPDATE SET
    url = excluded.url, posted_at = excluded.posted_at,
    day = excluded.day, channel_name = excluded.channel_name
  WHERE excluded.posted_at < links.posted_at
`);

// Renvoie 1 si le lien a été ajouté, 0 si c'était un doublon.
function saveLink({ vaId, vaName, url, key, postedAt, channelName, updateName }) {
  (updateName ? upsertVaName : insertVaIfNew).run(vaId, vaName);
  return Number(insertLink.run(vaId, url, key, postedAt, postedAt.slice(0, 10), channelName).changes);
}

function channelScrapedAt(id) {
  return db.prepare('SELECT scraped_at FROM channels WHERE id = ?').get(id)?.scraped_at ?? null;
}

function markChannelScraped(id, scrapedAt) {
  db.prepare(
    'INSERT INTO channels (id, scraped_at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET scraped_at = excluded.scraped_at'
  ).run(id, scrapedAt);
}

function countsByDay(days, vaId) {
  const rows = vaId
    ? db.prepare('SELECT day, COUNT(*) AS c FROM links WHERE day >= ? AND va_id = ? GROUP BY day').all(days[0], vaId)
    : db.prepare('SELECT day, COUNT(*) AS c FROM links WHERE day >= ? GROUP BY day').all(days[0]);
  const counts = new Map(rows.map((r) => [r.day, r.c]));
  return days.map((day) => ({ day, count: counts.get(day) || 0 }));
}

// VA actifs sur les 7 jours se terminant à cette date, sans aucun lien ce jour-là.
function getInactive(day) {
  return db.prepare(`
    SELECT id, name FROM vas
    WHERE id IN (SELECT va_id FROM links WHERE day BETWEEN ? AND ?)
      AND id NOT IN (SELECT va_id FROM links WHERE day = ?)
    ORDER BY name COLLATE NOCASE
  `).all(shiftDay(day, 1 - ACTIVE_DAYS), day, day);
}

// VA actifs dont le dernier compte posté date de plus de 24 heures, le plus ancien d'abord.
function getSilentVAs() {
  return db.prepare(`
    SELECT v.id, v.name, MAX(l.posted_at) AS lastAt
    FROM vas v JOIN links l ON l.va_id = v.id
    GROUP BY v.id
    HAVING lastAt < ? AND lastAt >= ?
    ORDER BY lastAt
  `).all(new Date(Date.now() - DAY_MS).toISOString(), new Date(Date.now() - ACTIVE_DAYS * DAY_MS).toISOString());
}

function getStats(day) {
  const countOn = (d) => db.prepare('SELECT COUNT(*) AS c FROM links WHERE day = ?').get(d).c;
  return {
    date: day,
    accounts: countOn(day),
    previous: countOn(shiftDay(day, -1)),
    activeVAs: db.prepare('SELECT COUNT(DISTINCT va_id) AS c FROM links WHERE day BETWEEN ? AND ?')
      .get(shiftDay(day, 1 - ACTIVE_DAYS), day).c,
  };
}

// Un VA n'apparaît pas sur les dates antérieures à son tout premier lien.
function getVAs(day) {
  return db.prepare(`
    SELECT v.id, v.name, SUM(l.day = ?) AS accounts, SUM(l.day = ?) AS previous
    FROM vas v JOIN links l ON l.va_id = v.id
    GROUP BY v.id
    HAVING MIN(l.day) <= ?
    ORDER BY accounts DESC, v.name COLLATE NOCASE
  `).all(day, shiftDay(day, -1), day);
}

function getVA(id, requestedPage) {
  const va = db.prepare('SELECT id, name FROM vas WHERE id = ?').get(id);
  if (!va) return null;

  const summary = db.prepare(`
    SELECT SUM(day = ?) AS today, SUM(day = ?) AS yesterday, SUM(day >= ?) AS week,
           COUNT(*) AS total, MAX(posted_at) AS lastLinkAt
    FROM links WHERE va_id = ?
  `).get(dayStr(), dayStr(1), mondayStr(), id);

  const pages = Math.max(1, Math.ceil(summary.total / LINKS_PER_PAGE));
  const page = Math.min(pages, Math.max(1, parseInt(requestedPage, 10) || 1));
  const links = db.prepare(`
    SELECT url, posted_at AS postedAt, channel_name AS channelName
    FROM links WHERE va_id = ?
    ORDER BY posted_at DESC, id DESC LIMIT ? OFFSET ?
  `).all(id, LINKS_PER_PAGE, (page - 1) * LINKS_PER_PAGE);

  return { ...va, ...summary, last14: countsByDay(lastDays(14), id), links, page, pages };
}

module.exports = {
  dayStr, saveLink, channelScrapedAt, markChannelScraped,
  getStats, getInactive, getSilentVAs, getVAs, getVA,
};
