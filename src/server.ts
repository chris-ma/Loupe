import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { inlineAssets } from "./render/assets.ts";
import { ReportRenderer } from "./render/pdf.ts";
import { renderReportHtml, TEMPLATE_VERSION } from "./render/template.ts";
import { parseBrand } from "./schema/brand.ts";
import { validateAudit } from "./schema/validate.ts";
import { RUBRIC_VERSION } from "./rubric/v1.ts";
import { SCHEMA_VERSION } from "./schema/audit.ts";
import { loadBrand } from "./load.ts";

/**
 * Deployment surface — BR §7.3 ("Route accepting findings file, returning PDF").
 *
 *   POST /render    findings JSON (or {audit, brand}) -> application/pdf
 *   POST /preview   the same, returning HTML, for checking a layout without a PDF
 *   POST /validate  findings JSON -> validation result
 *   GET  /healthz   liveness plus the versions this instance stamps
 *
 * Auth is a single bearer token from $LOUPE_API_TOKEN. Unset means open, which
 * is correct on localhost and wrong anywhere else — the route refuses to bind a
 * non-loopback host without it.
 *
 * Screenshots must arrive as data URIs: the route has no filesystem context for
 * the caller's relative paths.
 */

const MAX_BODY_BYTES = 32 * 1024 * 1024;

interface RenderRequest {
  audit: unknown;
  brand?: unknown;
}

function unwrap(payload: unknown): RenderRequest {
  if (payload && typeof payload === "object" && "audit" in payload) {
    return payload as RenderRequest;
  }
  return { audit: payload };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) throw new HttpError(400, "Empty request body");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    throw new HttpError(400, `Body is not valid JSON: ${(error as Error).message}`);
  }
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authorised(req: IncomingMessage): boolean {
  const expected = process.env["LOUPE_API_TOKEN"];
  if (!expected) return true;
  const header = req.headers.authorization ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

export function createApp(renderer: ReportRenderer) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");

    try {
      if (req.method === "GET" && url.pathname === "/healthz") {
        sendJson(res, 200, {
          ok: true,
          schema_version: SCHEMA_VERSION,
          rubric_version: RUBRIC_VERSION,
          template_version: TEMPLATE_VERSION,
        });
        return;
      }

      if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
      if (!authorised(req)) throw new HttpError(401, "Missing or invalid bearer token");

      const { audit: rawAudit, brand: rawBrand } = unwrap(await readBody(req));
      const result = validateAudit(rawAudit);

      if (url.pathname === "/validate") {
        sendJson(res, result.ok ? 200 : 422, result.ok
          ? { ok: true, warnings: result.warnings, findings: result.audit.findings.length }
          : { ok: false, errors: result.errors, warnings: result.warnings });
        return;
      }

      if (url.pathname !== "/render" && url.pathname !== "/preview") {
        throw new HttpError(404, `No route for ${url.pathname}`);
      }

      if (!result.ok) {
        sendJson(res, 422, { ok: false, errors: result.errors, warnings: result.warnings });
        return;
      }

      const brand = rawBrand ? parseBrand(rawBrand) : await loadBrand();
      // No filesystem context for a request body, so only data/https sources survive.
      const { audit, missing } = await inlineAssets(result.audit, process.cwd());
      const ctx = { audit, brand };

      const warningHeader = [
        ...result.warnings.map((w) => `${w.path}: ${w.message}`),
        ...missing.map((m) => `asset ${m.path}: ${m.reason}`),
      ];

      if (url.pathname === "/preview") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderReportHtml(ctx));
        return;
      }

      const pdf = await renderer.renderPdf(ctx);
      const filename = `${audit.audit_id.replace(/[^A-Za-z0-9._-]/g, "-")}.pdf`;
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": String(pdf.byteLength),
        "content-disposition": `attachment; filename="${filename}"`,
        ...(warningHeader.length ? { "x-loupe-warnings": JSON.stringify(warningHeader).slice(0, 4000) } : {}),
      });
      res.end(pdf);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { ok: false, error: error.message });
        return;
      }
      process.stderr.write(`render failed: ${(error as Error).stack ?? String(error)}\n`);
      sendJson(res, 500, { ok: false, error: "Render failed" });
    }
  };
}

export function startServer(port: number, host: string) {
  if (!process.env["LOUPE_API_TOKEN"] && host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `Refusing to bind ${host} without $LOUPE_API_TOKEN. Set a token, or bind 127.0.0.1.`,
    );
  }
  const renderer = new ReportRenderer();
  const server = createServer((req, res) => {
    void createApp(renderer)(req, res);
  });
  server.listen(port, host, () => {
    process.stderr.write(`loupe render service on http://${host}:${port}\n`);
  });
  const shutdown = () => {
    server.close(() => {
      void renderer.close().then(() => process.exit(0));
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return server;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  startServer(Number(process.env["PORT"] ?? 8787), process.env["HOST"] ?? "127.0.0.1");
}
