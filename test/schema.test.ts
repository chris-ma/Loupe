import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { validateAudit } from "../src/schema/validate.ts";
import { PACKAGE_ROOT } from "../src/load.ts";

const SAMPLE = resolve(PACKAGE_ROOT, "examples/meridian-physio.audit.json");

async function sample(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(SAMPLE, "utf8")) as Record<string, unknown>;
}

function findings(audit: Record<string, unknown>) {
  return audit["findings"] as Record<string, unknown>[];
}

test("the shipped sample validates with no errors and no warnings", async () => {
  const result = validateAudit(await sample());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.warnings, [], "sample should not drift from the rubric");
    assert.equal(result.audit.findings.length, 8);
  }
});

test("more than ten findings is a schema error, not a matter of discipline", async () => {
  const audit = await sample();
  const first = findings(audit)[0]!;
  audit["findings"] = Array.from({ length: 11 }, (_, i) => ({
    ...first,
    id: `headline-outcome--0000000${i.toString(16)}`,
  }));
  const result = validateAudit(audit);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.map((e) => e.message).join(" "), /capped at ten/);
  }
});

test("a finding with no concrete fix is rejected", async () => {
  const audit = await sample();
  findings(audit)[0]!["recommendations"] = {};
  const result = validateAudit(audit);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.map((e) => e.message).join(" "), /at least one concrete fix/);
  }
});

test("a finding with no evidence is rejected", async () => {
  const audit = await sample();
  findings(audit)[0]!["evidence"] = [];
  const result = validateAudit(audit);
  assert.equal(result.ok, false);
});

test("duplicate finding IDs are an error, because they corrupt future diffs", async () => {
  const audit = await sample();
  const list = findings(audit);
  list[1]!["id"] = list[0]!["id"];
  const result = validateAudit(audit);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.map((e) => e.message).join(" "), /Duplicate finding ID/);
  }
});

test("a finding stamped with a different rubric version is an error", async () => {
  const audit = await sample();
  findings(audit)[2]!["rubric_version"] = "v2";
  const result = validateAudit(audit);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.map((e) => e.message).join(" "), /cannot mix rubric versions/);
  }
});

test("an uncatalogued check warns but still renders — the rubric is calibrated against real pages", async () => {
  const audit = await sample();
  const finding = findings(audit)[0]!;
  finding["check"] = "some-new-check";
  finding["id"] = "some-new-check--deadbeef";
  const result = validateAudit(audit);
  assert.equal(result.ok, true, "an unknown check must not block delivery");
  if (result.ok) {
    assert.match(result.warnings.map((w) => w.message).join(" "), /not in the rubric/);
  }
});

test("a hand-written ID warns that it is not stable across re-audits", async () => {
  const audit = await sample();
  findings(audit)[0]!["id"] = "my-own-id";
  const result = validateAudit(audit);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.warnings.map((w) => w.message).join(" "), /not derived from check \+ locator/);
  }
});

test("a severity inversion in the priority order warns", async () => {
  const audit = await sample();
  const list = findings(audit);
  [list[0], list[7]] = [list[7]!, list[0]!];
  audit["findings"] = list;
  const result = validateAudit(audit);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.warnings.map((w) => w.message).join(" "), /is ranked above/);
  }
});
