import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Audit } from "./schema/audit.ts";
import { clientSlug, pageKey } from "./schema/ids.ts";
import { parseAudit } from "./schema/validate.ts";

/**
 * Findings retention — BR §7.3 ("Findings files retained per client, keyed for
 * future diffing").
 *
 * This is deliberately a directory of JSON files, not a database. The recurring
 * delta audit in BR §8.2 is a later product; what it needs from Phase 1 is that
 * the files still exist and that they are filed somewhere a diff can find both
 * sides. Layout:
 *
 *   <root>/<client-slug>/<page-key>/index.json          ← what this key refers to
 *   <root>/<client-slug>/<page-key>/<date>__<id>.json   ← one audit run
 *
 * The page key is a hash of the normalised URL, so a re-audit of the same page
 * lands beside its predecessor even if the client name is recorded differently.
 */

export const DEFAULT_STORE_ROOT = "data/audits";

export interface StoreOptions {
  root?: string;
}

export interface PageIndex {
  client_name: string;
  page_url: string;
  page_key: string;
  audits: { audit_id: string; audited_on: string; file: string; findings: number }[];
}

export function auditDirectory(audit: Audit, options: StoreOptions = {}): string {
  return join(options.root ?? DEFAULT_STORE_ROOT, clientSlug(audit.client.name), pageKey(audit.page.url));
}

function auditFilename(audit: Audit): string {
  const safeId = audit.audit_id.replace(/[^A-Za-z0-9._-]/g, "-");
  return `${audit.audited_on}__${safeId}.json`;
}

async function readIndex(dir: string): Promise<PageIndex | undefined> {
  try {
    return JSON.parse(await readFile(join(dir, "index.json"), "utf8")) as PageIndex;
  } catch {
    return undefined;
  }
}

/** Persist a findings file and update the page index. Returns the path written. */
export async function saveAudit(audit: Audit, options: StoreOptions = {}): Promise<string> {
  const dir = auditDirectory(audit, options);
  await mkdir(dir, { recursive: true });

  const file = auditFilename(audit);
  const path = join(dir, file);
  await writeFile(path, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

  const existing = await readIndex(dir);
  const entries = (existing?.audits ?? []).filter((entry) => entry.file !== file);
  entries.push({
    audit_id: audit.audit_id,
    audited_on: audit.audited_on,
    file,
    findings: audit.findings.length,
  });
  entries.sort((a, b) => (a.audited_on === b.audited_on ? a.file.localeCompare(b.file) : a.audited_on.localeCompare(b.audited_on)));

  const index: PageIndex = {
    client_name: audit.client.name,
    page_url: audit.page.url,
    page_key: pageKey(audit.page.url),
    audits: entries,
  };
  await writeFile(join(dir, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");

  return path;
}

/** Every retained audit for one client/page pair, oldest first. */
export async function listAudits(
  clientName: string,
  pageUrl: string,
  options: StoreOptions = {},
): Promise<PageIndex | undefined> {
  const dir = join(options.root ?? DEFAULT_STORE_ROOT, clientSlug(clientName), pageKey(pageUrl));
  const index = await readIndex(dir);
  if (index) return index;

  // No index yet (hand-copied files); fall back to a directory scan.
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== "index.json").sort();
    if (files.length === 0) return undefined;
    return {
      client_name: clientName,
      page_url: pageUrl,
      page_key: pageKey(pageUrl),
      audits: files.map((file) => ({ audit_id: file.replace(/\.json$/, ""), audited_on: file.slice(0, 10), file, findings: 0 })),
    };
  } catch {
    return undefined;
  }
}

/** Load the most recent retained audit for a client/page pair. */
export async function loadLatestAudit(
  clientName: string,
  pageUrl: string,
  options: StoreOptions = {},
): Promise<Audit | undefined> {
  const index = await listAudits(clientName, pageUrl, options);
  const latest = index?.audits.at(-1);
  if (!index || !latest) return undefined;
  const dir = join(options.root ?? DEFAULT_STORE_ROOT, clientSlug(clientName), pageKey(pageUrl));
  const raw = JSON.parse(await readFile(join(dir, latest.file), "utf8")) as unknown;
  return parseAudit(raw).audit;
}
