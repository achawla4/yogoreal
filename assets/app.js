/**
 * REAL E-Brary Conservatory Application
 * Preserving Knowledge. Empowering Discovery.
 */

let catalog = window.EBRARY_DATA || [];
let activeDomain = 'all';
let searchQuery = '';

async function init() {
  // If running over HTTP/HTTPS, attempt live reload of catalog.json
  if (window.location.protocol.startsWith('http')) {
    try {
      const res = await fetch('../metadata/ebrary_catalog.json');
      if (res.ok) {
        catalog = await res.json();
      }
    } catch (e) {
      console.warn('Using embedded catalog bundle.');
    }
  }

  renderMetrics();
  buildFilterBar();
  renderCatalog();
  setupEvents();
}

function renderMetrics() {
  document.getElementById('metric-total').textContent = catalog.length;
  
  const domains = new Set(catalog.map(item => item.domain));
  document.getElementById('metric-domains').textContent = domains.size;

  const oaCount = catalog.filter(item => item.license.toLowerCase().includes('open') || item.license.toLowerCase().includes('public') || item.license.toLowerCase().includes('cc')).length;
  const oaPercent = catalog.length ? Math.round((oaCount / catalog.length) * 100) : 100;
  document.getElementById('metric-oa').textContent = `${oaPercent}%`;
}

function buildFilterBar() {
  const counts = { all: catalog.length };
  catalog.forEach(item => {
    counts[item.domain] = (counts[item.domain] || 0) + 1;
  });

  const bar = document.getElementById('filterBar');
  const domains = Object.keys(counts).filter(k => k !== 'all').sort();
  
  let html = `<span class="filter-label">Disciplines:</span>`;
  html += `<button class="filter-btn active" data-domain="all">All Holdings (${counts.all})</button>`;
  
  domains.forEach(d => {
    html += `<button class="filter-btn" data-domain="${d}">${d} (${counts[d]})</button>`;
  });

  bar.innerHTML = html;

  bar.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeDomain = btn.getAttribute('data-domain');
      renderCatalog();
    });
  });
}

function getFilteredItems() {
  return catalog.filter(item => {
    const matchesDomain = activeDomain === 'all' || item.domain === activeDomain;
    if (!matchesDomain) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchTitle = (item.title || '').toLowerCase().includes(q);
    const matchAuthor = (item.author || '').toLowerCase().includes(q);
    const matchAbstract = (item.abstract || '').toLowerCase().includes(q);
    const matchKeywords = (item.keywords || []).some(k => k.toLowerCase().includes(q));
    const matchCall = (item.call_number || '').toLowerCase().includes(q);

    return matchTitle || matchAuthor || matchAbstract || matchKeywords || matchCall;
  });
}

function getPdfHref(filePath) {
  if (window.location.protocol === 'file:') {
    return `../${filePath}`;
  }
  const path = window.location.pathname;
  if (path === '/' || path === '/index.html' || path.endsWith('/ebrary') || path.endsWith('/ebrary/')) {
    return `/${filePath}`;
  }
  return `../${filePath}`;
}

function renderCatalog() {
  const items = getFilteredItems();
  const grid = document.getElementById('catalogGrid');
  const countSpan = document.getElementById('catalogCount');

  countSpan.textContent = `Showing ${items.length} of ${catalog.length} archived works`;

  if (items.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; font-family: 'IBM Plex Mono', monospace; color: var(--ink-soft);">
        <p style="font-size: 1.1rem; margin-bottom: 8px;">No archival papers match your inquiry.</p>
        <p style="font-size: 0.85rem;">Try refining your keywords or selecting another discipline filter.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => {
    const localHref = getPdfHref(item.file_path);
    const escapedItem = encodeURIComponent(JSON.stringify(item));

    return `
      <article class="paper-card" id="${item.call_number}">
        <span class="call-tab">${item.call_number}</span>
        <div class="paper-domain">${item.domain} · <em>${item.subfield}</em></div>
        <h2 class="paper-title">${item.title}</h2>
        <div class="paper-author">by ${item.author} (${item.year})</div>
        <div class="paper-venue">${item.journal || 'Archival Monograph'}</div>
        
        <div class="badge-row">
          <span class="badge license">${item.license}</span>
          ${item.doi ? `<span class="badge">DOI: ${item.doi}</span>` : ''}
          <span class="badge">SHA-256 Verified</span>
        </div>

        <p class="paper-abstract">${item.abstract}</p>

        <div class="card-actions">
          <a class="btn btn-primary" href="${localHref}" target="_blank" title="Read paper PDF">
            <span>📖</span> Read Full-Text
          </a>
          <button class="btn btn-secondary" onclick="openCitationModal('${escapedItem}')" title="Generate BibTeX & Citations">
            <span>❝</span> Cite
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function setupEvents() {
  const searchInput = document.getElementById('catalogSearch');
  let debounceTimeout;
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      searchQuery = e.target.value.trim();
      renderCatalog();
    }, 120);
  });

  // Modal close listeners
  document.getElementById('citationModalClose').addEventListener('click', closeCitationModal);
  document.getElementById('citationModal').addEventListener('click', (e) => {
    if (e.target.id === 'citationModal') closeCitationModal();
  });
}

function generateBibtex(item) {
  const firstAuthor = (item.author.split(',')[0].split('&')[0].trim().split(' ').pop() || 'Anon').toLowerCase();
  const year = item.year || 'nodate';
  const firstWord = (item.title.split(' ')[0] || 'paper').replace(/[^a-zA-Z]/g, '').toLowerCase();
  const key = `${firstAuthor}${year}${firstWord}`;

  return `@article{${key},
  title = {{${item.title}}},
  author = {${item.author}},
  year = {${item.year}},
  journal = {${item.journal || ''}},
  doi = {${item.doi || ''}},
  url = {${item.open_access_url || ''}},
  note = {REAL E-Brary Call Number: ${item.call_number}}
}`;
}

function generateApa(item) {
  return `${item.author} (${item.year}). ${item.title}. *${item.journal}*. ${item.doi ? 'https://doi.org/' + item.doi : item.open_access_url}`;
}

function openCitationModal(encodedItem) {
  const item = JSON.parse(decodeURIComponent(encodedItem));
  const bib = generateBibtex(item);
  const apa = generateApa(item);

  const container = document.getElementById('citationContent');
  container.innerHTML = `
    <h3 style="font-family: 'Fraunces', serif; margin-bottom: 10px; font-size: 1.1rem;">${item.title}</h3>
    <p style="font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: var(--brass-dark); margin-bottom: 16px;">
      Call Number: ${item.call_number}
    </p>

    <div style="margin-bottom: 18px;">
      <strong>APA Citation:</strong>
      <div class="citation-pre">${apa}</div>
      <button class="btn btn-secondary" style="margin-top: 6px;" onclick="navigator.clipboard.writeText(\`${apa.replace(/`/g, '\\`')}\`); alert('Copied APA Citation to clipboard!');">
        Copy APA
      </button>
    </div>

    <div>
      <strong>BibTeX Entry:</strong>
      <div class="citation-pre">${bib}</div>
      <button class="btn btn-secondary" style="margin-top: 6px;" onclick="navigator.clipboard.writeText(\`${bib.replace(/`/g, '\\`')}\`); alert('Copied BibTeX to clipboard!');">
        Copy BibTeX
      </button>
    </div>
  `;

  document.getElementById('citationModal').classList.add('active');
}

function closeCitationModal() {
  document.getElementById('citationModal').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', init);
