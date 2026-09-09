import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { createApp } from "../src/server.ts";
import { ReportRenderer } from "../src/render/pdf.ts";
import { PACKAGE_ROOT } from "../src/load.ts";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The route is exercised through its handler rather than a live socket: these
 * tests are about status codes and payload shape, not about HTTP itself.
 */

const SAMPLE = resolve(PACKAGE_ROOT, "examples/meridian-physio.audit.json");

interface Captured {
  status: number;
  headers: Record<string, string>;
  body: string;
}

async function call(path: string, body: unknown, method = "POST"): Promise<Captured> {
  const handler = createApp(new ReportRenderer());
  const payload = Buffer.from(JSON.stringify(body));

  const req = {
    method,
    url: path,
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (method !== "GET") yield payload;
    },
  } as unknown as IncomingMessage;

  const captured: Captured = { status: 0, headers: {}, body: "" };
  const res = {
    writeHead(status: number, headers: Record<string, string> = {}) {
      captured.status = status;
      captured.headers = headers;
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk) captured.body = Buffer.isBuffer(chunk) ? chunk.toString("latin1") : chunk;
    },
  } as unknown as ServerResponse;

  await handler(req, res);
  return captured;
}

test("GET /healthz reports the versions this instance will stamp", async () => {
  const res = await call("/healthz", null, "GET");
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body) as Record<string, unknown>;
  assert.equal(body["ok"], true);
  for (const key of ["schema_version", "rubric_version", "template_version"]) {
    assert.ok(body[key], `missing ${key}`);
  }
});

test("POST /validate accepts a bare findings file", async () => {
  const audit = JSON.parse(await readFile(SAMPLE, "utf8")) as unknown;
  const res = await call("/validate", audit);
  assert.equal(res.status, 200);
  assert.equal((JSON.parse(res.body) as { findings: number }).findings, 8);
});

test("POST /validate also accepts the {audit, brand} envelope", async () => {
  const audit = JSON.parse(await readFile(SAMPLE, "utf8")) as unknown;
  const res = await call("/validate", { audit });
  assert.equal(res.status, 200);
});

test("an invalid findings file is a 422 that names what is wrong", async () => {
  const audit = JSON.parse(await readFile(SAMPLE, "utf8")) as Record<string, unknown>;
  (audit["findings"] as Record<string, unknown>[])[0]!["severity"] = "catastrophic";
  const res = await call("/render", audit);
  assert.equal(res.status, 422);
  const body = JSON.parse(res.body) as { ok: boolean; errors: { path: string }[] };
  assert.equal(body.ok, false);
  assert.ok(body.errors.some((e) => e.path.includes("severity")));
});

test("POST /preview returns HTML for checking a layout without a browser", async () => {
  const audit = JSON.parse(await readFile(SAMPLE, "utf8")) as unknown;
  const res = await call("/preview", audit);
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /text\/html/);
  assert.ok(res.body.includes("Do this week"));
});

test("an unknown route is a 404 and a GET to /render is a 405", async () => {
  assert.equal((await call("/nope", {})).status, 404);
  assert.equal((await call("/render", null, "GET")).status, 405);
});

test("an empty body is rejected before any render work", async () => {
  const handler = createApp(new ReportRenderer());
  const req = {
    method: "POST",
    url: "/render",
    headers: {},
    async *[Symbol.asyncIterator]() {},
  } as unknown as IncomingMessage;
  let status = 0;
  const res = {
    writeHead(code: number) {
      status = code;
      return this;
    },
    end() {},
  } as unknown as ServerResponse;
  await handler(req, res);
  assert.equal(status, 400);
});
