// Critical test for the deployed page.
//
// The deploy contract is "plain static files": whatever Cloudflare serves for
// / must BE the page, not a program that produces it. This test serves
// public/ exactly as Workers Assets does and asserts the page survives the
// conditions that broke the previous build — scripting off, an older engine,
// and no network beyond the document itself.
//
//   node test/critical-test.mjs                 # tests public/
//   node test/critical-test.mjs src/index.bundle.html   # tests one file
//
// Exits non-zero on the first failed assertion.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const single = process.argv[2] ? join(ROOT, process.argv[2]) : null;
const DIR = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const server = createServer((req, res) => {
  if (single) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(readFileSync(single));
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(DIR, p));
  if (!file.startsWith(DIR) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><title>404</title>');
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});

let failed = 0;
const results = [];
function check(scenario, label, ok, detail) {
  results.push({ scenario, label, ok, detail });
  if (!ok) failed++;
}

// Inspect the page under one set of browser conditions.
async function inspect({ js = true, dropDecompressionStream = false, path = '/' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: js });
  const page = await ctx.newPage();
  if (dropDecompressionStream) {
    await page.addInitScript(() => { delete window.DecompressionStream; });
  }
  const errors = [];
  const offDocument = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  page.on('request', (r) => {
    if (r.url() !== ORIGIN + path && !r.url().startsWith('data:')) offDocument.push(r.url());
  });
  await page.goto(ORIGIN + path, { waitUntil: 'load', timeout: 40_000 });
  // Generous settle time — a runtime-built page gets every chance to finish.
  await page.waitForTimeout(js ? 8000 : 1500);
  const seen = await page.evaluate(() => {
    const text = (document.body ? document.body.innerText : '').trim();
    return {
      title: document.title,
      text,
      textLength: text.length,
      movements: document.querySelectorAll('section[data-mv]').length,
      claims: document.querySelectorAll('h2').length,
      svgs: document.querySelectorAll('svg').length,
      railTicks: document.querySelectorAll('[data-rail] a').length,
      asides: document.querySelectorAll('aside').length,
      anchors: ['i', 'ii', 'iii', 'iv', 'v'].filter((id) => document.getElementById(id)).length,
      canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href') || null,
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null,
      description: document.querySelector('meta[name=description]')?.getAttribute('content') || null,
      mangledSvgAttrs: (document.documentElement.outerHTML.match(/sc-camel-/g) || []).length,
      unresolvedInterpolations: (document.body?.innerText.match(/\{\{/g) || []).length,
      stuckOnLoader: !!document.getElementById('__bundler_loading'),
      errorBanner: document.getElementById('__bundler_err')?.textContent?.slice(0, 160) || null,
      documentHeight: document.documentElement.scrollHeight,
    };
  });
  await ctx.close();
  return { ...seen, errors, offDocument };
}

// ── 1. Scripting disabled ────────────────────────────────────────────────────
// The condition the previous build failed outright, and the one that also
// covers every link-preview and search crawler that does not execute JS.
{
  const r = await inspect({ js: false });
  const s = 'scripting disabled';
  check(s, 'page text is present (>4000 chars)', r.textLength > 4000, `${r.textLength} chars`);
  check(s, 'all five movements render', r.movements === 5, `${r.movements} sections`);
  check(s, 'all five claims render', r.claims === 5, `${r.claims} h2`);
  check(s, 'all five anchors resolve', r.anchors === 5, `${r.anchors}/5`);
  check(s, 'second-voice asides render', r.asides === 5, `${r.asides} aside`);
  check(s, 'compositions render', r.svgs >= 6, `${r.svgs} svg`);
  check(s, 'rail links are navigable', r.railTicks === 5, `${r.railTicks} ticks`);
  check(s, 'page is scrollable, not a single screen', r.documentHeight > 3000, `${r.documentHeight}px`);
  check(s, 'no runtime loader left on screen', !r.stuckOnLoader, String(r.stuckOnLoader));
  check(s, 'no unresolved {{ }} interpolations', r.unresolvedInterpolations === 0, String(r.unresolvedInterpolations));
  check(s, 'no camelCase-mangled SVG attributes', r.mangledSvgAttrs === 0, String(r.mangledSvgAttrs));
  check(s, 'title is set', r.title.startsWith('DYAI'), r.title);
  check(s, 'canonical URL is set', r.canonical === 'https://project.dyai.cloud/', String(r.canonical));
  check(s, 'og:title is set for link previews', !!r.ogTitle, String(r.ogTitle));
  check(s, 'description is set', !!r.description, String(r.description));
}

// ── 2. Scripting enabled ─────────────────────────────────────────────────────
{
  const r = await inspect({ js: true });
  const s = 'scripting enabled';
  check(s, 'no page errors', r.errors.length === 0, r.errors.join(' | ') || 'none');
  check(s, 'no error banner', !r.errorBanner, String(r.errorBanner));
  check(s, 'all five movements render', r.movements === 5, `${r.movements} sections`);
  check(s, 'requests nothing but the document', r.offDocument.length === 0, r.offDocument.join(', ') || 'none');
}

// ── 3. Older engine without DecompressionStream ──────────────────────────────
// Safari below 16.4 and Firefox below 113 have no DecompressionStream; the
// previous build half-rendered there. A static page must not care.
{
  const r = await inspect({ js: true, dropDecompressionStream: true });
  const s = 'no DecompressionStream (Safari <16.4 / Firefox <113)';
  check(s, 'all five movements render', r.movements === 5, `${r.movements} sections`);
  check(s, 'no unresolved {{ }} interpolations', r.unresolvedInterpolations === 0, String(r.unresolvedInterpolations));
  check(s, 'no camelCase-mangled SVG attributes', r.mangledSvgAttrs === 0, String(r.mangledSvgAttrs));
  check(s, 'no page errors', r.errors.length === 0, r.errors.join(' | ') || 'none');
}

// ── 4. Content parity between scripting on and off ───────────────────────────
{
  const [on, off] = [await inspect({ js: true }), await inspect({ js: false })];
  const s = 'parity';
  check(s, 'identical text with and without JavaScript', on.text === off.text,
    on.text === off.text ? 'identical' : `${on.textLength} vs ${off.textLength} chars`);
}

// ── 5. The other deployed routes ─────────────────────────────────────────────
if (!single) {
  const r = await inspect({ js: false, path: '/imprint.html' });
  check('imprint', 'renders without JavaScript', r.textLength > 100, `${r.textLength} chars`);
  check('imprint', 'title is set', r.title.includes('Imprint'), r.title);

  for (const [file, needle] of [['feed.xml', '<feed'], ['sitemap.xml', '<urlset'], ['robots.txt', 'Sitemap:'], ['404.html', '404']]) {
    const res = await fetch(`${ORIGIN}/${file}`);
    const body = await res.text();
    check('static files', `${file} is served and well-formed`, res.status === 200 && body.includes(needle),
      `HTTP ${res.status}`);
  }
}

await browser.close();
server.close();

let current = null;
for (const r of results) {
  if (r.scenario !== current) { current = r.scenario; console.log(`\n── ${current}`); }
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.ok ? '' : `  → ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} assertions passed`);
if (failed) { console.error(`${failed} FAILED`); process.exit(1); }
console.log('all green');
