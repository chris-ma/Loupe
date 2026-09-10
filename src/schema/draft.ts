import { z } from "zod";
import { EFFORTS, PILLARS, SEVERITIES } from "../rubric/v1.ts";

/**
 * The shape an AI-generated draft finding is allowed to produce — BR §12
 * "automate the intake pipeline" scoped down to a safe first pass.
 *
 * This is deliberately narrower than `findingSchema` in schema/audit.ts:
 *
 *  - No `id` and no `rubric_version`. Both are computed in code after the
 *    model responds (`deriveFindingId`, `RUBRIC_VERSION`) so a stable ID is
 *    never something the model has to get right — it can't get it wrong.
 *  - Screenshot evidence carries a `viewport` label, never a `src`. The
 *    orchestrator substitutes the real captured screenshot for that viewport
 *    after the fact, so a finding can never cite a screenshot that was not
 *    actually taken.
 *  - No `metric` evidence kind. The model was never given analytics access —
 *    letting it emit a metric value would be indistinguishable from
 *    fabricating one. Metrics stay client-supplied, added at the human-review
 *    step from the real intake data if the client provided any.
 *
 * A draft produced against this schema is assembled into a full `Audit` (see
 * api/submit.ts) and then run through the real `validateAudit`, so every
 * structural guarantee the real findings schema makes — ten-finding cap, at
 * least one concrete fix, evidence required — still applies before the draft
 * is ever rendered.
 */

const nonEmpty = (label: string, max = 2000) =>
  z.string().trim().min(1, `${label} must not be empty`).max(max);

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/, "must be a lowercase slug, e.g. \"headline-outcome\"");

export const draftScreenshotEvidenceSchema = z.object({
  kind: z.literal("screenshot"),
  /** Which of the two captures this evidence is about. The real image is substituted in code. */
  viewport: z.enum(["desktop", "mobile"]),
  caption: nonEmpty("Screenshot caption", 400),
});

export const draftNoteEvidenceSchema = z.object({
  kind: z.literal("note"),
  text: nonEmpty("Evidence note", 1500),
});

export const draftEvidenceSchema = z.discriminatedUnion("kind", [
  draftScreenshotEvidenceSchema,
  draftNoteEvidenceSchema,
]);

export const draftRecommendationsSchema = z
  .object({
    quick: nonEmpty("Quick fix", 1500).optional(),
    medium: nonEmpty("Medium change", 1500).optional(),
    long_term: nonEmpty("Long-term redesign", 1500).optional(),
  })
  .refine((r) => Boolean(r.quick || r.medium || r.long_term), {
    message: "Every finding needs at least one concrete fix (quick, medium or long_term).",
  });

export const draftFindingSchema = z.object({
  /** Rubric check this finding answers — must be one of the catalogued keys (checked in code, not the schema, so an unfamiliar-but-plausible key warns rather than hard-fails). */
  check: slug,
  /** Where on the page it applies — CSS selector, named section, or omitted for page-wide. */
  locator: nonEmpty("Locator", 300).optional(),
  title: nonEmpty("Finding title", 120),
  pillar: z.enum(PILLARS),
  severity: z.enum(SEVERITIES),
  effort: z.enum(EFFORTS),
  observation: nonEmpty("Observation", 3000),
  evidence: z.array(draftEvidenceSchema).min(1, "Every finding must cite at least one piece of evidence"),
  impact: z.object({
    user: nonEmpty("User consequence", 1200),
    business: nonEmpty("Business consequence", 1200),
  }),
  recommendations: draftRecommendationsSchema,
});

export type DraftFinding = z.infer<typeof draftFindingSchema>;

export const draftAuditSchema = z.object({
  /** One-line diagnosis for the cover. Never a performance claim — BR §4.2. */
  verdict: nonEmpty("Verdict", 400),
  /** Ranked highest-priority first. Position is authoritative, same as the real schema. */
  findings: z
    .array(draftFindingSchema)
    .min(1, "A draft with no findings is not useful")
    .max(10, "Findings are capped at ten — BR §3, §6.2"),
});

export type DraftAudit = z.infer<typeof draftAuditSchema>;
