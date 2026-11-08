// Outils partagés par les 3 pages, puis logique de la page principale.

const REFRESH_MS = 60000;
const DAY_MS = 86400000;
const number = new Intl.NumberFormat('fr-FR');
const dateTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
const weekday = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short' });
const shortDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'full' });

// Les noms viennent de Discord : ils doivent toujours être échappés avant d'aller dans le HTML.
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDateTime = (iso) => `${dateTime.format(new Date(iso))} UTC`;
const fmtDay = (day) => `${day.slice(8)}/${day.slice(5, 7)}`;
const vaUrl = (id) => `va-detail.html?id=${encodeURIComponent(id)}`;

async function api(path) {
  const response = await fetch(`/api${path}`);
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  return response.json();
}

function setText(id, value) {
  document.getElementById(id).textContent = typeof value === 'number' ? number.format(value) : value;
}

function startRefresh(load) {
  const status = document.getElementById('status');
  const run = async () => {
    try {
      await load();
      status.textContent = '';
      status.classList.remove('error');
    } catch {
      status.textContent = 'Serveur injoignable, nouvel essai dans 60 s';
      status.classList.add('error');
    }
  };
  run();
  setInterval(run, REFRESH_MS);
  return run;
}

// Date choisie, gardée dans l'adresse. Sans date, on suit le jour en cours, même après minuit UTC.
const dayAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
const dayBefore = (day) => new Date(Date.parse(day) - DAY_MS).toISOString().slice(0, 10);

function dayLabel(day) {
  if (day === dayAgo(0)) return "Aujourd'hui";
  if (day === dayAgo(1)) return 'Hier';
  return shortDate.format(new Date(day));
}

const dateInUrl = new URLSearchParams(location.search).get('date');
let chosenDate = /^\d{4}-\d{2}-\d{2}$/.test(dateInUrl) ? dateInUrl : null;
const currentDate = () => chosenDate || dayAgo(0);

// Nombre de semaines affichées en arrière dans la bande de jours (0 = se termine aujourd'hui).
let weekOffset = Math.max(0, Math.floor((Date.parse(dayAgo(0)) - Date.parse(currentDate())) / (7 * DAY_MS)) || 0);

function renderWeek() {
  const selected = currentDate();
  const days = Array.from({ length: 7 }, (_, i) => dayAgo(weekOffset * 7 + 6 - i));

  document.getElementById('week').innerHTML = `
    <button type="button" class="week-arrow" data-move="1" aria-label="Semaine précédente">‹</button>
    ${days.map((day) => `
      <button type="button" class="day${day === selected ? ' selected' : ''}${day === dayAgo(0) ? ' today' : ''}"
              data-day="${day}" aria-pressed="${day === selected}" aria-label="${esc(longDate.format(new Date(day)))}">
        <span class="day-name">${esc(weekday.format(new Date(day)).slice(0, 3))}</span>
        <span class="day-number">${Number(day.slice(8))}</span>
      </button>`).join('')}
    <button type="button" class="week-arrow" data-move="-1" aria-label="Semaine suivante"${weekOffset === 0 ? ' disabled' : ''}>›</button>`;

  const suffix = chosenDate ? `?date=${chosenDate}` : '';
  document.querySelectorAll('[data-keep-date]').forEach((link) => {
    link.href = link.getAttribute('href').split('?')[0] + suffix;
  });
}

function startDatedRefresh(load) {
  const refresh = startRefresh(async () => {
    renderWeek();
    await load(currentDate());
  });

  document.getElementById('week').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.move) {
      weekOffset += Number(button.dataset.move);
      renderWeek();
      return;
    }
    chosenDate = button.dataset.day === dayAgo(0) ? null : button.dataset.day;
    history.replaceState(null, '', chosenDate ? `?date=${chosenDate}` : location.pathname);
    refresh();
  });
}

const charts = {};

function drawChart(id, type, labels, data, seriesName) {
  if (charts[id]) {
    charts[id].data.labels = labels;
    charts[id].data.datasets[0].data = data;
    charts[id].update('none');
    return;
  }

  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();

  charts[id] = new Chart(document.getElementById(id), {
    type,
    data: {
      labels,
      datasets: [{
        label: seriesName,
        data,
        backgroundColor: color('--blue'),
        borderRadius: 6,
        maxBarThickness: 28,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: color('--muted'), maxRotation: 0, autoSkipPadding: 12 } },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: color('--separator') },
          ticks: { color: color('--muted'), precision: 0 },
        },
      },
    },
  });
}

function timeSince(iso) {
  const hours = Math.floor((Date.now() - Date.parse(iso)) / 3600000);
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} j`;
}

function renderSilentAlert(silent) {
  document.getElementById('alert').hidden = silent.length === 0;
  if (!silent.length) return;
  setText('alert-title', `${silent.length} VA sans compte insta depuis plus d'1 jour`);
  document.getElementById('alert-list').innerHTML = silent.map((va) => `
    <li><a href="${vaUrl(va.id)}">${esc(va.name)}</a><span>depuis ${timeSince(va.lastAt)}</span></li>`).join('');
}

async function loadDashboard(date) {
  const [stats, alerts] = await Promise.all([api(`/stats?date=${date}`), api(`/alerts?date=${date}`)]);
  if (date !== currentDate()) return; // l'utilisateur a changé de date entre-temps

  setText('day-label', dayLabel(date));
  setText('accounts', stats.accounts);
  setText('previous-label', dayLabel(dayBefore(date)));
  setText('previous', stats.previous);
  setText('inactive', alerts.count);
  setText('inactive-hint', `${dayLabel(date)}, sur ${number.format(stats.activeVAs)} VA actifs`);
  renderSilentAlert(alerts.silent);
}

if (document.getElementById('accounts')) startDatedRefresh(loadDashboard);
