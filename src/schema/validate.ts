import { auditSchema, type Audit } from "./audit.ts";
import { deriveFindingId } from "./ids.ts";
import { RUBRIC_VERSION, SEVERITY_DEFINITIONS, findCheck, isKnownCheck } from "../rubric/v1.ts";

/**
 * Validation is two-tier on purpose.
 *
 * Errors are things that make the findings file unusable or that break a
 * promise made at the point of sale (more than ten findings, a finding with no
 * fix, a duplicate ID that would corrupt a future diff).
 *
 * Warnings are things that indicate the rubric and the audit have drifted
 * apart — an uncatalogued check, a hand-written ID, a priority order that
 * contradicts the severities. BR §11 has the rubric being calibrated against
 * real pages through audits 1-10, so these must not block a render; they must
 * be visible enough to act on afterwards.
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; audit: Audit; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

export function validateAudit(input: unknown): ValidationResult {
  const parsed = auditSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      warnings: [],
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.length ? issue.path.join(".") : "(root)",
        message: issue.message,
      })),
    };
  }

  const audit = parsed.data;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (audit.rubric_version !== RUBRIC_VERSION) {
    warnings.push({
      path: "rubric_version",
      message: `Audit declares rubric ${audit.rubric_version}; this build ships ${RUBRIC_VERSION}. The report will be stamped with the audit's value.`,
    });
  }

  const seen = new Map<string, number>();

  audit.findings.forEach((finding, index) => {
    const at = `findings[${index}]`;

    const firstSeen = seen.get(finding.id);
    if (firstSeen !== undefined) {
      errors.push({
        path: `${at}.id`,
        message: `Duplicate finding ID "${finding.id}" (also at findings[${firstSeen}]). IDs must be unique — a duplicate corrupts every future delta audit.`,
      });
    } else {
      seen.set(finding.id, index);
    }

    if (finding.rubric_version !== audit.rubric_version) {
      errors.push({
        path: `${at}.rubric_version`,
        message: `Finding is stamped ${finding.rubric_version} but the audit declares ${audit.rubric_version}. A report cannot mix rubric versions.`,
      });
    }

    if (!isKnownCheck(finding.check)) {
      warnings.push({
        path: `${at}.check`,
        message: `Check "${finding.check}" is not in the rubric ${RUBRIC_VERSION} catalogue. Add it to the rubric or correct the key before the next audit.`,
      });
    } else {
      const check = findCheck(finding.check);
      if (check && check.pillar !== finding.pillar) {
        warnings.push({
          path: `${at}.pillar`,
          message: `Check "${finding.check}" is catalogued under ${check.pillar}, but this finding is filed under ${finding.pillar}.`,
        });
      }
    }

    const derived = deriveFindingId(finding.check, finding.locator);
    if (finding.id !== derived) {
      warnings.push({
        path: `${at}.id`,
        message: `ID "${finding.id}" is not derived from check + locator (expected "${derived}"). Hand-written IDs are not guaranteed stable across re-audits — BR §7.3.`,
      });
    }
  });

  // Priority order is authoritative (position drives the "Do this week" page), so
  // flag the cases where it visibly contradicts the auditor's own severities.
  audit.findings.forEach((finding, index) => {
    const rank = SEVERITY_DEFINITIONS[finding.severity].rank;
    for (let below = index + 1; below < audit.findings.length; below += 1) {
      const other = audit.findings[below];
      if (!other) continue;
      if (SEVERITY_DEFINITIONS[other.severity].rank < rank - 1) {
        warnings.push({
          path: `findings[${index}]`,
          message: `"${finding.title}" (${finding.severity}) is ranked above "${other.title}" (${other.severity}). Intentional ordering is fine — confirm it is intentional.`,
        });
        return;
      }
    }
  });

  if (errors.length > 0) return { ok: false, errors, warnings };
  return { ok: true, audit, warnings };
}

/** Throwing wrapper for callers that want an `Audit` or an exception. */
export function parseAudit(input: unknown): { audit: Audit; warnings: ValidationIssue[] } {
  const result = validateAudit(input);
  if (!result.ok) {
    const detail = result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Findings file is invalid:\n${detail}`);
  }
  return { audit: result.audit, warnings: result.warnings };
}
