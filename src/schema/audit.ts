import { z } from "zod";
import { EFFORTS, PILLARS, RUBRIC_VERSION, SEVERITIES } from "../rubric/v1.ts";

/**
 * The findings file — BR §7.2.
 *
 * Findings are authored as structured data, never as prose in a document. The
 * cap of ten is encoded here rather than left to discipline: BR §3 sells "max
 * 10 ranked findings" and BR §6.2 treats comprehensiveness as the enemy of
 * implementation, so an eleventh finding is a schema error, not a judgement
 * call. If a real page cannot be expressed in this shape, that is the BR §10
 * signal that the offer is not scoped tightly enough — retighten the scope or
 * the rubric, do not loosen the schema.
 */

export const SCHEMA_VERSION = "1.0" as const;

const nonEmpty = (label: string, max = 2000) =>
  z.string().trim().min(1, `${label} must not be empty`).max(max);

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/, "must be a lowercase slug, e.g. \"headline-outcome\"");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date, YYYY-MM-DD");

/* ------------------------------------------------------------------ *
 * Evidence — BR §7.2 ("Screenshot reference or metric value")
 * ------------------------------------------------------------------ */

export const screenshotEvidenceSchema = z.object({
  kind: z.literal("screenshot"),
  /** File path relative to the findings file, an absolute path, an https URL, or a data URI. */
  src: nonEmpty("Screenshot src", 4_000_000),
  caption: nonEmpty("Screenshot caption", 400),
  /** Optional viewport the screenshot was taken at, e.g. "mobile 390x844". */
  viewport: nonEmpty("Viewport", 80).optional(),
});

export const metricEvidenceSchema = z.object({
  kind: z.literal("metric"),
  label: nonEmpty("Metric label", 200),
  value: nonEmpty("Metric value", 200),
  /** Where the number came from. A metric without a source is an assertion. */
  source: nonEmpty("Metric source", 300),
  period: nonEmpty("Metric period", 120).optional(),
});

export const noteEvidenceSchema = z.object({
  kind: z.literal("note"),
  text: nonEmpty("Evidence note", 1500),
  source: nonEmpty("Evidence source", 300).optional(),
});

export const evidenceSchema = z.discriminatedUnion("kind", [
  screenshotEvidenceSchema,
  metricEvidenceSchema,
  noteEvidenceSchema,
]);

/* ------------------------------------------------------------------ *
 * Recommendations — BR §7.2 ("Quick fix / medium change / long-term redesign")
 * ------------------------------------------------------------------ */

export const recommendationsSchema = z
  .object({
    quick: nonEmpty("Quick fix", 1500).optional(),
    medium: nonEmpty("Medium change", 1500).optional(),
    long_term: nonEmpty("Long-term redesign", 1500).optional(),
  })
  .refine((r) => Boolean(r.quick || r.medium || r.long_term), {
    message:
      "Every finding must carry at least one concrete fix (quick, medium or long_term) — BR §6.2.",
  });

/* ------------------------------------------------------------------ *
 * Finding
 * ------------------------------------------------------------------ */

export const findingSchema = z.object({
  /**
   * Stable across re-audits — BR §7.2. Derive with `deriveFindingId(check, locator)`
   * rather than inventing one; `validateAudit` warns when the two disagree.
   */
  id: slug.or(z.string().regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*--[0-9a-f]{8}$/)),
  /** Rubric check the finding answers. Keys are catalogued in the rubric module. */
  check: slug,
  /** Where on the page it applies — selector, named section, or flow step. Omit for page-wide. */
  locator: nonEmpty("Locator", 300).optional(),
  /** Short label for the priority table and the section heading. */
  title: nonEmpty("Finding title", 120),
  pillar: z.enum(PILLARS),
  severity: z.enum(SEVERITIES),
  effort: z.enum(EFFORTS),
  /** What was found. Observation only — the consequence belongs in `impact`. */
  observation: nonEmpty("Observation", 3000),
  evidence: z.array(evidenceSchema).min(1, "Every finding must cite at least one piece of evidence"),
  impact: z.object({
    user: nonEmpty("User consequence", 1200),
    business: nonEmpty("Business consequence", 1200),
  }),
  recommendations: recommendationsSchema,
  rubric_version: nonEmpty("Rubric version", 20),
});

export type Finding = z.infer<typeof findingSchema>;

/* ------------------------------------------------------------------ *
 * Audit envelope
 * ------------------------------------------------------------------ */

export const clientSchema = z.object({
  name: nonEmpty("Client name", 200),
  contact: nonEmpty("Client contact", 200).optional(),
});

export const pageSchema = z.object({
  url: z.string().url("Page URL must be a valid URL"),
  name: nonEmpty("Page name", 200).optional(),
  /** The single conversion this page exists to produce. Intake form, BR §6.1. */
  conversion_goal: nonEmpty("Conversion goal", 400),
  /** Who the page is for, as the client describes them. */
  audience: nonEmpty("Target audience", 600),
  /** Client-supplied metrics, taken as given and cited where used. Optional at intake. */
  current_metrics: z.array(metricEvidenceSchema.omit({ kind: true })).optional(),
});

export const auditSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  /** Stable identifier for this audit run. Any unique slug; the date-prefixed form sorts well. */
  audit_id: nonEmpty("Audit ID", 120),
  client: clientSchema,
  page: pageSchema,
  audited_on: isoDate,
  delivered_on: isoDate.optional(),
  rubric_version: nonEmpty("Rubric version", 20),
  /** One-line verdict for the cover. Diagnosis, never a performance claim — BR §4.2. */
  verdict: nonEmpty("Verdict", 400).optional(),
  /**
   * Findings in priority order. Position is authoritative: index 0-2 are the
   * "Do this week" page (BR §7.1) and the table renders in this order.
   */
  findings: z
    .array(findingSchema)
    .min(1, "An audit with no findings is not a deliverable")
    .max(10, "Findings are capped at ten — BR §3, §6.2"),
  /** Anything excluded from this audit beyond the standing rubric exclusions. */
  exclusions: z.array(nonEmpty("Exclusion", 400)).optional(),
});

export type Audit = z.infer<typeof auditSchema>;
export type AuditClient = z.infer<typeof clientSchema>;
export type AuditPage = z.infer<typeof pageSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Recommendations = z.infer<typeof recommendationsSchema>;

export const CURRENT_RUBRIC_VERSION = RUBRIC_VERSION;
