const express = require('express');
const db = require('../db/database');
const bot = require('../bot/discord');

const router = express.Router();

function isValidDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(Date.parse(value) || 0).toISOString().slice(0, 10) === value;
}

function withDay(req, res, next) {
  req.day = req.query.date ?? db.dayStr();
  if (!isValidDay(req.day)) return res.status(400).json({ error: 'Date invalide' });
  next();
}

router.get('/bot', (req, res) => res.json(bot.getStatus()));

router.get('/stats', withDay, (req, res) => res.json(db.getStats(req.day)));

router.get('/alerts', withDay, (req, res) => {
  const inactive = db.getInactive(req.day);
  res.json({ count: inactive.length, inactive, silent: db.getSilentVAs() });
});

router.get('/vas', withDay, (req, res) => res.json(db.getVAs(req.day)));

router.get('/va/:id', (req, res) => {
  const va = db.getVA(req.params.id, req.query.page);
  if (!va) return res.status(404).json({ error: 'VA introuvable' });
  res.json(va);
});

module.exports = router;
