import assert from "node:assert/strict";
import { test } from "node:test";
import { draftAuditSchema } from "../src/schema/draft.ts";
import { buildSystemPrompt, buildUserPrompt } from "../src/ai/prompt.ts";
import { CHECKS, RUBRIC_VERSION } from "../src/rubric/v1.ts";
import { deriveFindingId } from "../src/schema/ids.ts";
import { z } from "zod";

const validDraft = {
  verdict: "The page undersells its own offer.",
  findings: [
    {
      check: "headline-outcome",
      locator: "hero h1",
      title: "Headline does not state an outcome",
      pillar: "structural",
      severity: "high",
      effort: "quick",
      observation: "The headline names the company, not what the visitor gets.",
      evidence: [{ kind: "screenshot", viewport: "desktop", caption: "Hero headline at 1440px." }],
      impact: { user: "Cannot tell if this solves their problem.", business: "Bounces before reading further." },
      recommendations: { quick: "Rewrite the headline to name the outcome." },
    },
  ],
};

test("a well-formed draft validates", () => {
  const result = draftAuditSchema.safeParse(validDraft);
  assert.equal(result.success, true);
});

test("draft evidence cannot carry a metric — the model has no analytics access", () => {
  const withMetric = structuredClone(validDraft);
  // @ts-expect-error deliberately invalid — metric evidence must be rejected
  withMetric.findings[0].evidence.push({ kind: "metric", label: "Bounce rate", value: "80%", source: "Guess" });
  const result = draftAuditSchema.safeParse(withMetric);
  assert.equal(result.success, false);
});

test("draft screenshot evidence cannot carry a src — the orchestrator supplies the real one", () => {
  const withSrc = structuredClone(validDraft);
  (withSrc.findings[0]!.evidence[0] as Record<string, unknown>)["src"] = "https://not-a-real-capture.example/x.png";
  // Zod strips unknown keys by default rather than rejecting them, so assert the
  // parsed output has no `src` rather than asserting the parse fails.
  const result = draftAuditSchema.parse(withSrc);
  assert.equal((result.findings[0]!.evidence[0] as Record<string, unknown>)["src"], undefined);
});

test("more than ten draft findings is rejected, same cap as the real schema", () => {
  const many = structuredClone(validDraft);
  many.findings = Array.from({ length: 11 }, () => structuredClone(validDraft.findings[0]!));
  const result = draftAuditSchema.safeParse(many);
  assert.equal(result.success, false);
});

test("a finding with no fix is rejected", () => {
  const noFix = structuredClone(validDraft) as Record<string, unknown>;
  (noFix["findings"] as Record<string, unknown>[])[0]!["recommendations"] = {};
  const result = draftAuditSchema.safeParse(noFix);
  assert.equal(result.success, false);
});

test("the draft schema converts to a JSON tool schema without throwing", () => {
  // draftRecommendationsSchema carries a .refine(), same as the real schema —
  // this is exactly the case unrepresentable:"any" exists to handle.
  assert.doesNotThrow(() => z.toJSONSchema(draftAuditSchema, { io: "input", unrepresentable: "any" }));
});

test("the system prompt embeds every catalogued check and the current rubric version", () => {
  const prompt = buildSystemPrompt();
  assert.ok(prompt.includes(RUBRIC_VERSION));
  for (const check of CHECKS) {
    assert.ok(prompt.includes(check.key), `prompt is missing check "${check.key}"`);
  }
});

test("the user prompt carries the intake fields and omits metrics notes when absent", () => {
  const withNotes = buildUserPrompt({
    clientName: "Acme",
    pageUrl: "https://acme.example/lp",
    conversionGoal: "A completed booking",
    audience: "First-time buyers",
    metricsNotes: "GA4 shows 1.1% conversion",
  });
  assert.ok(withNotes.includes("Acme"));
  assert.ok(withNotes.includes("GA4 shows 1.1% conversion"));

  const withoutNotes = buildUserPrompt({
    clientName: "Acme",
    pageUrl: "https://acme.example/lp",
    conversionGoal: "A completed booking",
    audience: "First-time buyers",
  });
  assert.ok(!withoutNotes.toLowerCase().includes("client-supplied context"));
});

test("a draft finding's id is derived the same way a manual finding's is — same stability guarantee", () => {
  const id = deriveFindingId(validDraft.findings[0]!.check, validDraft.findings[0]!.locator);
  assert.match(id, /^headline-outcome--[0-9a-f]{8}$/);
});
