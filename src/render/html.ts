/** Minimal HTML helpers. The template is a string builder, not a framework. */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text for insertion into element content or a quoted attribute. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * Escape text and promote blank-line-separated blocks to paragraphs.
 * Findings are authored as plain text; no markup is honoured, by design.
 */
export function paras(value: string, className?: string): string {
  const cls = className ? ` class="${esc(className)}"` : "";
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p${cls}>${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** Join class names, dropping falsy entries. */
export function cx(...names: (string | false | undefined | null)[]): string {
  return names.filter(Boolean).join(" ");
}
