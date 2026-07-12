// Shared docs helpers (vendored, no CDN).
export { FacetViz } from './lib/facetviz.js';

/** Render a config into an element, showing errors inline. */
export function renderChart(FacetViz, el, cfg) {
  el.innerHTML = '';
  try { new FacetViz(el, cfg); }
  catch (e) { el.innerHTML = '<p style="color:#e5484d;font:13px/1.5 monospace">' + (e && e.message || e) + '</p>'; }
}

/** Pretty-print a config as readable JS source (unquoted keys, functions elided). */
export function pretty(obj) {
  return JSON.stringify(obj, (k, v) => (typeof v === 'function' ? '__FN__' : v), 2)
    .replace(/"([a-zA-Z_$][\w$]*)":/g, '$1:')
    .replace(/"__FN__"/g, '(e) => { /* … */ }');
}

/** Highlight all <pre><code> in a root using the vendored highlight.js. */
export function highlight(root = document) {
  if (window.hljs) root.querySelectorAll('pre code').forEach((b) => window.hljs.highlightElement(b));
}

/** Mark the current page's top-nav link active + wire the mobile menu button. */
export function initChrome(page) {
  document.querySelectorAll('.topnav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  const side = document.getElementById('side');
  const btn = document.getElementById('menuBtn');
  if (btn && side) btn.addEventListener('click', () => side.classList.toggle('open'));
}

/** Scrollspy: highlight the sidebar link for the section in view. */
export function scrollspy(sidebarSel = '#side') {
  const links = [...document.querySelectorAll(`${sidebarSel} a[href^="#"]`)];
  const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  if (!targets.length) return;
  const spy = () => {
    let cur = targets[0];
    for (const t of targets) if (t.getBoundingClientRect().top <= 100) cur = t;
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + cur.id));
  };
  window.addEventListener('scroll', spy, { passive: true });
  spy();
}
