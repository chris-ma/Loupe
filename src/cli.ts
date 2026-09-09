#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { deriveFindingId } from "./schema/ids.ts";
import { validateAudit, type ValidationIssue } from "./schema/validate.ts";
import { inlineAssets } from "./render/assets.ts";
import { renderReportHtml } from "./render/template.ts";
import { renderPdfOnce } from "./render/pdf.ts";
import { saveAudit } from "./store.ts";
import { loadBrand, readJson } from "./load.ts";

/**
 * `loupe` — the Phase 1 delivery tool.
 *
 * Audits 1-10 are delivered by hand (BR §11); this is the part that is not done
 * by hand. Author the findings file, run `loupe render`, send the PDF.
 */

const USAGE = `
loupe — landing page audit report generator

  loupe validate <findings.json>
      Check a findings file against the schema and the rubric. Prints errors
      and warnings; exits non-zero on errors.

  loupe render <findings.json> [--out <file.pdf>] [--brand <brand.json>]
                               [--html] [--retain] [--store <dir>]
      Render a findings file to PDF. --html also writes the intermediate HTML
      next to the PDF. --retain files the findings JSON in the store for future
      delta audits (BR §7.3, §8.2).

  loupe id <check> [locator]
      Print the stable finding ID for a rubric check and locator.

Options
  --out    <path>   Output file. Default: out/<audit_id>.pdf
  --brand  <path>   Brand config. Default: brand/loupe.brand.json
  --store  <dir>    Retention root. Default: data/audits
`.trim();

function printIssues(label: string, issues: ValidationIssue[]): void {
  if (issues.length === 0) return;
  process.stderr.write(`\n${label}\n`);
  for (const issue of issues) {
    process.stderr.write(`  ${issue.path}: ${issue.message}\n`);
  }
}

async function loadAudit(path: string) {
  const result = validateAudit(await readJson(path));
  if (!result.ok) {
    printIssues(`${result.errors.length} error(s) in ${path}:`, result.errors);
    printIssues(`${result.warnings.length} warning(s):`, result.warnings);
    process.exitCode = 1;
    return undefined;
  }
  printIssues(`${result.warnings.length} warning(s) in ${path}:`, result.warnings);
  return result.audit;
}

async function main(argv: string[]): Promise<void> {
  const command = argv[0];

  if (!command || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  if (command === "id") {
    const check = argv[1];
    if (!check) throw new Error("usage: loupe id <check> [locator]");
    process.stdout.write(`${deriveFindingId(check, argv[2])}\n`);
    return;
  }

  const { values, positionals } = parseArgs({
    args: argv.slice(1),
    allowPositionals: true,
    options: {
      out: { type: "string" },
      brand: { type: "string" },
      store: { type: "string" },
      html: { type: "boolean", default: false },
      retain: { type: "boolean", default: false },
    },
  });

  const input = positionals[0];
  if (!input) throw new Error(`usage: loupe ${command} <findings.json>`);
  const inputPath = resolve(input);

  if (command === "validate") {
    const audit = await loadAudit(inputPath);
    if (audit) {
      process.stdout.write(
        `OK — ${audit.findings.length} finding(s), rubric ${audit.rubric_version}, audit ${audit.audit_id}\n`,
      );
    }
    return;
  }

  if (command !== "render") {
    throw new Error(`unknown command "${command}"\n\n${USAGE}`);
  }

  const audit = await loadAudit(inputPath);
  if (!audit) return;

  const brand = await loadBrand(values.brand ? resolve(values.brand) : undefined);
  const { audit: withAssets, missing } = await inlineAssets(audit, dirname(inputPath));
  for (const item of missing) {
    process.stderr.write(`  warning: could not inline ${item.path} — ${item.reason}\n`);
  }

  const outPath = resolve(values.out ?? `out/${audit.audit_id}.pdf`);
  await mkdir(dirname(outPath), { recursive: true });

  const ctx = { audit: withAssets, brand };
  if (values.html) {
    const htmlPath = outPath.replace(/\.pdf$/i, "") + ".html";
    await writeFile(htmlPath, renderReportHtml(ctx), "utf8");
    process.stdout.write(`Wrote ${htmlPath}\n`);
  }

  const pdf = await renderPdfOnce(ctx);
  await writeFile(outPath, pdf);
  process.stdout.write(`Wrote ${outPath} (${(pdf.byteLength / 1024).toFixed(0)} KB)\n`);

  if (values.retain) {
    const stored = await saveAudit(audit, values.store ? { root: values.store } : {});
    process.stdout.write(`Retained ${stored}\n`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
