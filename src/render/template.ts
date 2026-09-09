import {
  EFFORT_DEFINITIONS,
  METHODOLOGY,
  PILLAR_DEFINITIONS,
  SEVERITY_DEFINITIONS,
  findCheck,
  type Effort,
  type Pillar,
  type Severity,
} from "../rubric/v1.ts";
import type { Audit, Evidence, Finding } from "../schema/audit.ts";
import type { Brand } from "../schema/brand.ts";
import { esc, paras } from "./html.ts";
import { stylesheet } from "./styles.ts";

/**
 * Report template — BR §7.1.
 *
 * Section order is fixed by the BR and is not a styling choice:
 *   1 Cover · 2 Do this week · 3 Priority table · 4 Findings detail
 *   5 Methodology note · 6 Appendix
 *
 * Two of those are load-bearing for the offer rather than for the document:
 *  - "Do this week" carries no supporting detail (BR §6.2). The buyer's first
 *    page is three actions, not an executive summary. Evidence comes later, for
 *    those who want it.
 *  - There is no upsell anywhere in this file, and there must never be
 *    (BR §6.2). The upsell is presented at the debrief.
 *
 * Bump TEMPLATE_VERSION on any change that alters what a delivered report looks
 * like. It is stamped in the footer so a report can be reproduced later.
 */
export const TEMPLATE_VERSION = "1.0.0" as const;

const ACTIONS_ON_PAGE_ONE = 3;

export interface RenderContext {
  audit: Audit;
  brand: Brand;
  /** Overrides the audit's own delivery date on the cover. Defaults to `delivered_on`, then today. */
  renderedOn?: string;
}

/* ------------------------------------------------------------------ *
 * Small shared pieces
 * ------------------------------------------------------------------ */

function severityChip(severity: Severity): string {
  return `<span class="chip chip-${esc(severity)}">${esc(SEVERITY_DEFINITIONS[severity].label)}</span>`;
}

function effortChip(effort: Effort): string {
  const def = EFFORT_DEFINITIONS[effort];
  return `<span class="chip chip-outline">${esc(def.label)} · ${esc(def.band)}</span>`;
}

