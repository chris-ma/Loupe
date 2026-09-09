import { createHash } from "node:crypto";

/**
 * Stable finding IDs — BR §7.3 diffing constraint.
 *
 * A finding ID must mean the same thing in audit #1 and in the delta audit
 * eleven months later, otherwise the recurring product in BR §8.2 cannot tell
 * "fixed" from "no longer detected". IDs are therefore derived from what the
 * finding is *about* — the rubric check, and where on the page it applies —
 * never from its position in the report, its severity, or its wording, all of
 * which legitimately change between runs.
 */

const SLUG = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

/** Normalise a locator so that cosmetically different references collapse to one ID. */
export function normaliseLocator(locator: string): string {
  return locator.trim().replace(/\s+/g, " ").toLowerCase();
}

function shortHash(input: string, length = 8): string {
  return createHash("sha256").update(input, "utf8").digest("hex").slice(0, length);
}

/**
 * Derive the stable ID for a finding.
 *
 * @param check   Rubric check key, e.g. "headline-outcome".
 * @param locator Where on the page the finding applies — a CSS selector, a named
 *                section, or a flow step. Omit for a finding that is about the
 *                page as a whole; it then resolves to the reserved "page" scope.
 */
export function deriveFindingId(check: string, locator?: string): string {
  if (!SLUG.test(check)) {
    throw new Error(
      `Invalid rubric check key ${JSON.stringify(check)}: expected a lowercase slug, e.g. "headline-outcome".`,
    );
  }
  const scope = locator && locator.trim() !== "" ? normaliseLocator(locator) : "page";
  return `${check}--${shortHash(scope)}`;
}

/** True when `id` is the ID that `check`/`locator` would derive. */
export function isDerivedId(id: string, check: string, locator?: string): boolean {
  try {
    return id === deriveFindingId(check, locator);
  } catch {
    return false;
  }
}

/**
 * Stable key for a page across audits. Used to file retained findings so a
 * re-audit lands beside its predecessor (BR §7.3 storage requirement).
 */
export function pageKey(url: string): string {
  let normalised: string;
  try {
    const u = new URL(url);
    u.hash = "";
    u.protocol = "https:";
    u.hostname = u.hostname.replace(/^www\./, "").toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    u.searchParams.sort();
    normalised = u.toString();
  } catch {
    normalised = url.trim().toLowerCase();
  }
  return shortHash(normalised, 12);
}

/** Filesystem-safe slug for a client name, used as the retention directory. */
export function clientSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? shortHash(name, 12) : slug;
}
