// Prerender the design-canvas bundle (src/index.bundle.html) into a plain
// static page at public/index.html.
//
// The bundle is a JavaScript program: it base64/gzip-unpacks React and the
// canvas runtime into blob URLs, then builds the document at runtime. Nothing
// of the page exists in its markup, so anything that does not execute that
// program — JS off, a browser without DecompressionStream, a link-preview or
// search crawler — receives an empty page. This build runs the program once,
// here, and commits the result.
//
//   node tools/build.mjs
//
// Requires playwright + a Chromium build. Set CHROMIUM_PATH to override the
// executable (defaults to Playwright's own download).

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = join(ROOT, 'src/index.bundle.html');
const OUTPUT = join(ROOT, 'public/index.html');

// The bundle mints blob: URLs, which a file:// document may not navigate to,
// so it has to be served over http.
const html = readFileSync(INPUT);
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures = [];
page.on('pageerror', (e) => failures.push(String(e)));

await page.goto(origin + '/', { waitUntil: 'load' });
// The runtime unpacks assets asynchronously and swaps the document root only
// once every blob is minted; wait for the composed page rather than a timeout.
await page.waitForSelector('section[data-mv]', { timeout: 60_000 });
await page.waitForFunction(
  () => document.querySelectorAll('section[data-mv]').length >= 5,
  { timeout: 60_000 },
);

// The rail's active-movement highlight is the one behaviour the canvas runtime
// provided that outlives the render. It is reimplemented below as ~20 lines of
// plain JS; the build tags the elements it needs to address.
const RAIL_SCRIPT = `
(function () {
  var ticks = document.querySelectorAll('[data-rail] a[data-tick]');
  var movements = document.querySelectorAll('[data-mv]');
  if (!ticks.length || !movements.length || !('IntersectionObserver' in window)) return;
  var INK = '#101010', VERMILION = '#C42E17';
  function activate(index) {
    for (var i = 0; i < ticks.length; i++) {
      var on = i === index;
      ticks[i].setAttribute('aria-current', on ? 'true' : 'false');
      var numeral = ticks[i].querySelector('[data-tick-numeral]');
      var rule = ticks[i].querySelector('[data-tick-rule]');
      if (numeral) numeral.style.color = on ? VERMILION : INK;
      if (rule) { rule.style.width = on ? '34px' : '16px'; rule.style.background = on ? VERMILION : INK; }
    }
  }
  var io = new IntersectionObserver(function (entries) {
    var best = null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) best = e;
    }
    if (best) activate(Number(best.target.dataset.mv));
  }, { threshold: [0.25, 0.5, 0.75], rootMargin: '-20% 0px -20% 0px' });
  for (var i = 0; i < movements.length; i++) io.observe(movements[i]);
})();
`.trim();

const stats = await page.evaluate((railScript) => {
  const removed = { scripts: 0, styles: 0, attrs: 0, interp: 0 };

  // 1. Every script goes: React, the canvas runtime and the bundler loader all
  //    served the render that has now happened.
  for (const s of Array.from(document.querySelectorAll('script'))) {
    s.remove();
    removed.scripts++;
  }

  // 2. Drop the canvas runtime's own stylesheets (streaming placeholders, the
  //    #dc-root host box) and keep the page's.
  for (const s of Array.from(document.querySelectorAll('style'))) {
    const t = s.textContent || '';
    if (/\.sc-placeholder|x-dc\s*\{|#dc-root/.test(t)) {
      s.remove();
      removed.styles++;
    }
  }

  // 3. Lift the page out of the runtime's mount point so <body> holds the
  //    document itself.
  const host = document.querySelector('#dc-root > .sc-host') || document.querySelector('#dc-root');
  if (host) {
    const root = document.getElementById('dc-root');
    while (host.firstChild) root.parentNode.insertBefore(host.firstChild, root);
    root.remove();
  }

  // 4. Unwrap the interpolation spans the runtime wrapped each {{ }} in.
  for (const el of Array.from(document.querySelectorAll('span.sc-interp'))) {
    el.replaceWith(...el.childNodes);
    removed.interp++;
  }

  // 5. Strip the runtime's bookkeeping attributes.
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
  const junk = /^(data-dc-tpl|data-dc-script|data-sc-name|data-props)$/;
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    for (const name of Array.from(el.getAttributeNames())) {
      if (junk.test(name)) { el.removeAttribute(name); removed.attrs++; }
    }
    if (el.classList.contains('sc-host')) el.classList.remove('sc-host');
    if (el.getAttribute('class') === '') el.removeAttribute('class');
  }

  // 6. Tag the rail so the replacement script can address it.
  const rail = document.querySelector('[data-rail]');
  let tagged = 0;
  if (rail) {
    for (const a of Array.from(rail.querySelectorAll('a'))) {
      a.setAttribute('data-tick', '');
      const spans = a.querySelectorAll('span');
      if (spans[0]) spans[0].setAttribute('data-tick-numeral', '');
      if (spans[1]) spans[1].setAttribute('data-tick-rule', '');
      tagged++;
    }
  }

  document.documentElement.setAttribute('lang', 'en');

  const s = document.createElement('script');
  s.textContent = railScript;
  document.body.appendChild(s);

  return {
    ...removed,
    tickCount: tagged,
    movements: document.querySelectorAll('section[data-mv]').length,
    svgs: document.querySelectorAll('svg').length,
    textLength: document.body.innerText.trim().length,
  };
}, RAIL_SCRIPT);

let out = '<!DOCTYPE html>\n' + (await page.evaluate(() => document.documentElement.outerHTML)) + '\n';
await browser.close();
server.close();

// The blob: URLs the bundle minted are dead once the page is static; a
// surviving reference means something still expects the runtime.
const leftovers = [
  ['blob: URL', /blob:/],
  ['canvas runtime attribute', /data-dc-tpl|data-sc-name/],
  ['camelCase-mangled SVG attribute', /sc-camel-/],
  ['unresolved interpolation', /\{\{/],
  ['bundler scaffolding', /__bundler/],
];
const found = leftovers.filter(([, re]) => re.test(out)).map(([name]) => name);
if (found.length) {
  console.error('build failed — runtime leftovers in output: ' + found.join(', '));
  process.exit(1);
}
if (failures.length) {
  console.error('build failed — page errors during render:\n  ' + failures.join('\n  '));
  process.exit(1);
}
if (stats.movements !== 5 || stats.tickCount !== 5) {
  console.error(`build failed — expected 5 movements and 5 rail ticks, got ${stats.movements}/${stats.tickCount}`);
  process.exit(1);
}

writeFileSync(OUTPUT, out);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`public/index.html  ${kb(out.length)}  (bundle was ${kb(html.length)})`);
console.log(`  ${stats.movements} movements, ${stats.svgs} inline SVG, ${stats.tickCount} rail ticks, ${stats.textLength} chars of text`);
console.log(`  removed ${stats.scripts} scripts, ${stats.styles} runtime stylesheets, ${stats.attrs} runtime attributes, ${stats.interp} interpolation wrappers`);
