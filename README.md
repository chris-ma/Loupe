# Loupe

Report generator for the fixed-scope landing page audit: a structured findings
file goes in, a branded PDF comes out.

Built against `Landing Page Audit — Business Requirements v1.0`. Section
references below (BR §n) point at that document. This repository covers Phase 1
of BR §11 — the generator and the schema — and nothing else. Audits 1–10 are
delivered by hand against it.

---

## What is here

| Path | What it is |
|---|---|
| `src/rubric/v1.ts` | Rubric v1: pillars, severity and effort scales, the check catalogue, the methodology note |
| `src/schema/` | The findings file schema (Zod), the brand config schema, stable ID derivation, validation |
| `src/render/` | The report template, the brand-driven stylesheet, asset inlining, the PDF renderer |
| `src/server.ts` | The PDF route (BR §7.3) |
| `src/cli.ts` | `loupe validate` / `loupe render` / `loupe id` |
| `src/store.ts` | Findings retention, keyed for the delta audit in BR §8.2 |
| `brand/loupe.brand.json` | The only brand config in the repo — the operator's own |
| `examples/` | A specimen findings file, the screenshots it cites, and the report they render to |
| `schema/` | JSON Schema emitted from the Zod definitions, for editor completion |

## Requirements

Node 22.18 or later. The source is TypeScript run directly through Node's type
stripping — there is no build step for day-to-day use; `npm run build` exists
for producing a `dist/` when you want one.

```bash
npm install
npx playwright install chromium   # once, unless a Chromium is already present
```

If Chromium lives somewhere Playwright does not look, point at it:

```bash
export LOUPE_CHROMIUM_PATH=/path/to/chrome
```

## Producing an audit

```bash
# 1. Get the stable IDs for the findings you are about to write
node src/cli.ts id headline-outcome "hero h1"
#    -> headline-outcome--9dc6f1fd

# 2. Author the findings file (see examples/meridian-physio.audit.json)

# 3. Check it against the schema and the rubric
node src/cli.ts validate audits/acme.audit.json

# 4. Render, and file the findings for future re-audits
node src/cli.ts render audits/acme.audit.json --out out/acme.pdf --retain
```

`--html` also writes the intermediate HTML, which is faster to iterate on than
a PDF. `--brand path/to/other.brand.json` renders under a different brand.

The rendered specimen is committed at `examples/meridian-physio-specimen.pdf`.
Regenerate it with `npm run sample`, and its screenshots with `npm run sample:assets`.

## The PDF route

```bash
npm run serve            # 127.0.0.1:8787
LOUPE_API_TOKEN=… HOST=0.0.0.0 npm run serve
```

| Route | Behaviour |
|---|---|
| `POST /render` | Findings JSON, or `{audit, brand}` → `application/pdf` |
| `POST /preview` | The same → HTML, for checking a layout |
| `POST /validate` | Findings JSON → `{ok, errors, warnings}` |
| `GET /healthz` | Liveness, plus the schema, rubric and template versions in force |

Screenshots must arrive as `data:` URIs: the route has no filesystem context for
a caller's relative paths. The server refuses to bind a non-loopback host
without `LOUPE_API_TOKEN` set.

## The findings file

Findings are authored as data, never as prose (BR §7.2). Point your editor at
`schema/audit.schema.json` for completion and inline validation.

Two rules in the schema exist to hold the offer's shape rather than the file's:

- **Ten findings, maximum.** An eleventh is a validation error, not a judgement
  call (BR §3, §6.2). If a page cannot be expressed in ten, the BR §10 reading is
  that the scope or the rubric needs retightening — not that the cap should move.
- **Every finding carries a concrete fix.** At least one of `quick`, `medium` or
  `long_term` is required (BR §6.2).

Array order is the priority order. Positions 1–3 become the "Do this week" page,
and the priority table renders in the same sequence.

### Stable IDs

A finding ID is derived from the rubric check plus where on the page it applies:

```
deriveFindingId("form-friction", "#booking-form")  ->  form-friction--83db29a5
```

The derivation deliberately ignores severity, wording and rank, all of which
legitimately change between audits of the same page. That is what lets a future
delta audit tell "fixed" from "no longer detected" (BR §7.3, §8.2). A
hand-written ID validates, with a warning that it is not guaranteed stable.

### Errors and warnings

Errors block a render: a malformed file, more than ten findings, a finding with
no fix or no evidence, duplicate IDs, mixed rubric versions.

Warnings do not: an uncatalogued check, a hand-written ID, a check filed under a
different pillar than the catalogue, a priority order that contradicts the
severities. BR §11 has the rubric being calibrated against real pages through
audits 1–10, so drift has to be visible without being fatal.

## Branding

Everything brand-specific lives in the config (BR §7.3): palette, type stacks,
logo, footer, contact, page size and margins. The template reads nothing else,
and a test asserts that the generated stylesheet contains no colour absent from
the config. A second brand is a second JSON file, not a second template.

The logo is carried inline (SVG string or data URI) so a report renders with no
asset host and no network fetch.

## Versioning

Three versions are stamped in every report footer and travel with the findings
file:

- `rubric_version` — the assessment frame, in `src/rubric/v1.ts`
- `TEMPLATE_VERSION` — the layout, in `src/render/template.ts`
- brand `key` — which config produced the styling

Rubric v1 is frozen once a report ships against it. Recalibration means adding
`src/rubric/v2.ts`, not editing v1: a delivered report has to stay readable
against the frame that produced it. Bump `TEMPLATE_VERSION` on any change that
alters what a delivered report looks like.

## Retention

`--retain` files the findings JSON as:

```
data/audits/<client-slug>/<page-key>/index.json
data/audits/<client-slug>/<page-key>/<date>__<audit-id>.json
```

The page key is a hash of the normalised URL, so `https://www.example.com/lp/`
and `https://example.com/lp` file together and a re-audit lands beside its
predecessor. `data/` is gitignored — findings files are client material.

The delta audit product itself (BR §8.2) is not built. What is built is
everything it needs to exist later: stable IDs, retained files, and a layout
that a diff can join on.

## The specimen report

`examples/meridian-physio.audit.json` renders the sample report referenced in
BR §12.4. It is fabricated demonstration content: Meridian Physio is not a real
practice, the page audited is a mock generated by `npm run sample:assets`, and
every metric in it is illustrative. The methodology page of the rendered report
says so, so the artefact cannot be mistaken for a real client deliverable.

## Tests

```bash
npm test        # node:test, no runner
npm run typecheck
```

The PDF test skips itself when no Chromium is available; everything else runs
without one.

## Deliberately not here

Per BR §9 and BR §11, and not to be added without the Phase 2 gate: automated
ingest, DOM extraction or Core Web Vitals capture; a scoring engine; multi-tenant
or partner accounts; credits billing; the delta audit product; anything that
predicts a conversion rate.
