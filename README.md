# DYAI — project.dyai.cloud

One static page, one argument, five movements. The deployed page is plain static HTML — generated once by `npm run build`, readable with JavaScript off.

## Files

- `DYAI.dc.html` — the whole page (opening panel, movements I–V, closing panel). This is the authored source. Styling lives inline in the markup rather than in a separate `style.css`, because this project authors pages as single self-contained streaming documents — the palette and type rules below are the contract instead of a stylesheet.
- `src/index.bundle.html` — `DYAI.dc.html` compiled to a self-contained canvas bundle. Build input only; never deployed (see *Deploying to Cloudflare*).
- `public/index.html` — the deployed page: plain static HTML, generated from the bundle by `npm run build`. Do not edit by hand.
- `imprint.html` — plain skeleton, placeholders marked `[PLACEHOLDER: …]`.
- `feed.xml` — Atom, five entries (one per movement).
- `sitemap.xml`, `robots.txt`, `404.html`.

Anchors: `#i`, `#ii`, `#iii`, `#iv`, `#v`. JavaScript marks the current tick on the right-hand rail; with JS off the page is fully readable and the rail links still work.

## The palette (nothing else)

| Paper | Paper deep | Hairline | Ink | Ink muted | Vermilion | Ochre |
|---|---|---|---|---|---|---|
| `#FAF9F6` | `#F1EFE9` | `#101010` | `#14161A` | `#5A6169` | `#C42E17` | `#B8862B` |

No gradients outside the grain, no shadows, no rounded corners. Separation is hairlines and empty paper.

## Type

- Claim: 500 weight, `clamp(40px, 5.4vw, 104px)`, line-height 1.0, tracking `-0.025em`, max 2 lines.
- Prose: 18px / 1.65, column capped at `56ch`, never centred, never full width.
- Marginalia and labels: 10–13px, `letter-spacing: 0.24em`, uppercase; monospace for numbers.

## How a composition is built

Each movement's composition is one inline `<svg>`, `aria-hidden="true"`, assembled from the same five parts in a different arrangement:

1. **Grain field** — a shape in `<clipPath>`, filled with a flat gray `<rect>`, then a second `<rect filter="url(#gr)">` over it. `#gr` is the single `feTurbulence → feColorMatrix(saturate 0) → feComponentTransfer` filter defined once in the hidden `<svg>` at the top of the document and reused everywhere.
2. **Vermilion plane** — the same shape family (circle or parallelogram), offset so it overlaps the field, `fill="#C42E17"` with `mix-blend-mode: multiply`.
3. **Hairline annotation** — pick one or two per movement, never all: an arc with visible endpoint dots (I, V), a vertical axis with ticks (II), a 45° break line (III, IV).
4. **One dot grid** (`fill="url(#dots)"` on a small rect) **and one single filled dot**, placed deliberately.
5. **Index numeral** — I–V or 01–05, either large and thin or tiny and letter-spaced. It varies on purpose.

Compositions II and IV are full-bleed layers (`preserveAspectRatio="xMidYMid slice"`, `position:absolute; inset:0`) and are the largest element on those screens; the claim sits on top in paper white.

## Second voice

Every movement carries an `<aside>` with the counter-argument: 13px, italic, ink-muted, one hairline edge, a vermilion `■` where it begins. Rotated (`writing-mode: vertical-rl`) in I, III and V; horizontal in II and IV. Never a box, never a label.

## Adding a sixth movement without breaking the rhythm

1. Duplicate no section. Read the five, then decide what the sixth needs to be that none of them already is — a different dominant shape family, a different position for the claim, a different annotation. If it can be described as "like III but…", start again.
2. Add `<section id="vi" data-mv="5" aria-labelledby="claim-vi">` before the closing `<footer>`, with `min-height:100svh` and the shared padding `clamp(26px,4.6vw,74px)`.
3. Compose: one grain field, one vermilion plane, one or two hairline annotations, one dot grid, one dot, one numeral. If two of the six now use the same arrangement, change the new one.
4. Give it exactly one claim (`<h2>`), one prose column, one `<aside>` second voice.
5. The rail grows by itself — it is generated from the `[data-mv]` sections; extend the `roman`/`digits` arrays in the logic class and add `n6`.
6. Add a sixth `<entry>` to `feed.xml`, then recompile the bundle and run `npm run build && npm test`.
7. Keep the paper-deep background (`#F1EFE9`) on at most two of the six.

## Remaining placeholders

- `imprint.html`: legal name, address, contact, VAT/register.
- Closing panel: "Who writes this" points at `ben.poersch.online`; confirm or replace.
- No Open Graph image is referenced — add one only if a flat, palette-true image exists.

## Deploying to Cloudflare

The page must be deployed as plain static files — meaning the bytes Cloudflare
serves for `/` **are** the page, not a program that produces it.

`src/index.bundle.html` is not that. It is the canvas bundle: a JavaScript
program that base64/gzip-unpacks React and the canvas runtime into blob URLs
and then builds the document at runtime. Its markup contains no page at all.
Anything that does not execute that program in full receives an empty screen —
scripting disabled, a browser without `DecompressionStream` (Safari below 16.4,
Firefox below 113), a strict content-security policy, and every link-preview
and search crawler. It was deployed as `public/index.html` once; the build was
green and the site returned HTTP 200 the whole time, because the failure is in
the response body, not in the deploy.

So the deploy artifact is generated:

```
npm install          # playwright, for the headless render
npm run build        # src/index.bundle.html  →  public/index.html
npm test             # asserts the page survives without JavaScript
```

`tools/build.mjs` runs the bundle once in headless Chromium, takes the composed
DOM, strips the runtime (all scripts, the canvas stylesheets and bookkeeping
attributes, the `#dc-root` mount point) and reattaches the rail's
active-movement highlight as ~20 lines of plain JS. The output renders
identically — pixel for pixel — with and without JavaScript, and requests
nothing but itself. It fails the build rather than emit a page with runtime
leftovers in it.

`public/` is the deploy root:

```
public/index.html      the page (generated — do not edit)
public/imprint.html
public/feed.xml
public/sitemap.xml
public/robots.txt
public/404.html
```

**Workers (`npx wrangler deploy`)** — `wrangler.toml` declares the asset directory:

```toml
name = "dyai"
compatibility_date = "2026-08-19"

[assets]
directory = "./public"
not_found_handling = "404-page"
```

The build error `Could not detect a directory containing static files` means
wrangler found no such directory: either `wrangler.toml` was missing, or
`public/` was not committed. Commit both.

Workers Assets serves extensionless URLs by default, so `/imprint.html`
answers `307 → /imprint`. The sitemap lists the extensionless form.

**Cloudflare Pages** — build command: `npm install && npm run build`. Build
output directory: `public`. No framework preset.

After editing `DYAI.dc.html`, recompile the bundle, then run `npm run build`
and `npm test` before deploying. Editing `public/index.html` directly is not
maintained — the next build overwrites it.

## The critical test

`npm test` serves `public/` the way Workers Assets does and asserts, under
each condition that broke the previous build:

- **scripting disabled** — all five movements, claims, anchors, asides and
  compositions render; the title, canonical URL, `og:title` and description are
  present for link previews and crawlers;
- **scripting enabled** — no page errors, and no request beyond the document;
- **no `DecompressionStream`** — no unresolved `{{ }}` interpolations and no
  mangled SVG attributes;
- **parity** — the text is byte-identical with and without JavaScript;
- the imprint, feed, sitemap, robots and 404 routes are served and well-formed.

Run it against the old bundle to see what it catches:

```
node test/critical-test.mjs src/index.bundle.html
```
