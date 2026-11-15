/* ============================================================
   BABEH Documentation — Shared JavaScript
   Sidebar, TOC, Theme, Language, Mermaid
   ============================================================ */

/* --- Page Registry (no icons) --- */
const PAGES = [
  { id: 'getting-started',   title: 'Getting Started',           section: 'Basics' },
  { id: 'knowledge-base',    title: 'Knowledge Base',            section: 'Basics' },
  { id: 'pricing-database',  title: 'Pricing Database',          section: 'Basics' },
  { id: 'product-specs',     title: 'Product Specifications',    section: 'Basics' },
  { id: 'financing-rates',   title: 'Financing Rates',           section: 'Basics' },
  { id: 'search-engine',     title: 'Search Engine',             section: 'Basics' },
  { id: 'api-reference',     title: 'API Reference',             section: 'Technical' },
  { id: 'architecture',      title: 'Architecture',              section: 'Technical' },
  { id: 'settings',          title: 'Setting',                   section: 'Technical' },
  { id: 'user-management',   title: 'User Management',           section: 'Admin' },
  { id: 'analytics',         title: 'Analytics & Insights',      section: 'Admin' },
  { id: 'widget-integration',title: 'Widget Integration',        section: 'Admin' },
  { id: 'security',          title: 'Security',                  section: 'Admin' },
  { id: 'troubleshooting',   title: 'Troubleshooting',           section: 'Reference' },
  { id: 'appendix',          title: 'Appendix',                  section: 'Reference' },
];

/* --- Helpers --- */
function getCurrentPage() {
  const path = window.location.pathname;
  const match = path.match(/\/(?:en|id)\/(.+)\.html/);
  return match ? match[1] : null;
}

function getBasePath() {
  const path = window.location.pathname;
  if (path.includes('/en/') || path.includes('/id/')) return '..';
  return '.';
}

function getLang() {
  const path = window.location.pathname;
  if (path.includes('/id/')) return 'id';
  return 'en';
}

/* --- Theme --- */
function initTheme() {
  const saved = localStorage.getItem('docs-theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
}
initTheme();

/* --- Sidebar Injection --- */
function injectSidebar() {
  const root = document.getElementById('sidebar-root');
  if (!root) return;

  const base = getBasePath();
  const lang = getLang();
  const current = getCurrentPage();

  let sections = {};
  PAGES.forEach(p => {
    if (!sections[p.section]) sections[p.section] = [];
    sections[p.section].push(p);
  });

  let navHTML = '';
  Object.entries(sections).forEach(([sec, pages]) => {
    navHTML += `<div class="nav-section-label">${sec}</div>`;
    pages.forEach(p => {
      const active = p.id === current ? ' active' : '';
      navHTML += `<a class="nav-item${active}" href="${base}/${lang}/${p.id}.html">${p.title}</a>`;
    });
  });

  const otherLang = lang === 'en' ? 'id' : 'en';
  const otherLabel = lang === 'en' ? 'ID' : 'EN';
  const langHref = current ? `${base}/${otherLang}/${current}.html` : `${base}/index.html`;

  root.innerHTML = `
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-header" onclick="location.href='${base}/index.html'">
        <div class="sidebar-brand">BABEH!Docs</div>
        <div class="sidebar-brand-sub">KBaaS Commerce Documentation</div>
      </div>
      <div class="sidebar-nav">${navHTML}</div>
      <div class="sidebar-footer">
        <button class="sidebar-btn" onclick="toggleTheme()" id="theme-btn">Light</button>
        <a class="sidebar-btn" href="${langHref}">${otherLabel}</a>
      </div>
    </nav>
    <div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div>
  `;

  updateThemeBtn();
}

/* --- Theme Toggle --- */
function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  if (isLight) {
    html.removeAttribute('data-theme');
    localStorage.setItem('docs-theme', 'dark');
  } else {
    html.setAttribute('data-theme', 'light');
    localStorage.setItem('docs-theme', 'light');
  }
  updateThemeBtn();
  if (window.mermaid) {
    try { mermaid.contentLoaded(); } catch(e) {}
  }
}

function updateThemeBtn() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  btn.textContent = isLight ? 'Dark' : 'Light';
}

/* --- Mobile Sidebar --- */
function injectHamburger() {
  const existing = document.querySelector('.hamburger');
  if (existing) {
    existing.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
      document.getElementById('sidebar-overlay')?.classList.toggle('open');
    });
  }
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
}

/* --- Breadcrumb --- */
function injectBreadcrumb() {
  const root = document.getElementById('breadcrumb-root');
  if (!root) return;
  const base = getBasePath();
  const lang = getLang();
  const current = getCurrentPage();
  const page = PAGES.find(p => p.id === current);
  if (!page) return;

  root.innerHTML = `
    <nav class="breadcrumb">
      <a href="${base}/index.html">Home</a>
      <span class="sep">/</span>
      <a href="${base}/${lang}/${PAGES[0].id}.html">${lang === 'en' ? 'English' : 'Indonesia'}</a>
      <span class="sep">/</span>
      <span>${page.title}</span>
    </nav>
  `;
}

