import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { after, test } from "node:test";
import { parseAudit } from "../src/schema/validate.ts";
import { inlineAssets } from "../src/render/assets.ts";
import { ReportRenderer } from "../src/render/pdf.ts";
import { loadBrand, PACKAGE_ROOT } from "../src/load.ts";

/**
 * End-to-end check that the findings file the repo ships actually produces a
 * PDF. Skipped when no Chromium is available, so that a checkout without
 * `npx playwright install` still passes the rest of the suite.
 */

const SAMPLE = resolve(PACKAGE_ROOT, "examples/meridian-physio.audit.json");
const renderer = new ReportRenderer();

after(async () => {
  await renderer.close();
});

test("the sample findings file renders to a PDF with its screenshots embedded", async (t) => {
  const audit = parseAudit(JSON.parse(await readFile(SAMPLE, "utf8")) as unknown).audit;
  const brand = await loadBrand();
  const { audit: withAssets, missing } = await inlineAssets(audit, dirname(SAMPLE));

  assert.deepEqual(missing, [], "sample screenshots should all resolve");
  const screenshots = withAssets.findings.flatMap((f) => f.evidence.filter((e) => e.kind === "screenshot"));
  assert.ok(screenshots.length > 0);
  for (const shot of screenshots) {
    assert.match(shot.src, /^data:image\//, "screenshots must be inlined before render");
  }

  let pdf: Buffer;
  try {
    pdf = await renderer.renderPdf({ audit: withAssets, brand });
  } catch (error) {
    const message = (error as Error).message;
    if (/Executable doesn't exist|Failed to launch/i.test(message)) {
      t.skip(`no Chromium available: ${message.split("\n")[0]}`);
      return;
    }
    throw error;
  }

  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", "output is not a PDF");
  assert.ok(pdf.byteLength > 50_000, "a report with embedded screenshots should not be tiny");
});
