# DYAI — project.dyai.cloud

One static page, one argument, five movements. No build step: open the page file directly.

## Files

- `DYAI.dc.html` — the whole page (opening panel, movements I–V, closing panel). This is the deliverable page; deploy it as `index.html`. Styling lives inline in the markup rather than in a separate `style.css`, because this project authors pages as single self-contained streaming documents — the palette and type rules below are the contract instead of a stylesheet.
- `imprint.html` — plain skeleton, placeholders marked `[PLACEHOLDER: …]`.
- `feed.xml` — Atom, five entries (one per movement).
- `sitemap.xml`, `robots.txt`.

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
6. Add a sixth `<entry>` to `feed.xml`.
7. Keep the paper-deep background (`#F1EFE9`) on at most two of the six.

## Remaining placeholders

- `imprint.html`: legal name, address, contact, VAT/register.
- Closing panel: "Who writes this" points at `ben.poersch.online`; confirm or replace.
- No Open Graph image is referenced — add one only if a flat, palette-true image exists.

## Deploying to Cloudflare

The page must be deployed as plain static files. `DYAI.dc.html` is the *source*; the deployable page is `public/index.html`, a single self-contained file (all styles, SVG and the small runtime inlined, zero external requests).

`public/` is the deploy root:

```
public/index.html      the page
public/imprint.html
public/feed.xml
public/sitemap.xml
public/robots.txt
```

**Workers (`npx wrangler deploy`)** — `wrangler.toml` declares the asset directory:

```toml
name = "dyai"
compatibility_date = "2026-08-19"

[assets]
directory = "./public"
not_found_handling = "404-page"
```

The build error `Could not detect a directory containing static files` means wrangler found no such directory: either `wrangler.toml` was missing, or `public/` was not committed. Commit both.

**Cloudflare Pages** — build command: leave empty. Build output directory: `public`. No framework preset, no dependencies.

After editing `DYAI.dc.html`, regenerate `public/index.html` (re-bundle) before deploying — editing the compiled file directly is not maintained.
