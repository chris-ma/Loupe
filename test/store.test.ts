import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parseAudit } from "../src/schema/validate.ts";
import { listAudits, loadLatestAudit, saveAudit } from "../src/store.ts";
import { PACKAGE_ROOT } from "../src/load.ts";

const SAMPLE = resolve(PACKAGE_ROOT, "examples/meridian-physio.audit.json");

async function sampleAudit() {
  return parseAudit(JSON.parse(await readFile(SAMPLE, "utf8")) as unknown).audit;
}

test("a re-audit is filed beside its predecessor, ready for a delta — BR §8.2", async () => {
  const root = await mkdtemp(join(tmpdir(), "loupe-store-"));
  try {
    const first = await sampleAudit();
    await saveAudit(first, { root });

    // Twelve months on: same page, recorded with a different URL form and a
    // different audit ID. It must land in the same place.
    const second = structuredClone(first);
    second.audit_id = "2027-09-04-meridian-physio-specimen";
    second.audited_on = "2027-09-04";
    second.page.url = "https://www.example.com/meridian-physio/new-patient/";
    await saveAudit(second, { root });

    const index = await listAudits(first.client.name, first.page.url, { root });
    assert.ok(index);
    assert.equal(index.audits.length, 2, "the two runs must share one page key");
    assert.deepEqual(
      index.audits.map((entry) => entry.audit_id),
      [first.audit_id, second.audit_id],
      "runs are listed oldest first",
    );

    const latest = await loadLatestAudit(first.client.name, first.page.url, { root });
    assert.equal(latest?.audit_id, second.audit_id);
    assert.deepEqual(
      latest?.findings.map((f) => f.id),
      first.findings.map((f) => f.id),
      "finding IDs must survive the round trip — they are what a diff joins on",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("re-saving the same run replaces it rather than duplicating the index entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "loupe-store-"));
  try {
    const audit = await sampleAudit();
    await saveAudit(audit, { root });
    await saveAudit(audit, { root });
    const index = await listAudits(audit.client.name, audit.page.url, { root });
    assert.equal(index?.audits.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an unknown client or page reads back as undefined, not as an error", async () => {
  const root = await mkdtemp(join(tmpdir(), "loupe-store-"));
  try {
    assert.equal(await listAudits("Nobody", "https://example.com/none", { root }), undefined);
    assert.equal(await loadLatestAudit("Nobody", "https://example.com/none", { root }), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
