import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { auditSchema } from "../schema/audit.ts";
import { brandSchema } from "../schema/brand.ts";
import { PACKAGE_ROOT } from "../load.ts";

/**
 * Emit JSON Schema alongside the Zod definitions.
 *
 * Zod is the source of truth; the JSON Schema exists so that a findings file
 * can be authored in an editor with completion and inline validation, which is
 * the whole ergonomic case for authoring findings as data (BR §7.2).
 * Regenerate with `npm run schema` whenever the Zod schema changes.
 */

const targets = [
  { schema: auditSchema, id: "https://loupe.audit/schema/audit.schema.json", file: "schema/audit.schema.json", title: "Loupe landing page audit findings file" },
  { schema: brandSchema, id: "https://loupe.audit/schema/brand.schema.json", file: "schema/brand.schema.json", title: "Loupe report branding config" },
];

for (const target of targets) {
  const json = z.toJSONSchema(target.schema, { io: "input", unrepresentable: "any" });
  const document = { $id: target.id, title: target.title, ...json };
  const path = resolve(PACKAGE_ROOT, target.file);
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${target.file}\n`);
}
