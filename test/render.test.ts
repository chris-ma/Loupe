import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { parseAudit } from "../src/schema/validate.ts";
import { renderFooterTemplate, renderReportHtml, TEMPLATE_VERSION } from "../src/render/template.ts";
import { stylesheet } from "../src/render/styles.ts";
import { parseBrand, type Brand } from "../src/schema/brand.ts";
import { esc } from "../src/render/html.ts";
import { loadBrand, PACKAGE_ROOT } from "../src/load.ts";

const SAMPLE = resolve(PACKAGE_ROOT, "examples/meridian-physio.audit.json");

async function context() {
  const audit = parseAudit(JSON.parse(await readFile(SAMPLE, "utf8")) as unknown).audit;
  const brand = await loadBrand();
  return { audit, brand };
}

test("the report carries every section the offer promises", async () => {
  const ctx = await context();
  const html = renderReportHtml(ctx);
  for (const heading of ["Do this week", "Priority table", "Findings", "Methodology", "Appendix"]) {
    assert.ok(html.includes(heading), `missing section: ${heading}`);
  }
});

test("page one is the three actions only — no supporting detail", async () => {
  const ctx = await context();
  const html = renderReportHtml(ctx);
  // Split on the sheet boundary, not on a section title: the stylesheet
  // mentions every section name too. The cover carries an extra class, so the
  // first plain sheet is the actions page.
  const actionsSheet = html.split('<section class="sheet"')[1] ?? "";
  assert.ok(actionsSheet.includes("Do this week"), "did not isolate the actions sheet");
  const [first, second, third, fourth] = ctx.audit.findings;
  assert.ok(actionsSheet.includes(esc(first!.title)));
  assert.ok(actionsSheet.includes(esc(second!.title)));
  assert.ok(actionsSheet.includes(esc(third!.title)));
  assert.ok(!actionsSheet.includes(esc(fourth!.title)), "a fourth finding reached page one");
  assert.ok(
    !actionsSheet.includes(esc(first!.observation.slice(0, 60))),
    "observations belong after the actions page",
  );
});

test("every finding reaches the detail section with its evidence and fixes", async () => {
  const ctx = await context();
  const html = renderReportHtml(ctx);
  for (const finding of ctx.audit.findings) {
    assert.ok(html.includes(finding.id), `finding ${finding.id} is missing`);
    assert.ok(html.includes(esc(finding.impact.business.slice(0, 40))));
  }
});

test("the report never sells anything — BR §6.2", async () => {
  const ctx = await context();
  const html = renderReportHtml(ctx).toLowerCase();
  for (const word of ["book a call to discuss", "our implementation service", "upgrade to", "buy now"]) {
    assert.ok(!html.includes(word), `report contains an upsell phrase: ${word}`);
  }
});

test("findings text is escaped, not interpreted as markup", async () => {
  const ctx = await context();
  const injected = structuredClone(ctx.audit);
  injected.findings[0]!.observation = '<script>alert("x")</script> & "quoted"';
  const html = renderReportHtml({ ...ctx, audit: injected });
  assert.ok(!html.includes("<script>alert"), "raw script tag survived escaping");
  assert.ok(html.includes("&lt;script&gt;"));
});

test("the footer stamps the template, rubric and brand versions", async () => {
  const ctx = await context();
  const footer = renderFooterTemplate(ctx);
  assert.ok(footer.includes(TEMPLATE_VERSION));
  assert.ok(footer.includes(ctx.audit.rubric_version));
  assert.ok(footer.includes(ctx.brand.key));
  assert.ok(footer.includes("pageNumber") && footer.includes("totalPages"));
});

test("the stylesheet contains no colour that is not in the brand config — BR §7.3", async () => {
  const brand = await loadBrand();
  const declared = new Set(
    [
      brand.palette.surface,
      brand.palette.surfaceAlt,
      brand.palette.ink,
      brand.palette.inkMuted,
      brand.palette.rule,
      brand.palette.accent,
      brand.palette.onAccent,
      ...Object.values(brand.palette.severity),
    ].map((c) => c.toLowerCase()),
  );
  const used = stylesheet(brand).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  const hardcoded = used.filter((c) => !declared.has(c.toLowerCase()));
  assert.deepEqual(hardcoded, [], "hardcoded colours make the template unlicensable");
});

test("a second brand changes the output without touching the template", async () => {
  const ctx = await context();
  const base = await loadBrand();
  const partner: Brand = parseBrand({
    ...base,
    key: "partner-co",
    name: "Partner Co",
    footer: "Partner Co audit",
    palette: { ...base.palette, accent: "#7a1f4b", ink: "#101010" },
  });
  const html = renderReportHtml({ ...ctx, brand: partner });
  assert.ok(html.includes("#7a1f4b"), "partner accent did not reach the stylesheet");
  assert.ok(!html.includes(base.palette.accent), "operator accent leaked into a partner render");
  assert.ok(renderFooterTemplate({ ...ctx, brand: partner }).includes("Partner Co audit"));
});

test("an audit with no delivery date falls back to the audit date on the cover", async () => {
  const ctx = await context();
  const audit = structuredClone(ctx.audit);
  delete (audit as { delivered_on?: string }).delivered_on;
  const html = renderReportHtml({ ...ctx, audit });
  assert.ok(html.includes("4 September 2026"));
});
