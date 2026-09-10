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
| `site/` | The offer page (BR §12.3), deployed to Vercel as a static site |

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

## The offer page

`site/` is the single landing page of BR §6.1: offer, price, turnaround and the
sample report, with no "contact us for pricing" and no call required to buy. It
is static — plain HTML and CSS, no build step — and reuses the report's palette
and type stacks so the page and the document read as one thing.

Deployed on Vercel via `vercel.json` at the repo root: `outputDirectory: "site"`
serves this folder as static output, with `framework: null` and an empty
`buildCommand` so nothing tries to build the report generator itself. The
project's Root Directory in the dashboard is left at the repo root — not set to
`site` — because `api/submit.ts` (below) has to be discoverable there; Vercel's
`/api` convention is resolved from Root Directory, independent of
`outputDirectory`.

**One value must be set before the offer page goes to production**, in
`site/index.html`, marked with a comment in the buy section: the checkout
`href` on `#checkout` — currently a `mailto:` that pre-fills the four intake
questions. Replace with a Stripe payment link or equivalent once you're
charging through it directly rather than by invoice.

Refresh the sample images after changing the report:

```bash
npm run sample
cp examples/meridian-physio-specimen.pdf site/sample-report.pdf
pdftoppm -jpeg -jpegopt quality=82 -r 150 -f 1 -l 3 site/sample-report.pdf site/assets/page
```

## The AI draft pipeline

`site/intake.html` is the real §6.1 intake form (`POST /api/submit`), sent to a
client after payment clears — the payment step above is untouched. Submitting
it does not deliver anything to the client. It runs an unreviewed AI first pass
and emails the result — a watermarked draft PDF plus the raw findings JSON — to
the operator only, as a starting point for the human-delivered report.

This exists because BR §8.1 makes the price part of the product: an
unreviewed AI report is exactly what a sub-US$500 "automated report with no
human interpretation" looks like, and that is not what's being sold at this
price. So the draft is structurally unable to pass as the deliverable — every
page carries a fixed red banner (`AI-generated draft — unreviewed — internal
use only — not sent to the client`), and the footer stamp changes to `DRAFT,
UNREVIEWED` in place of the usual rubric/template/brand stamp. Set `draft: true`
on a `RenderContext` (`src/render/template.ts`) to get this; there is no
"reviewed" flag — a draft is either visibly a draft, or it goes through the
ordinary unmarked path.

**What the pipeline does**, all synchronously within one request (see the
module comment in `api/submit.ts` for why this doesn't hand off to a
background task):

1. Validates the intake payload, checks the honeypot field, and resolves the
   submitted URL's hostname to rule out anything pointing at a private,
   loopback, or link-local address before a server-side browser ever touches
   it.
2. Captures the page with `playwright-core` + `@sparticuz/chromium-min`
   (desktop 1440×900, mobile 390×844).
3. Calls Claude with both screenshots and the intake's stated goal/audience,
   forced (via `tool_choice`) to return structured output matching
   `src/schema/draft.ts` — a narrower schema than the real findings schema: no
   `id`, no `rubric_version` (both are computed afterward, never trusted from
   the model), no `metric` evidence kind (the model has no analytics access,
   so it cannot be allowed to state a number), and screenshot evidence carries
   only a `viewport` label — the actual captured image is substituted in code,
   so a finding can never cite a screenshot that wasn't really taken.
4. Assembles a full `Audit`, runs it through the same `validateAudit()` every
   manually authored findings file goes through, and renders it with the
   existing template in draft mode.
5. Emails the PDF and the findings JSON to `REPORT_RECIPIENT_EMAIL` via Resend.
   The findings JSON is there so a real edit is a `loupe render` away, not a
   re-transcription.

**Required environment variables** (Vercel → Project → Settings → Environment
Variables — this repo has no tool access to set these; do it in the dashboard):

| Variable | Source |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com — your own key, own billing |
| `RESEND_API_KEY` | resend.com — free tier covers this volume easily |
| `CHROMIUM_PACK_URL` | see below — **do not guess this** |
| `REPORT_RECIPIENT_EMAIL` | optional, defaults to `crispy-studios@hotmail.com` |
| `REPORT_FROM_EMAIL` | optional, defaults to Resend's shared test sender |

`CHROMIUM_PACK_URL` needs care: `@sparticuz/chromium-min` doesn't bundle a
Chromium binary (that's the point — it keeps the function under Vercel's size
limit) and instead downloads one at cold start from a URL you supply. The
correct asset changes with the package version and its filename has changed
shape across releases, so this isn't hardcoded anywhere in the code — find the
`.tar` asset matching the installed version at
https://github.com/Sparticuz/chromium/releases (the version is pinned in
`package.json`; keep them in lockstep on upgrade) and set its direct download
URL as this variable. Without it, `POST /api/submit` fails clearly rather than
silently — `launchBrowser()` checks for it up front.

**Known limits, not yet hardened:**

- No rate limiting beyond the honeypot and per-request timeouts. Each
  submission costs a real Claude vision call plus Vercel compute; fine at the
  "10 known contacts" volume in BR §12.6, worth revisiting before wider
  traffic.
- Runs synchronously rather than on a background task, so the client's browser
  waits (up to `maxDuration: 60` in `vercel.json`) for a "received" confirmation.
  `site/intake.html` shows a pending state so this doesn't read as broken.
- No database — a submission's only record is the email it produces. Fine
  for "email me a draft"; not fine if failed/duplicate submissions need
  tracking later.
- The `#checkout` mailto in `site/index.html` still pre-fills the four intake
  questions in its body, which now duplicate `site/intake.html`. Left
  unchanged since the buy step was explicitly out of scope here — worth
  simplifying that copy once `intake.html` is the only place those get asked.

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