/* --- TOC --- */
function buildTOC() {
  const root = document.getElementById('toc-root');
  if (!root) return;
  const main = document.querySelector('.doc-main');
  if (!main) return;

  const headings = main.querySelectorAll('h2[id], h3[id]');
  if (headings.length < 2) { root.style.display = 'none'; return; }

  let html = '<div class="toc-title">On this page</div><ul class="toc-list">';
  headings.forEach(h => {
    const level = h.tagName === 'H3' ? ' toc-h3' : '';
    html += `<li class="${level}"><a href="#${h.id}">${h.textContent}</a></li>`;
  });
  html += '</ul>';
  root.innerHTML = html;

  // scroll-spy
  const links = root.querySelectorAll('.toc-list a');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const active = root.querySelector(`a[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  headings.forEach(h => observer.observe(h));
}

/* --- Page Nav (Prev / Next) --- */
function injectPageNav() {
  const root = document.getElementById('page-nav-root');
  if (!root) return;
  const base = getBasePath();
  const lang = getLang();
  const current = getCurrentPage();
  const idx = PAGES.findIndex(p => p.id === current);
  if (idx < 0) return;

  let html = '';
  if (idx > 0) {
    const prev = PAGES[idx - 1];
    html += `<a class="prev" href="${base}/${lang}/${prev.id}.html">
      <span class="nav-label">Previous</span>
      <span class="nav-title">${prev.title}</span>
    </a>`;
  }
  if (idx < PAGES.length - 1) {
    const next = PAGES[idx + 1];
    html += `<a class="next" href="${base}/${lang}/${next.id}.html">
      <span class="nav-label">Next</span>
      <span class="nav-title">${next.title}</span>
    </a>`;
  }
  root.innerHTML = html;
}

/* --- Zoom Lightbox --- */
function initZoom() {
  const style = document.createElement('style');
  style.textContent = `
    .zoomable { cursor: zoom-in !important; }
    .zoomable:hover { opacity: .88; outline: 2px solid var(--accent, #6366f1); outline-offset: 2px; }
    .zoom-hint { display: block; font-size: 11px; color: var(--text-muted, #888); text-align: center; margin-top: 4px; user-select: none; }
    #zoom-overlay {
      display: none; position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,.88); backdrop-filter: blur(4px);
      align-items: center; justify-content: center; cursor: zoom-out;
    }
    #zoom-overlay.open { display: flex; }
    #zoom-img-wrap {
      position: relative; max-width: 94vw; max-height: 92vh;
      overflow: auto; cursor: default; border-radius: 8px;
      box-shadow: 0 8px 60px rgba(0,0,0,.7); background: #1e1e2e; padding: 16px;
    }
    #zoom-img-wrap img { display: block; max-width: none; }
    #zoom-img-wrap svg { display: block; }
    #zoom-close {
      position: fixed; top: 14px; right: 18px;
      background: rgba(255,255,255,.18); border: none; color: #fff;
      font-size: 20px; width: 36px; height: 36px; border-radius: 50%;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      z-index: 10000; line-height: 1;
    }
    #zoom-close:hover { background: rgba(255,255,255,.35); }
    #zoom-hint-bar {
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,.6); color: #e2e8f0; font-size: 12px;
      padding: 5px 14px; border-radius: 20px; pointer-events: none;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'zoom-overlay';
  overlay.innerHTML = `
    <button id="zoom-close" title="Close (Esc)">&#x2715;</button>
    <div id="zoom-img-wrap"></div>
    <div id="zoom-hint-bar">Scroll to pan · Click outside or Esc to close</div>
  `;
  document.body.appendChild(overlay);

  const wrap = overlay.querySelector('#zoom-img-wrap');

  function openZoom(imgEl) {
    wrap.innerHTML = '';
    wrap.appendChild(imgEl);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeZoom() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { wrap.innerHTML = ''; }, 200);
  }

  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.id === 'zoom-close') closeZoom();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeZoom();
  });

  const main = document.querySelector('.doc-main');
  if (!main) return;

  // ── Regular images ────────────────────────────────────────────
  main.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (!src || src === '') return;
    img.classList.add('zoomable');
    img.title = 'Click to zoom';
    const hint = document.createElement('span');
    hint.className = 'zoom-hint';
    hint.textContent = '🔍 Click to zoom';
    img.insertAdjacentElement('afterend', hint);
    img.addEventListener('click', () => {
      const el = new Image();
      el.src = img.src;
      el.alt = img.alt;
      el.style.cssText = 'max-width:90vw;max-height:88vh;display:block;border-radius:6px;';
      openZoom(el);
    });
  });

  let attempts = 0;
  const poll = setInterval(() => {
    if (++attempts >= 20) clearInterval(poll);
  }, 400);
}

/* --- Mermaid --- */
function loadMermaid() {
  if (!document.querySelector('.mermaid')) return;
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
  script.onload = () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    mermaid.initialize({
      startOnLoad: true,
      theme: isLight ? 'default' : 'dark',
      securityLevel: 'loose',
    });
  };
  document.head.appendChild(script);
}

/* --- Init --- */
document.addEventListener('DOMContentLoaded', () => {
  injectSidebar();
  injectHamburger();
  injectBreadcrumb();
  buildTOC();
  injectPageNav();
  loadMermaid();
  initZoom();
});
