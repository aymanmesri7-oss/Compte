let vas = [];
let sortKey = 'accounts';
let sortDirection = -1;

const rows = document.getElementById('rows');
const search = document.getElementById('search');
const empty = document.getElementById('empty');

function render() {
  const query = search.value.trim().toLowerCase();
  const visible = vas
    .filter((va) => va.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const order = sortKey === 'name' ? a.name.localeCompare(b.name, 'fr') : a[sortKey] - b[sortKey];
      return sortDirection * order || a.name.localeCompare(b.name, 'fr');
    });

  rows.innerHTML = visible.map((va) => `
    <tr class="${va.accounts === 0 ? 'zero' : ''}" data-id="${esc(va.id)}">
      <td><a href="${vaUrl(va.id)}">${esc(va.name)}</a></td>
      <td class="num strong">${number.format(va.accounts)}</td>
      <td class="num">${number.format(va.previous)}</td>
    </tr>`).join('');

  empty.hidden = visible.length > 0;
  empty.textContent = vas.length ? 'Aucun VA ne correspond à cette recherche.' : 'Aucun VA pour cette date.';

  document.querySelectorAll('th[data-key]').forEach((th) => {
    if (th.dataset.key === sortKey) th.setAttribute('aria-sort', sortDirection > 0 ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
  });
}

search.addEventListener('input', render);

document.querySelector('thead').addEventListener('click', (event) => {
  const th = event.target.closest('th[data-key]');
  if (!th) return;
  if (th.dataset.key === sortKey) {
    sortDirection = -sortDirection;
  } else {
    sortKey = th.dataset.key;
    sortDirection = sortKey === 'name' ? 1 : -1;
  }
  render();
});

rows.addEventListener('click', (event) => {
  const row = event.target.closest('tr');
  if (row && !event.target.closest('a')) location.href = vaUrl(row.dataset.id);
});

startDatedRefresh(async (date) => {
  const [list, alerts] = await Promise.all([api(`/vas?date=${date}`), api(`/alerts?date=${date}`)]);
  if (date !== currentDate()) return; // l'utilisateur a changé de date entre-temps

  vas = list;
  setText('head-accounts', dayLabel(date));
  setText('head-previous', dayLabel(dayBefore(date)));
  render();

  const chip = document.getElementById('inactive-chip');
  chip.hidden = alerts.count === 0;
  chip.textContent = `${alerts.count} VA à 0 compte insta`;
});
