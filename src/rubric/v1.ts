/**
 * Rubric v1 — the assessment frame for a Loupe landing page audit.
 *
 * Every enumerated value a finding can carry is defined here, with the
 * definition that makes it defensible. The rubric version is stamped into
 * each finding and into the report footer so that a delivered report can
 * always be read against the frame it was produced under.
 *
 * Per BR §11, the rubric is calibrated by real pages, not by design. Expect
 * v2 once audits 1-10 are delivered. Never edit v1 in place after a report
 * has shipped against it — add a v2 module instead.
 */

export const RUBRIC_VERSION = "v1" as const;

/* ------------------------------------------------------------------ *
 * Pillars — BR §7.2
 * ------------------------------------------------------------------ */

export const PILLARS = ["structural", "behavioral", "pre-build", "user-testing"] as const;
export type Pillar = (typeof PILLARS)[number];

export const PILLAR_DEFINITIONS: Record<Pillar, { label: string; definition: string }> = {
  structural: {
    label: "Structural",
    definition:
      "What the page is made of and how it is put together: information hierarchy, offer clarity, " +
      "message match against the inbound source, form and call-to-action construction, technical " +
      "delivery (load, layout stability, mobile rendering).",
  },
  behavioral: {
    label: "Behavioral",
    definition:
      "How visitors actually move through the page: attention order, scroll depth, friction and " +
      "hesitation points, drop-off against the stated conversion goal.",
  },
  "pre-build": {
    label: "Pre-Build",
    definition:
      "Decisions made before the page existed that the page is now paying for: audience definition, " +
      "traffic quality and intent, the offer itself, and whether the conversion goal is the right one.",
  },
  "user-testing": {
    label: "User Testing",
    definition:
      "What real people report when asked to use the page: comprehension, stated objections, and the " +
      "gap between what the page assumes a visitor knows and what they actually know.",
  },
};

/* ------------------------------------------------------------------ *
 * Severity — BR §7.2 ("Enumerated, defined in rubric")
 * ------------------------------------------------------------------ */

