const id = new URLSearchParams(location.search).get('id');
let currentPage = 1;

function showNotFound() {
  setText('name', 'VA introuvable');
  document.getElementById('content').hidden = true;
}

async function load() {
  if (!id) return showNotFound();

  let va;
  try {
    va = await api(`/va/${encodeURIComponent(id)}?page=${currentPage}`);
  } catch (error) {
    if (error.status === 404) return showNotFound();
    throw error;
  }

  currentPage = va.page;
  document.title = `KYCE · ${va.name}`;
  setText('name', va.name);
  setText('last-link', fmtDateTime(va.lastLinkAt));
  setText('today', va.today);
  setText('yesterday', va.yesterday);
  setText('week-count', va.week);
  setText('total', va.total);
  document.getElementById('content').hidden = false;

  drawChart('chart-14', 'bar', va.last14.map((d) => fmtDay(d.day)), va.last14.map((d) => d.count), 'Comptes');

  document.getElementById('links').innerHTML = va.links.map((link) => `
    <li>
      <a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.url)}</a>
      <span class="meta">${esc(fmtDateTime(link.postedAt))}</span>
    </li>`).join('');

  setText('page-info', `Page ${va.page} / ${va.pages}`);
  document.getElementById('prev').disabled = va.page <= 1;
  document.getElementById('next').disabled = va.page >= va.pages;
}

async function changePage(delta) {
  currentPage += delta;
  await load();
  document.getElementById('links-card').scrollIntoView();
}

document.getElementById('prev').addEventListener('click', () => changePage(-1));
document.getElementById('next').addEventListener('click', () => changePage(1));

startRefresh(load);
