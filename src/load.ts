import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrand, type Brand } from "./schema/brand.ts";

/**
 * Repository root, resolved from this module rather than the process cwd, by
 * walking up to the nearest package.json. Walking rather than counting
 * directories keeps the default brand and the sample findable whether the code
 * is running from source or from a compiled `dist/`.
 */
function findPackageRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return from;
    dir = parent;
  }
}

export const PACKAGE_ROOT = findPackageRoot(dirname(fileURLToPath(import.meta.url)));

export const DEFAULT_BRAND_PATH = resolve(PACKAGE_ROOT, "brand/loupe.brand.json");

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

/** Load a brand config. Falls back to the operator's own brand (BR §7.3). */
export async function loadBrand(path?: string): Promise<Brand> {
  return parseBrand(await readJson(path ?? DEFAULT_BRAND_PATH));
}
