import type { Brand } from "../schema/brand.ts";

/**
 * Print stylesheet, derived entirely from the brand config (BR §7.3).
 *
 * Two rules govern edits here:
 *  - No literal colour, typeface or logo may appear below. Every one comes from
 *    `brand`. A hardcoded value is the retrofit cost the BR is warning about.
 *  - Sizes are in points and millimetres because the output is paper, not a
 *    viewport. Pixels drift between Chromium versions at print scale.
 */
/** Physical page height in millimetres for the configured paper size. */
export function pageHeightMm(brand: Brand): number {
  return brand.page.format === "Letter" ? 279.4 : 297;
}

export function stylesheet(brand: Brand): string {
  const { palette: c, typography: t } = brand;

  return `
:root {
  --surface: ${c.surface};
  --surface-alt: ${c.surfaceAlt};
  --ink: ${c.ink};
  --ink-muted: ${c.inkMuted};
  --rule: ${c.rule};
  --accent: ${c.accent};
  --on-accent: ${c.onAccent};
  --sev-critical: ${c.severity.critical};
  --sev-high: ${c.severity.high};
  --sev-moderate: ${c.severity.moderate};
  --sev-low: ${c.severity.low};
  --font-heading: ${t.headingStack};
  --font-body: ${t.bodyStack};
  --font-mono: ${t.monoStack};
  /* Printable height of one page: used by full-bleed sheets such as the cover. */
  --content-h: ${(pageHeightMm(brand) - brand.page.marginMm.top - brand.page.marginMm.bottom).toFixed(2)}mm;
}

/* Page margins are applied by the PDF renderer, not here: Chromium reserves the
   header/footer band inside the printer margin, so a CSS @page margin of our own
   would either double up or crowd the footer. See render/pdf.ts. */
@page { size: ${brand.page.format}; }

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: ${t.basePt}pt;
  line-height: ${t.baseLineHeight};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* A .sheet starts on a fresh page. It may run over onto further pages; the
   renderer's margins keep those pages inside the same frame. */
.sheet { break-after: page; }
.sheet:last-child { break-after: auto; }

h1, h2, h3, h4 {
  font-family: var(--font-heading);
  font-weight: 600;
  margin: 0;
  color: var(--ink);
}
h1 { font-size: 26pt; line-height: 1.15; letter-spacing: -0.01em; }
h2 { font-size: 15pt; line-height: 1.2; }
h3 { font-size: 11.5pt; line-height: 1.25; }
p { margin: 0 0 ${t.basePt * 0.72}pt; }
p:last-child { margin-bottom: 0; }
strong { font-weight: 600; }

.eyebrow {
  font-family: var(--font-body);
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin: 0 0 6pt;
}

.section-head {
  border-bottom: 1.2pt solid var(--ink);
  padding-bottom: 5pt;
  margin-bottom: 12pt;
}
.section-head .eyebrow { margin-bottom: 3pt; }

.muted { color: var(--ink-muted); }
.small { font-size: 8pt; line-height: 1.45; }
.mono { font-family: var(--font-mono); font-size: 7.6pt; letter-spacing: 0.01em; }

/* ---------------- Cover ---------------- */

.cover { display: flex; flex-direction: column; min-height: var(--content-h); }
.cover-logo { color: var(--ink); }
.cover-logo svg { width: ${brand.logo?.widthMm ?? 30}mm; height: auto; display: block; }
.cover-logo img { width: ${brand.logo?.widthMm ?? 30}mm; height: auto; display: block; }
.cover-wordmark {
  font-family: var(--font-heading);
  font-size: 17pt;
  letter-spacing: 0.06em;
}
.cover-title { margin: 44mm 0 0; }
.cover-title h1 { max-width: 135mm; }
.cover-verdict {
  margin-top: 14pt;
  max-width: 128mm;
  font-size: 11pt;
  line-height: 1.45;
  color: var(--ink-muted);
}
.cover-meta {
  margin-top: 26pt;
  padding-top: 12pt;
  border-top: 0.8pt solid var(--rule);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 11pt 18pt;
  max-width: 150mm;
}
.cover-meta dt {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 2.5pt;
}
.cover-meta dd { margin: 0; font-size: 10pt; word-break: break-word; }
.cover-foot {
  margin-top: auto;
  padding-top: 16pt;
  font-size: 8pt;
  color: var(--ink-muted);
  display: flex;
  justify-content: space-between;
  gap: 10pt;
}

/* ---------------- Do this week ---------------- */

.action { display: flex; gap: 10pt; padding: 11pt 0; border-top: 0.8pt solid var(--rule); }
.action:first-of-type { border-top: 1.2pt solid var(--ink); }
.action-rank {
  font-family: var(--font-heading);
  font-size: 22pt;
  line-height: 0.95;
  color: var(--accent);
  width: 16mm;
  flex: 0 0 16mm;
}
.action-body { flex: 1 1 auto; }
.action-body h3 { margin-bottom: 4pt; }
.action-do { margin-top: 5pt; font-size: 9.5pt; }
.action-do .label {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--ink-muted);
  display: block;
  margin-bottom: 2pt;
}
.action-tags { margin-top: 5pt; display: flex; gap: 5pt; flex-wrap: wrap; align-items: center; }
.note-box {
  margin-top: 14pt;
  padding: 9pt 11pt;
  background: var(--surface-alt);
  border-left: 2.2pt solid var(--accent);
  font-size: 8.5pt;
  line-height: 1.45;
}

/* ---------------- Chips ---------------- */

.chip {
  display: inline-block;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  padding: 1.6pt 5pt;
  border-radius: 2pt;
  color: var(--on-accent);
  white-space: nowrap;
}
.chip-critical { background: var(--sev-critical); }
.chip-high     { background: var(--sev-high); }
.chip-moderate { background: var(--sev-moderate); }
.chip-low      { background: var(--sev-low); }
.chip-outline {
  background: transparent;
  color: var(--ink-muted);
  border: 0.7pt solid var(--rule);
  padding: 1pt 4.4pt;
}

/* ---------------- Priority table ---------------- */

table.priority { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.2pt; }
table.priority th {
  text-align: left;
  font-size: 7.2pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
  border-bottom: 1pt solid var(--ink);
  padding: 0 6pt 5pt 0;
  vertical-align: bottom;
}
table.priority td {
  padding: 7pt 6pt 7pt 0;
  border-bottom: 0.6pt solid var(--rule);
  vertical-align: top;
}
table.priority td:last-child, table.priority th:last-child { padding-right: 0; }
table.priority .col-rank { width: 7mm; color: var(--ink-muted); font-family: var(--font-mono); }
table.priority .col-name { width: 46mm; }
table.priority .col-pillar { width: 20mm; }
table.priority .col-sev { width: 19mm; }
table.priority .col-effort { width: 18mm; }
table.priority .finding-title { font-weight: 600; }
table.priority .finding-id {
  display: block;
  margin-top: 2pt;
  color: var(--ink-muted);
  overflow-wrap: anywhere;
}

/* ---------------- Finding detail ---------------- */

.finding { break-inside: avoid-page; margin-bottom: 16pt; }
.finding:last-child { margin-bottom: 0; }
.finding-head { border-top: 1.2pt solid var(--ink); padding-top: 8pt; margin-bottom: 8pt; }
.finding-head .rank {
  font-family: var(--font-mono);
  font-size: 8pt;
  color: var(--ink-muted);
  display: block;
  margin-bottom: 3pt;
}
.finding-tags { margin-top: 6pt; display: flex; gap: 5pt; flex-wrap: wrap; align-items: center; }
.finding-block { margin-top: 9pt; }
.finding-block > .label {
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--ink-muted);
  display: block;
  margin-bottom: 3pt;
  /* Never let a section label sit alone at the foot of a page. */
  break-after: avoid-page;
}
.impact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9pt 14pt; }
.fixes { margin: 0; padding: 0; list-style: none; }
.fixes li { padding: 6pt 0; border-top: 0.6pt solid var(--rule); }
.fixes li:first-child { border-top: none; padding-top: 0; }
.fixes .tier {
  font-size: 7.4pt;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--accent);
  display: block;
  margin-bottom: 2pt;
}
.evidence { margin: 0; padding: 0; list-style: none; font-size: 8.4pt; }
.evidence li { padding: 4.5pt 0; border-top: 0.6pt solid var(--rule); }
.evidence li:first-child { border-top: none; padding-top: 0; }
.evidence .ev-kind {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-right: 5pt;
}
.evidence .ev-source { color: var(--ink-muted); }

/* ---------------- Methodology ---------------- */

.method-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt 18pt; }
.method-grid h3 { margin-bottom: 5pt; }
.method-list { margin: 0; padding-left: 11pt; font-size: 8.4pt; }
.method-list li { margin-bottom: 4pt; }
.rubric-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 5pt; }
.rubric-table th, .rubric-table td {
  text-align: left;
  padding: 5pt 6pt 5pt 0;
  border-bottom: 0.6pt solid var(--rule);
  vertical-align: top;
}
.rubric-table th {
  font-size: 7.2pt;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
  border-bottom-color: var(--ink);
}
.rubric-table .col-term { width: 26mm; }

/* ---------------- Appendix ---------------- */

.exhibit { break-inside: avoid-page; margin-bottom: 14pt; }
.exhibit-label {
  font-family: var(--font-mono);
  font-size: 7.4pt;
  color: var(--ink-muted);
  margin-bottom: 3pt;
}
/* Portrait mobile captures and landscape desktop captures share this rule, so
   the image is bounded on both axes and never stretched: a 390x844 capture is
   held to its height, a 1280x820 one to its width. */
.exhibit img {
  display: block;
  max-width: 100%;
  max-height: 148mm;
  width: auto;
  height: auto;
  border: 0.6pt solid var(--rule);
  background: var(--surface-alt);
}
.exhibit-caption { margin-top: 3.5pt; font-size: 8pt; color: var(--ink-muted); }
.metrics-table { width: 100%; border-collapse: collapse; font-size: 8.2pt; }
.metrics-table th, .metrics-table td {
  text-align: left;
  padding: 5.5pt 6pt 5.5pt 0;
  border-bottom: 0.6pt solid var(--rule);
  vertical-align: top;
}
.metrics-table th {
  font-size: 7.2pt;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
  border-bottom-color: var(--ink);
}
`.trim();
}
