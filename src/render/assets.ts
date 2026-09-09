import { readFile } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import type { Audit } from "../schema/audit.ts";

/**
 * Inline every local asset a findings file references.
 *
 * The PDF route must render from a single HTML string with no base URL and no
 * asset host (BR §7.3: a route that accepts a findings file and returns a PDF).
 * Screenshots therefore have to be embedded before the page is set, not fetched
 * while it renders.
 */

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

export interface AssetResolution {
  audit: Audit;
  /** Assets that could not be inlined. The render continues without them. */
  missing: { path: string; reason: string }[];
}

/**
 * @param baseDir Directory that relative screenshot paths are resolved against —
 *                normally the directory holding the findings file.
 */
export async function inlineAssets(audit: Audit, baseDir: string): Promise<AssetResolution> {
  const missing: { path: string; reason: string }[] = [];

  const findings = await Promise.all(
    audit.findings.map(async (finding) => {
      const evidence = await Promise.all(
        finding.evidence.map(async (item) => {
          if (item.kind !== "screenshot") return item;
          if (/^(data:|https:|http:)/i.test(item.src)) return item;

          const path = isAbsolute(item.src) ? item.src : resolve(baseDir, item.src);
          const mime = MIME[extname(path).toLowerCase()];
          if (!mime) {
            missing.push({ path: item.src, reason: `unsupported image extension "${extname(path)}"` });
            return item;
          }
          try {
            const bytes = await readFile(path);
            return { ...item, src: `data:${mime};base64,${bytes.toString("base64")}` };
          } catch (error) {
            missing.push({ path: item.src, reason: (error as Error).message });
            return item;
          }
        }),
      );
      return { ...finding, evidence };
    }),
  );

  return { audit: { ...audit, findings }, missing };
}