function pillarChip(pillar: Pillar): string {
  return `<span class="chip chip-outline">${esc(PILLAR_DEFINITIONS[pillar].label)}</span>`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

/** The single most immediate fix, preferring the cheapest tier available. */
function firstFix(finding: Finding): { tier: string; text: string } {
  const { quick, medium, long_term } = finding.recommendations;
  if (quick) return { tier: "Quick fix", text: quick };
  if (medium) return { tier: "Medium change", text: medium };
  return { tier: "Long-term redesign", text: long_term ?? "" };
}

function evidenceLine(item: Evidence): string {
  if (item.kind === "metric") {
    const period = item.period ? ` <span class="ev-source">(${esc(item.period)})</span>` : "";
    return `<li><span class="ev-kind">Metric</span><strong>${esc(item.label)}:</strong> ${esc(item.value)}${period}<br><span class="ev-source small">Source: ${esc(item.source)}</span></li>`;
  }
  if (item.kind === "screenshot") {
    const viewport = item.viewport ? ` <span class="ev-source">(${esc(item.viewport)})</span>` : "";
    return `<li><span class="ev-kind">Screenshot</span>${esc(item.caption)}${viewport} <span class="ev-source small">See appendix.</span></li>`;
  }
  const source = item.source ? `<br><span class="ev-source small">Source: ${esc(item.source)}</span>` : "";
  return `<li><span class="ev-kind">Observed</span>${esc(item.text)}${source}</li>`;
}

/* ------------------------------------------------------------------ *
 * 1 — Cover
 * ------------------------------------------------------------------ */

function coverSheet(ctx: RenderContext, deliveredOn: string): string {
  const { audit, brand } = ctx;
  const logo = brand.logo?.svg
    ? brand.logo.svg
    : brand.logo?.dataUri
      ? `<img src="${esc(brand.logo.dataUri)}" alt="${esc(brand.logo.alt)}">`
      : `<span class="cover-wordmark">${esc(brand.name)}</span>`;

  const contact = [brand.contact?.website, brand.contact?.email].filter(Boolean).join(" · ");

  return `
<section class="sheet cover">
  <div class="cover-logo">${logo}</div>

  <div class="cover-title">
    <p class="eyebrow">Landing page audit</p>
    <h1>${esc(audit.page.name ?? audit.client.name)}</h1>
    ${audit.verdict ? `<div class="cover-verdict">${paras(audit.verdict)}</div>` : ""}
  </div>

  <dl class="cover-meta">
    <div><dt>Prepared for</dt><dd>${esc(audit.client.name)}</dd></div>
    <div><dt>Page audited</dt><dd class="mono">${esc(audit.page.url)}</dd></div>
    <div><dt>Conversion goal</dt><dd>${esc(audit.page.conversion_goal)}</dd></div>
    <div><dt>Date</dt><dd>${esc(formatDate(deliveredOn))}</dd></div>
    <div><dt>Findings</dt><dd>${audit.findings.length} ranked</dd></div>
    <div><dt>Methodology</dt><dd>Rubric ${esc(audit.rubric_version)} · Template ${esc(TEMPLATE_VERSION)}</dd></div>
  </dl>

  ${contact ? `<div class="cover-foot"><span>${esc(contact)}</span></div>` : ""}
</section>`.trim();
}

/* ------------------------------------------------------------------ *
 * 2 — Do this week (BR §7.1: top 3, one page, no supporting detail)
 * ------------------------------------------------------------------ */

function actionsSheet(ctx: RenderContext): string {
  const top = ctx.audit.findings.slice(0, ACTIONS_ON_PAGE_ONE);
  const remaining = ctx.audit.findings.length - top.length;

  const actions = top
    .map((finding, index) => {
      const fix = firstFix(finding);
      return `
    <div class="action">
      <div class="action-rank">${index + 1}</div>
      <div class="action-body">
        <h3>${esc(finding.title)}</h3>
        <div class="action-do">
          <span class="label">${esc(fix.tier)}</span>
          ${paras(fix.text)}
        </div>
        <div class="action-tags">
          ${severityChip(finding.severity)}
          ${effortChip(finding.effort)}
          ${pillarChip(finding.pillar)}
        </div>
      </div>
    </div>`;
    })
    .join("\n");

  return `
<section class="sheet">
  <div class="section-head">
    <p class="eyebrow">Section 1</p>
    <h2>Do this week</h2>
  </div>

  <p class="muted">The three highest-priority findings, with the cheapest change that moves each one.
  Reasoning, evidence and the remaining findings follow.</p>

  ${actions}

  <div class="note-box">
    <strong>How to read this report.</strong> Findings are ranked in the order we would fix them, not
    by how easy they are. Severity states how much the finding is costing the page; effort states what
    it takes to change. ${
      remaining > 0
        ? `${remaining} further finding${remaining === 1 ? "" : "s"} ${remaining === 1 ? "is" : "are"} set out in the priority table overleaf.`
        : ""
    } This report diagnoses and sequences; it does not predict a conversion rate.
  </div>
</section>`.trim();
}

/* ------------------------------------------------------------------ *
 * 3 — Priority table
 * ------------------------------------------------------------------ */

function priorityTableSheet(ctx: RenderContext): string {
  const rows = ctx.audit.findings
    .map((finding, index) => {
      const effort = EFFORT_DEFINITIONS[finding.effort];
      return `
      <tr>
        <td class="col-rank">${index + 1}</td>
        <td class="col-name">
          <span class="finding-title">${esc(finding.title)}</span>
          <span class="finding-id mono">${esc(finding.id)}</span>
        </td>
        <td class="col-pillar">${esc(PILLAR_DEFINITIONS[finding.pillar].label)}</td>
        <td class="col-sev">${severityChip(finding.severity)}</td>
        <td class="col-effort">${esc(effort.label)}<br><span class="muted small">${esc(effort.band)}</span></td>
        <td>${esc(finding.impact.business)}</td>
      </tr>`;
    })
    .join("\n");

  return `
<section class="sheet">
  <div class="section-head">
    <p class="eyebrow">Section 2</p>
    <h2>Priority table</h2>
  </div>

  <p class="muted">All findings in the order we would address them. Business impact is the consequence
  of leaving the finding in place.</p>

  <table class="priority">
    <thead>
      <tr>
        <th class="col-rank">#</th>
        <th class="col-name">Finding</th>
        <th class="col-pillar">Pillar</th>
        <th class="col-sev">Severity</th>
        <th class="col-effort">Effort</th>
        <th>Business impact if unaddressed</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>
</section>`.trim();
}

/* ------------------------------------------------------------------ *
 * 4 — Findings detail
 * ------------------------------------------------------------------ */

function findingBlock(finding: Finding, index: number): string {
  const check = findCheck(finding.check);
  const fixes: string[] = [];
  if (finding.recommendations.quick) {
    fixes.push(`<li><span class="tier">Quick fix</span>${paras(finding.recommendations.quick)}</li>`);
  }
  if (finding.recommendations.medium) {
    fixes.push(`<li><span class="tier">Medium change</span>${paras(finding.recommendations.medium)}</li>`);
  }
  if (finding.recommendations.long_term) {
    fixes.push(`<li><span class="tier">Long-term redesign</span>${paras(finding.recommendations.long_term)}</li>`);
  }

  return `
  <article class="finding">
    <div class="finding-head">
      <span class="rank">Finding ${index + 1} · ${esc(finding.id)}</span>
      <h3>${esc(finding.title)}</h3>
      <div class="finding-tags">
        ${severityChip(finding.severity)}
        ${effortChip(finding.effort)}
        ${pillarChip(finding.pillar)}
        ${finding.locator ? `<span class="chip chip-outline">${esc(finding.locator)}</span>` : ""}
      </div>
    </div>

    ${check ? `<p class="small muted"><strong>Assessed against:</strong> ${esc(check.question)}</p>` : ""}

    <div class="finding-block">
      <span class="label">Observation</span>
      ${paras(finding.observation)}
    </div>

    <div class="finding-block">
      <span class="label">Evidence</span>
      <ul class="evidence">${finding.evidence.map(evidenceLine).join("\n")}</ul>
    </div>

    <div class="finding-block impact-grid">
      <div>
        <span class="label">Consequence for the visitor</span>
        ${paras(finding.impact.user)}
      </div>
      <div>
        <span class="label">Consequence for the business</span>
        ${paras(finding.impact.business)}
      </div>
    </div>

    <div class="finding-block">
      <span class="label">Recommendations</span>
      <ul class="fixes">${fixes.join("\n")}</ul>
    </div>
  </article>`;
}

function findingsSheet(ctx: RenderContext): string {
  return `
<section class="sheet">
  <div class="section-head">
    <p class="eyebrow">Section 3</p>
    <h2>Findings</h2>
  </div>
${ctx.audit.findings.map(findingBlock).join("\n")}
</section>`.trim();
}

/* ------------------------------------------------------------------ *
 * 5 — Methodology note
 * ------------------------------------------------------------------ */

function methodologySheet(ctx: RenderContext): string {
  const { audit } = ctx;
  const pillarsUsed = [...new Set(audit.findings.map((f) => f.pillar))];

  const severityRows = (Object.keys(SEVERITY_DEFINITIONS) as Severity[])
    .map(
      (key) => `
      <tr>
        <td class="col-term">${severityChip(key)}</td>
        <td>${esc(SEVERITY_DEFINITIONS[key].definition)}</td>
      </tr>`,
    )
    .join("");

  const effortRows = (Object.keys(EFFORT_DEFINITIONS) as Effort[])
    .map(
      (key) => `
      <tr>
        <td class="col-term"><strong>${esc(EFFORT_DEFINITIONS[key].label)}</strong><br><span class="muted small">${esc(EFFORT_DEFINITIONS[key].band)}</span></td>
        <td>${esc(EFFORT_DEFINITIONS[key].definition)}</td>
      </tr>`,
    )
    .join("");

  const pillarRows = pillarsUsed
    .map(
      (pillar) => `
      <tr>
        <td class="col-term"><strong>${esc(PILLAR_DEFINITIONS[pillar].label)}</strong></td>
        <td>${esc(PILLAR_DEFINITIONS[pillar].definition)}</td>
      </tr>`,
    )
    .join("");

  const exclusions = [
    ...METHODOLOGY.notAssessed,
    ...(audit.exclusions ?? []),
  ];

  return `
<section class="sheet">
  <div class="section-head">
    <p class="eyebrow">Section 4</p>
    <h2>Methodology</h2>
  </div>

  <div class="method-grid">
    <div>
      <h3>What was assessed</h3>
      <ul class="method-list">
        ${METHODOLOGY.assessed.map((item) => `<li>${esc(item)}</li>`).join("\n        ")}
      </ul>
    </div>
    <div>
      <h3>What was not assessed</h3>
      <ul class="method-list">
        ${exclusions.map((item) => `<li>${esc(item)}</li>`).join("\n        ")}
      </ul>
    </div>
  </div>

  <div class="note-box">
    ${METHODOLOGY.limits.map((item) => `<p>${esc(item)}</p>`).join("\n    ")}
  </div>

  <div class="finding-block">
    <span class="label">Pillars applied</span>
    <table class="rubric-table"><tbody>${pillarRows}</tbody></table>
  </div>

</section>

<section class="sheet">
  <div class="section-head">
    <p class="eyebrow">Section 4 (continued)</p>
    <h2>Rubric scales</h2>
  </div>

  <p class="muted">The enumerated values behind every finding in this report, as defined in rubric
  ${esc(audit.rubric_version)}. They are printed in full so that a finding can be re-read, and
  re-argued, against the frame it was produced under.</p>

  <div class="finding-block">
    <span class="label">Severity</span>
    <table class="rubric-table"><tbody>${severityRows}</tbody></table>
  </div>

  <div class="finding-block">
    <span class="label">Effort</span>
    <table class="rubric-table"><tbody>${effortRows}</tbody></table>
  </div>
</section>`.trim();
}

/* ------------------------------------------------------------------ *
 * 6 — Appendix
 * ------------------------------------------------------------------ */

function appendixSheet(ctx: RenderContext): string {
  const { audit } = ctx;

  /*
   * Both halves of the appendix de-duplicate.
   *
   * One screenshot commonly supports three or four findings, and one supplied
   * metric is commonly cited by several. Printing each occurrence separately
   * would pad the appendix with repeats — exactly the bulk BR §6.2 warns
   * against — so each exhibit appears once and names the findings that use it.
   */

  interface Exhibit {
    src: string;
    caption: string;
    viewport?: string | undefined;
    refs: string[];
  }
  const exhibits = new Map<string, Exhibit>();

  interface MetricRow {
    label: string;
    value: string;
    period?: string | undefined;
    source: string;
    refs: string[];
  }
  const metrics = new Map<string, MetricRow>();
  const metricKey = (m: { label: string; value: string; period?: string | undefined; source: string }) =>
    [m.label, m.value, m.period ?? "", m.source].join("\u0000");

  for (const metric of audit.page.current_metrics ?? []) {
    metrics.set(metricKey(metric), { ...metric, refs: ["Supplied at intake"] });
  }

  for (const finding of audit.findings) {
    for (const item of finding.evidence) {
      if (item.kind === "screenshot") {
        const existing = exhibits.get(item.src);
        if (existing) {
          if (!existing.refs.includes(finding.id)) existing.refs.push(finding.id);
        } else {
          exhibits.set(item.src, {
            src: item.src,
            caption: item.caption,
            viewport: item.viewport,
            refs: [finding.id],
          });
        }
      } else if (item.kind === "metric") {
        const key = metricKey(item);
        const existing = metrics.get(key);
        if (existing) {
          if (!existing.refs.includes(finding.id)) existing.refs.push(finding.id);
        } else {
          metrics.set(key, { ...item, refs: [finding.id] });
        }
      }
    }
  }

  if (exhibits.size === 0 && metrics.size === 0) return "";

  const metricRows = [...metrics.values()]
    .map(
      (metric) => `
      <tr>
        <td>${esc(metric.label)}</td>
        <td class="mono">${esc(metric.value)}</td>
        <td>${esc(metric.period ?? "\u2014")}</td>
        <td>${esc(metric.source)}</td>
        <td class="muted mono">${metric.refs.map((ref) => esc(ref)).join("<br>")}</td>
      </tr>`,
    )
    .join("");

  const exhibitBlocks = [...exhibits.values()]
    .map(
      (exhibit, index) => `
    <figure class="exhibit">
      <div class="exhibit-label">Exhibit ${index + 1}${exhibit.viewport ? ` \u00b7 ${esc(exhibit.viewport)}` : ""} \u00b7 ${exhibit.refs.map((ref) => esc(ref)).join(", ")}</div>
      <img src="${esc(exhibit.src)}" alt="${esc(exhibit.caption)}">
      <figcaption class="exhibit-caption">${esc(exhibit.caption)}</figcaption>
    </figure>`,
    )
    .join("\n");

  return `
<section class="sheet">
  <div class="section-head">
    <p class="eyebrow">Section 5</p>
    <h2>Appendix \u2014 evidence</h2>
  </div>

  ${
    metricRows
      ? `<div class="finding-block">
    <span class="label">Metrics</span>
    <table class="metrics-table">
      <thead>
        <tr><th>Measure</th><th>Value</th><th>Period</th><th>Source</th><th>Used in</th></tr>
      </thead>
      <tbody>${metricRows}</tbody>
    </table>
  </div>`
      : ""
  }

  ${exhibitBlocks ? `<div class="finding-block"><span class="label">Screenshots</span>${exhibitBlocks}</div>` : ""}
</section>`.trim();
}

/* ------------------------------------------------------------------ *
 * Document
 * ------------------------------------------------------------------ */

export function renderReportHtml(ctx: RenderContext): string {
  const { audit, brand } = ctx;
  const deliveredOn = ctx.renderedOn ?? audit.delivered_on ?? audit.audited_on;

  const sheets = [
    coverSheet(ctx, deliveredOn),
    actionsSheet(ctx),
    priorityTableSheet(ctx),
    findingsSheet(ctx),
    methodologySheet(ctx),
    appendixSheet(ctx),
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<title>${esc(brand.name)} audit — ${esc(audit.client.name)} — ${esc(audit.page.url)}</title>
<style>
${stylesheet(brand)}
</style>
</head>
<body>
${sheets.join("\n\n")}
</body>
</html>
`;
}

/**
 * Footer band rendered by Chromium on every page (BR §7.3: "Template + rubric
 * version stamped in report footer"). Chromium renders this in an isolated
 * document, so the styling is inline and the palette values are passed through
 * from the brand config rather than inherited.
 */
export function renderFooterTemplate(ctx: RenderContext): string {
  const { audit, brand } = ctx;
  const stamp = `Rubric ${audit.rubric_version} · Template ${TEMPLATE_VERSION} · Brand ${brand.key}`;
  // A table, not flexbox: Chromium renders header/footer templates in an
  // isolated document whose root box does not honour flex layout reliably.
  // Sizes are in px because that document is not scaled the way the page is.
  const cell = `font-family:${brand.typography.bodyStack};font-size:8px;color:${brand.palette.inkMuted};padding:0;`;
  const gutters = brand.page.marginMm.left + brand.page.marginMm.right;
  // The table is sized by subtraction rather than given side margins: a
  // width:100% table with margins overflows the page and pushes the right-hand
  // cell off the sheet.
  return `
<table style="width:calc(100% - ${gutters}mm);border-collapse:collapse;table-layout:fixed;
              margin:0 ${brand.page.marginMm.right}mm ${(brand.page.marginMm.bottom / 2.5).toFixed(1)}mm ${brand.page.marginMm.left}mm;">
  <tr>
    <td style="${cell}text-align:left;">${esc(brand.footer)} · ${esc(audit.client.name)}</td>
    <td style="${cell}text-align:center;">${esc(stamp)}</td>
    <td style="${cell}text-align:right;width:16%;"><span class="pageNumber"></span> / <span class="totalPages"></span></td>
  </tr>
</table>`.trim();
}