export const SEVERITIES = ["critical", "high", "moderate", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Ascending order of concern. Lower `rank` = more severe. */
export const SEVERITY_DEFINITIONS: Record<
  Severity,
  { label: string; rank: number; definition: string }
> = {
  critical: {
    label: "Critical",
    rank: 1,
    definition:
      "Prevents conversion outright for an identifiable segment of visitors, or actively misleads them. " +
      "The page cannot do its job until this is fixed.",
  },
  high: {
    label: "High",
    rank: 2,
    definition:
      "Suppresses conversion materially. Visitors can still convert, but a substantial share will not " +
      "because of this. Evidence points to a repeated, not incidental, effect.",
  },
  moderate: {
    label: "Moderate",
    rank: 3,
    definition:
      "Adds avoidable friction or ambiguity. The effect is real but narrower — confined to a segment, " +
      "a device class, or a single step.",
  },
  low: {
    label: "Low",
    rank: 4,
    definition:
      "A defect of craft or consistency with no demonstrated conversion cost. Included because it is " +
      "cheap to fix, not because it is holding the page back.",
  },
};

/* ------------------------------------------------------------------ *
 * Effort — BR §6.2 ("Effort estimates sit alongside impact")
 * ------------------------------------------------------------------ */

export const EFFORTS = ["quick", "medium", "large"] as const;
export type Effort = (typeof EFFORTS)[number];

export const EFFORT_DEFINITIONS: Record<
  Effort,
  { label: string; rank: number; band: string; definition: string }
> = {
  quick: {
    label: "Quick",
    rank: 1,
    band: "under 2 hours",
    definition: "A copy, config or styling change. No new design, no new component, no release risk.",
  },
  medium: {
    label: "Medium",
    rank: 2,
    band: "half a day to two days",
    definition:
      "A layout or component change, or a change touching a form or tracking. Needs design or dev " +
      "attention but not a rethink.",
  },
  large: {
    label: "Large",
    rank: 3,
    band: "more than two days",
    definition:
      "A structural rework — new sections, a changed flow, or a decision that reaches back past the " +
      "page itself. Sequence it, do not squeeze it in.",
  },
};

/* ------------------------------------------------------------------ *
 * Check catalogue
 *
 * A check is the reusable question the auditor asked. It is what makes a
 * finding comparable across audits and across re-audits of the same page,
 * and it is the first component of a stable finding ID (BR §7.3).
 *
 * The catalogue is advisory, not closed: an unknown check key validates with
 * a warning, never an error. BR §10 expects the rubric to be retightened
 * against the first two audits, and a closed enum would block that.
 * ------------------------------------------------------------------ */

export interface RubricCheck {
  key: string;
  pillar: Pillar;
  question: string;
}

export const CHECKS: readonly RubricCheck[] = [
  // Structural
  { key: "headline-outcome", pillar: "structural", question: "Does the headline state an outcome the visitor wants, in their words?" },
  { key: "message-match", pillar: "structural", question: "Does the page match the promise of the ad, email or link that delivered the visitor?" },
  { key: "offer-legibility", pillar: "structural", question: "Can a first-time visitor state what is being offered, to whom, and at what price?" },
  { key: "primary-cta-clarity", pillar: "structural", question: "Is there one primary action, and is what happens after clicking it unambiguous?" },
  { key: "cta-placement", pillar: "structural", question: "Is the primary action reachable at every point a visitor is likely to be convinced?" },
  { key: "form-friction", pillar: "structural", question: "Does the form ask only for what is needed to deliver the next step?" },
  { key: "proof-placement", pillar: "structural", question: "Is evidence of the claim adjacent to the claim, rather than pooled in a testimonial band?" },
  { key: "objection-coverage", pillar: "structural", question: "Are the objections that actually stop this buyer addressed on the page?" },
  { key: "visual-hierarchy", pillar: "structural", question: "Does visual weight follow decision order, or does decoration outrank the argument?" },
  { key: "mobile-rendering", pillar: "structural", question: "Does the page hold its argument and its tap targets at mobile widths?" },
  { key: "page-performance", pillar: "structural", question: "Do load and layout stability stay inside thresholds for the visitor's likely connection?" },
  { key: "accessibility-blockers", pillar: "structural", question: "Can the page be read and completed with a keyboard, a screen reader, and low contrast tolerance?" },
  { key: "trust-signals", pillar: "structural", question: "Are the signals a cautious buyer looks for present where they look for them?" },

  // Behavioral
  { key: "attention-order", pillar: "behavioral", question: "Does the first screen direct attention to the argument or away from it?" },
  { key: "scroll-depth", pillar: "behavioral", question: "Do visitors reach the sections the page depends on to convince them?" },
  { key: "drop-off-point", pillar: "behavioral", question: "Where does the measured funnel lose people, and does the page explain why?" },
  { key: "hesitation-signal", pillar: "behavioral", question: "Are there repeated hesitation behaviours — rage clicks, form abandons, back-and-forth?" },
  { key: "device-split", pillar: "behavioral", question: "Does conversion differ by device in a way the page design accounts for?" },
  { key: "analytics-integrity", pillar: "behavioral", question: "Is the conversion actually being measured, correctly, and attributable to a source?" },

  // Pre-Build
  { key: "traffic-quality", pillar: "pre-build", question: "Is the page underperforming, or is it being sent the wrong visitors?" },
  { key: "audience-definition", pillar: "pre-build", question: "Is the page written for one identifiable buyer, or averaged across several?" },
  { key: "goal-fit", pillar: "pre-build", question: "Is the stated conversion the right next step for a visitor at this level of intent?" },
  { key: "offer-strength", pillar: "pre-build", question: "Is the offer itself competitive, or is the page being asked to carry a weak one?" },
  { key: "funnel-position", pillar: "pre-build", question: "Does the page ask for a commitment proportionate to where the visitor is in their decision?" },

  // User Testing
  { key: "comprehension-gap", pillar: "user-testing", question: "Do first-time readers describe the offer the way the page intends?" },
  { key: "stated-objection", pillar: "user-testing", question: "What do testers say stops them, and is it addressed anywhere on the page?" },
  { key: "assumed-knowledge", pillar: "user-testing", question: "Does the page assume vocabulary or context the visitor does not arrive with?" },
  { key: "task-completion", pillar: "user-testing", question: "Can a tester complete the conversion unaided, and where do they stall?" },
];

const CHECK_INDEX = new Map(CHECKS.map((c) => [c.key, c]));

export function findCheck(key: string): RubricCheck | undefined {
  return CHECK_INDEX.get(key);
}

export function isKnownCheck(key: string): boolean {
  return CHECK_INDEX.has(key);
}

/** What the audit covers, and what it does not — printed verbatim in the methodology note (BR §7.1). */
export const METHODOLOGY = {
  version: RUBRIC_VERSION,
  assessed: [
    "One landing page or one conversion flow, at the URL recorded on the cover.",
    "The four rubric pillars: Structural, Behavioral, Pre-Build and User Testing.",
    "Desktop and mobile rendering of the page as served at the time of audit.",
    "Any analytics or metrics supplied by the client, taken as given and cited where used.",
  ],
  notAssessed: [
    "Pages other than the one recorded on the cover.",
    "Implementation of any recommendation in this report.",
    "A/B test design or execution.",
    "Metrics the client did not supply and that are not observable from the page itself.",
    "Back-end systems, payment processing, or anything past the point of conversion.",
  ],
  limits: [
    "Findings are ranked against the rubric named above, not against a statistical model of this page's visitors.",
    "Where a finding rests on a client-supplied metric, the metric is cited and the finding inherits its accuracy.",
    "This report makes no prediction of conversion rate change. Impact is stated as a mechanism, not a percentage.",
  ],
} as const;
