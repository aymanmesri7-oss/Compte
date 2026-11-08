const { Client, Events, GatewayIntentBits, ChannelType } = require('discord.js');
const db = require('../db/database');

const LINK_RE = /(?<![\w.\/-])(?:https?:\/\/)?(?:[\w-]+\.)*instagram\.com\/[^\s<>"'`)\]|]+/gi;

// Toutes les 5 minutes, on relit les salons pas encore lus : nouveaux salons, droits ajoutés après coup, erreurs.
const RETRY_MS = 5 * 60000;

const running = new Set();
const failures = new Map();
let client = null;

// Renvoie les liens du texte. "key" identifie le compte, sans les paramètres :
// le même compte reposté avec un autre ?psln=... reste un doublon.
function extractLinks(text) {
  return (text.match(LINK_RE) || []).flatMap((raw) => {
    const clean = raw.replace(/[.,;:!?*~]+$/, '');
    const url = /^https?:/i.test(clean) ? clean : `https://${clean}`;
    const key = url
      .replace(/^.*?instagram\.com\/+/i, '')
      .split(/[?#]/)[0]
      .replace(/\/+$/, '')
      .toLowerCase();
    return key ? [{ url, key }] : [];
  });
}

// Discord limite une catégorie à 50 salons : on prend toutes celles dont le nom contient CATEGORY_NAME
// ("SALON PERSO 2", "📸 SALON PERSO"...). Comparaison sans casse, car Discord affiche tout en majuscules.
function isVaChannel(channel) {
  const category = (process.env.CATEGORY_NAME || 'SALON PERSO').trim().toLowerCase();
  return channel.type === ChannelType.GuildText && Boolean(channel.parent?.name.toLowerCase().includes(category));
}

function saveMessage(message, live) {
  if (message.author.bot) return 0;
  let added = 0;
  for (const { url, key } of extractLinks(message.content)) {
    added += db.saveLink({
      vaId: message.author.id,
      vaName: message.member?.displayName ?? message.author.displayName,
      url,
      key,
      postedAt: message.createdAt.toISOString(),
      channelName: message.channel.name,
      // L'historique ne contient pas les pseudos de serveur et va du récent vers l'ancien :
      // seul un message en direct peut changer le nom d'un VA déjà connu.
      updateName: live,
    });
  }
  return added;
}

// Premier passage : tout l'historique du salon.
// Passages suivants : seulement ce qui a été posté depuis le dernier passage (bot éteint, redéploiement).
async function scrapeChannel(channel) {
  if (running.has(channel.id)) return;
  running.add(channel.id);

  const startedAt = new Date().toISOString();
  const since = db.channelScrapedAt(channel.id);
  try {
    let before;
    let added = 0;
    let reachedSince = false;
    while (!reachedSince) {
      const page = await channel.messages.fetch({ limit: 100, before, cache: false });
      for (const message of page.values()) {
        if (since && message.createdAt.toISOString() < since) {
          reachedSince = true;
          break;
        }
        added += saveMessage(message, false);
      }
      if (page.size < 100) break;
      before = page.last().id;
    }
    db.markChannelScraped(channel.id, startedAt);
    failures.delete(channel.id);
    console.log(`[bot] #${channel.name} : ${added} lien(s) ajouté(s) depuis l'historique`);
  } catch (error) {
    // Le salon n'est pas marqué comme traité : il sera repris au prochain passage.
    if (!failures.has(channel.id)) console.error(`[bot] Lecture impossible de #${channel.name} : ${error.message}`);
    failures.set(channel.id, error.message);
  } finally {
    running.delete(channel.id);
  }
}

function start() {
  if (!process.env.DISCORD_TOKEN) {
    console.error('[bot] DISCORD_TOKEN est vide : le bot ne démarre pas, seul le dashboard tourne. Voir le README.');
    return;
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });

  client.on(Events.MessageCreate, (message) => {
    try {
      if (isVaChannel(message.channel)) saveMessage(message, true);
    } catch (error) {
      console.error(`[bot] Message non enregistré : ${error.message}`);
    }
  });

  // Nouveau salon, salon déplacé dans la catégorie, ou droits d'accès ajoutés : pas besoin de redémarrer.
  const onChannelChange = (channel) => {
    if (isVaChannel(channel) && !db.channelScrapedAt(channel.id)) scrapeChannel(channel);
  };
  client.on(Events.ChannelCreate, onChannelChange);
  client.on(Events.ChannelUpdate, (_, channel) => onChannelChange(channel));
  client.on(Events.Error, (error) => console.error(`[bot] ${error.message}`));

  client.once(Events.ClientReady, async () => {
    const channels = [...client.channels.cache.filter(isVaChannel).values()];
    console.log(`[bot] Connecté en tant que ${client.user.tag}, ${channels.length} salon(s) trouvé(s)`);
    if (!channels.length) {
      console.error(`[bot] Aucun salon dans la catégorie "${process.env.CATEGORY_NAME}" : vérifie CATEGORY_NAME et l'accès du bot.`);
    }
    // discord.js met les requêtes en file et respecte seul les limites de Discord.
    await Promise.all(channels.map((channel) => scrapeChannel(channel)));
    console.log('[bot] Historique à jour');

    setInterval(() => {
      for (const channel of client.channels.cache.values()) {
        if (isVaChannel(channel) && !db.channelScrapedAt(channel.id)) scrapeChannel(channel);
      }
    }, RETRY_MS);
  });

  client.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error(`[bot] Connexion à Discord impossible : ${error.message}`);
    console.error('[bot] Vérifie le token et active "Message Content Intent" sur le portail développeur. Voir le README.');
  });
}

// Ce que le bot voit vraiment : tous les salons textuels, suivis ou non, lus ou non.
function getStatus() {
  const channels = client ? [...client.channels.cache.values()].filter((c) => c.type === ChannelType.GuildText) : [];
  return {
    connected: Boolean(client?.isReady()),
    reading: running.size,
    channels: channels.map((c) => ({
      name: c.name,
      category: c.parent?.name ?? null,
      watched: isVaChannel(c),
      read: Boolean(db.channelScrapedAt(c.id)),
      error: failures.get(c.id) ?? null,
    })),
  };
}

module.exports = { start, extractLinks, scrapeChannel, isVaChannel, getStatus };
