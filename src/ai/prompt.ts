import {
  CHECKS,
  EFFORT_DEFINITIONS,
  METHODOLOGY,
  PILLAR_DEFINITIONS,
  RUBRIC_VERSION,
  SEVERITY_DEFINITIONS,
} from "../rubric/v1.ts";

/**
 * System prompt for the AI draft pass — built from the live rubric module,
 * never hand-copied. If `src/rubric/v1.ts` changes, this prompt changes with
 * it automatically, so the model is always graded against the same rubric a
 * human auditor uses.
 *
 * This prompt produces an unreviewed first pass, not a deliverable. See
 * `api/submit.ts` for what happens around the call — most of the safety
 * properties (stable IDs, real screenshots, the ten-finding cap, no
 * fabricated metrics) are enforced in code before and after this call, not
 * by asking the model nicely.
 */
export function buildSystemPrompt(): string {
  const pillars = Object.entries(PILLAR_DEFINITIONS)
    .map(([key, p]) => `- ${key} (${p.label}): ${p.definition}`)
    .join("\n");

  const severities = Object.entries(SEVERITY_DEFINITIONS)
    .sort((a, b) => a[1].rank - b[1].rank)
    .map(([key, s]) => `- ${key}: ${s.definition}`)
    .join("\n");

  const efforts = Object.entries(EFFORT_DEFINITIONS)
    .sort((a, b) => a[1].rank - b[1].rank)
    .map(([key, e]) => `- ${key} (${e.band}): ${e.definition}`)
    .join("\n");

  const checks = CHECKS.map((c) => `- ${c.key} [${c.pillar}]: ${c.question}`).join("\n");

  return `
You are producing a first-pass DRAFT for a landing page audit. A human auditor
will review, correct and rewrite this before anything reaches the client — you
are drafting their starting point, not the deliverable. Say so nowhere on the
page itself; that framing is handled outside this call. Your job is simply to
be a useful, honest first pass: real observations, not padding.

## What you are given

Two screenshots of the page: one desktop capture (1440x900) and one mobile
capture (390x844), both taken just now by a real headless browser — not
described to you, actually captured. Use both; a finding true on desktop is
sometimes false on mobile and vice versa. You are also given the client's own
statement of the page's conversion goal and target audience.

## What you do not have, and must not invent

You were not given analytics, traffic data, or any performance metric. Do not
state a number — a bounce rate, a conversion rate, a load time, a traffic
share — that was not given to you in this prompt. If a finding would be
stronger with a number you don't have, say what evidence would confirm it
instead of inventing a plausible-sounding one. A fabricated metric is worse
than no metric: it is the one thing that would make this draft actively
misleading rather than merely incomplete.

## Rubric ${RUBRIC_VERSION}

### Pillars
${pillars}

### Severity (assign exactly one per finding)
${severities}

### Effort (assign exactly one per finding)
${efforts}

### Checks
Use these check keys where one genuinely fits. If none fits a real observation
you want to make, use your own short lowercase-hyphenated key rather than
force-fitting a wrong one — a human will review it.
${checks}

## What was assessed / not assessed, for context
Assessed: ${METHODOLOGY.assessed.join(" ")}
Not assessed: ${METHODOLOGY.notAssessed.join(" ")}

## Output

Call the \`draft_audit\` tool exactly once. Produce at most ten findings, in
the order you would fix them — position is meaningful, not just severity.
Every finding needs: the check it answers, its pillar/severity/effort, an
observation (what you actually saw, not a diagnosis label), at least one piece
of evidence citing which screenshot it comes from, the consequence for the
visitor AND for the business separately, and at least one concrete fix (a
quick fix, a medium change, or a long-term redesign — "the CTA is unclear" is
not a fix; "change the button text from X to Y" is).

Fewer, real findings beat ten padded ones. If the page only supports four
genuine findings, return four.
`.trim();
}

export function buildUserPrompt(input: {
  clientName: string;
  pageUrl: string;
  conversionGoal: string;
  audience: string;
  metricsNotes?: string | undefined;
}): string {
  const lines = [
    `Client: ${input.clientName}`,
    `Page: ${input.pageUrl}`,
    `Conversion goal: ${input.conversionGoal}`,
    `Target audience: ${input.audience}`,
  ];
  if (input.metricsNotes && input.metricsNotes.trim() !== "") {
    lines.push(
      `Client-supplied context (do not treat as verified data unless it plainly states a measured number with its source; still do not cite unstated numbers): ${input.metricsNotes.trim()}`,
    );
  }
  lines.push(
    "",
    "The desktop screenshot is attached first, the mobile screenshot second. Audit the page.",
  );
  return lines.join("\n");
}
