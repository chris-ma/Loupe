import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import { chromium as playwrightChromium, type Browser } from "playwright-core";
import chromiumBinary from "@sparticuz/chromium-min";

import { buildSystemPrompt, buildUserPrompt } from "../src/ai/prompt.ts";
import { deriveFindingId } from "../src/schema/ids.ts";
import { draftAuditSchema, type DraftAudit } from "../src/schema/draft.ts";
import { RUBRIC_VERSION } from "../src/rubric/v1.ts";
import type { Audit } from "../src/schema/audit.ts";
import { validateAudit } from "../src/schema/validate.ts";
import { pdfMargin, renderFooterTemplate, renderReportHtml } from "../src/render/template.ts";
import { loadBrand } from "../src/load.ts";

/**
 * Intake endpoint — BR §6.1 Intake, automated per the AI-draft pipeline.
 *
 * The client's experience does not change: they fill in one form, the offer,
 * price and turnaround stay exactly as sold (§3, §6.1). What happens behind
 * this endpoint is new — the submission is used to generate an unreviewed AI
 * first-pass audit, emailed to the operator only, never the client. It is a
 * starting point for the human-delivered report, not a replacement for one:
 * see the draft banner baked into the PDF itself (src/render/template.ts) and
 * BR §8.1's own reasoning for why an unreviewed AI report is not the product
 * being sold at this price.
 *
 * Runs synchronously end to end (capture → model → PDF → email) rather than
 * handing off to a background task, so the client's browser simply waits for
 * the confirmation — no dependency on Vercel's background-execution behavior,
 * which is unconfirmed for this project's plan/settings. See vercel.json for
 * the duration budget this needs.
 */

/* ------------------------------------------------------------------ *
 * Intake validation
 * ------------------------------------------------------------------ */

const intakeSchema = z.object({
  client_name: z.string().trim().min(1, "Name is required").max(200),
  contact_email: z.string().trim().email("Enter a valid email address").max(320),
  page_url: z.string().trim().url("Enter a valid URL, including https://").max(2000),
  conversion_goal: z.string().trim().min(1, "Tell us what counts as a conversion").max(400),
  audience: z.string().trim().min(1, "Tell us who the page is for").max(600),
  metrics_notes: z.string().trim().max(2000).optional(),
  /** Honeypot. Real visitors never see or fill this field — see site/intake.html. */
  company_website: z.string().optional(),
});

type Intake = z.infer<typeof intakeSchema>;

/* ------------------------------------------------------------------ *
 * SSRF guard
 *
 * page_url is supplied by anyone who can reach this public form. Before it is
 * handed to a real browser running server-side, rule out anything that could
 * make this endpoint fetch internal infrastructure on the caller's behalf.
 * ------------------------------------------------------------------ */

function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts as [number, number, number, number];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && parts[1]! >= 64 && parts[1]! <= 127) return true; // CGNAT
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
    if (lower.startsWith("::ffff:")) return isPrivateOrReservedIp(lower.replace("::ffff:", ""));
    return false;
  }
  return true; // not a literal IP at all — treat as suspicious upstream of this check
}

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IntakeError(`Only http(s) URLs are supported, got "${url.protocol}"`);
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "0.0.0.0") {
    throw new IntakeError("That URL points at a local address, not a public page.");
  }
  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new IntakeError("That URL points at a private address, not a public page.");
    }
    return url;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new IntakeError(`Could not resolve "${hostname}". Check the URL and try again.`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new IntakeError("That URL resolves to a private address, not a public page.");
  }
  return url;
}

class IntakeError extends Error {}
class PipelineError extends Error {}

/* ------------------------------------------------------------------ *
 * Page capture
 * ------------------------------------------------------------------ */

const NAV_TIMEOUT_MS = 20_000;

async function launchBrowser(): Promise<Browser> {
  const packUrl = process.env["CHROMIUM_PACK_URL"];
  if (!packUrl) {
    throw new PipelineError(
      "CHROMIUM_PACK_URL is not set. Find the .tar asset matching the installed " +
        "@sparticuz/chromium-min version at https://github.com/Sparticuz/chromium/releases " +
        "and set its URL as this environment variable — see README.md.",
    );
  }
  const executablePath = await chromiumBinary.executablePath(packUrl);
  return playwrightChromium.launch({
    args: chromiumBinary.args,
    executablePath,
    headless: true,
  });
}

interface Capture {
  desktopPng: Buffer;
  mobilePng: Buffer;
}

async function capturePage(browser: Browser, pageUrl: string): Promise<Capture> {
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await Promise.all([
      desktopPage.goto(pageUrl, { waitUntil: "load", timeout: NAV_TIMEOUT_MS }),
      mobilePage.goto(pageUrl, { waitUntil: "load", timeout: NAV_TIMEOUT_MS }),
    ]);
    const [desktopPng, mobilePng] = await Promise.all([
      desktopPage.screenshot({ type: "png" }),
      mobilePage.screenshot({ type: "png" }),
    ]);
    return { desktopPng, mobilePng };
  } finally {
    await desktopPage.close();
    await mobilePage.close();
  }
}

/* ------------------------------------------------------------------ *
 * Claude call
 * ------------------------------------------------------------------ */

const ANTHROPIC_API_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-5";

const DRAFT_TOOL_SCHEMA = {
  name: "draft_audit",
  description: "Submit the draft audit for this landing page.",
  input_schema: z.toJSONSchema(draftAuditSchema, { io: "input", unrepresentable: "any" }),
};

async function callClaude(params: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  desktopPng: Buffer;
  mobilePng: Buffer;
}): Promise<DraftAudit> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": params.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: params.systemPrompt,
        tools: [DRAFT_TOOL_SCHEMA],
        tool_choice: { type: "tool", name: "draft_audit" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: params.userPrompt },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: params.desktopPng.toString("base64") },
              },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: params.mobilePng.toString("base64") },
              },
            ],
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new PipelineError(`Anthropic API returned ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    content: { type: string; name?: string; input?: unknown }[];
  };
  const toolUse = payload.content.find((block) => block.type === "tool_use" && block.name === "draft_audit");
  if (!toolUse) {
    throw new PipelineError("Model response did not include the draft_audit tool call.");
  }

  const parsed = draftAuditSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new PipelineError(`Model output did not match the draft schema: ${parsed.error.message}`);
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ *
 * Assembly: DraftAudit -> Audit
 * ------------------------------------------------------------------ */

function assembleAudit(intake: Intake, draft: DraftAudit, capture: { desktopDataUri: string; mobileDataUri: string }): Audit {
  const today = new Date().toISOString().slice(0, 10);
  // f.check is already a valid lowercase-hyphenated slug — enforced by
  // draftFindingSchema's `slug` regex, not by isKnownCheck (which only tells
  // validateAudit whether to warn about an uncatalogued check afterward).
  const findings = draft.findings.slice(0, 10).map((f) => ({
    id: deriveFindingId(f.check, f.locator),
    check: f.check,
    locator: f.locator,
    title: f.title,
    pillar: f.pillar,
    severity: f.severity,
    effort: f.effort,
    observation: f.observation,
    evidence: f.evidence.map((e) =>
      e.kind === "screenshot"
        ? {
            kind: "screenshot" as const,
            src: e.viewport === "desktop" ? capture.desktopDataUri : capture.mobileDataUri,
            caption: e.caption,
            viewport: e.viewport === "desktop" ? "desktop 1440x900" : "mobile 390x844",
          }
        : { kind: "note" as const, text: e.text },
    ),
    impact: f.impact,
    recommendations: f.recommendations,
    rubric_version: RUBRIC_VERSION,
  }));

  return {
    schema_version: "1.0",
    audit_id: `${today}-ai-draft-${intake.client_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
    client: { name: intake.client_name, contact: intake.contact_email },
    page: {
      url: intake.page_url,
      conversion_goal: intake.conversion_goal,
      audience: intake.audience,
    },
    audited_on: today,
    rubric_version: RUBRIC_VERSION,
    verdict: draft.verdict,
    findings,
    exclusions: [
      "AI-generated first pass. Not reviewed by a human auditor. Not sent, and not intended to be sent, to the client in this form.",
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Email
 * ------------------------------------------------------------------ */

async function sendEmail(params: {
  apiKey: string;
  to: string;
  from: string;
  subject: string;
  html: string;
  attachments: { filename: string; content: string }[];
}): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      attachments: params.attachments,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new PipelineError(`Resend API returned ${response.status}: ${body.slice(0, 500)}`);
  }
}

/* ------------------------------------------------------------------ *
 * HTTP handler
 * ------------------------------------------------------------------ */

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new IntakeError("Request body too large.");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) throw new IntakeError("Empty request body.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new IntakeError("Request body is not valid JSON.");
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    send(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  let intake: Intake;
  try {
    const parsed = intakeSchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      send(res, 422, { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid submission" });
      return;
    }
    intake = parsed.data;
  } catch (error) {
    send(res, 400, { ok: false, error: (error as Error).message });
    return;
  }

  // Honeypot: respond as if successful, do nothing further. Never reveal to
  // the caller that this field mattered.
  if (intake.company_website && intake.company_website.trim() !== "") {
    send(res, 200, { ok: true });
    return;
  }

  let pageUrl: URL;
  try {
    pageUrl = await assertPublicHttpUrl(intake.page_url);
  } catch (error) {
    if (error instanceof IntakeError) {
      send(res, 422, { ok: false, error: error.message });
      return;
    }
    throw error;
  }

  const anthropicKey = process.env["ANTHROPIC_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  const recipient = process.env["REPORT_RECIPIENT_EMAIL"] || "crispy-studios@hotmail.com";
  const fromAddress = process.env["REPORT_FROM_EMAIL"] || "Loupe Drafts <onboarding@resend.dev>";

  if (!anthropicKey || !resendKey) {
    console.error("submit: missing ANTHROPIC_API_KEY or RESEND_API_KEY");
    send(res, 500, {
      ok: false,
      error: "The service is not fully configured yet. Your submission was not processed — please try again shortly or contact us directly.",
    });
    return;
  }

  // Acknowledge receipt to the visitor before the heavy pipeline runs, but do
  // so by finishing the request only once everything is done — see the
  // module comment for why this endpoint does not hand off to a background
  // task. The visitor's browser waits; nothing about that is silent, the
  // intake form shows a "working on it" state while the request is in flight.
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    const capture = await capturePage(browser, pageUrl.toString());

    const draft = await callClaude({
      apiKey: anthropicKey,
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt({
        clientName: intake.client_name,
        pageUrl: intake.page_url,
        conversionGoal: intake.conversion_goal,
        audience: intake.audience,
        metricsNotes: intake.metrics_notes,
      }),
      desktopPng: capture.desktopPng,
      mobilePng: capture.mobilePng,
    });

    const desktopDataUri = `data:image/png;base64,${capture.desktopPng.toString("base64")}`;
    const mobileDataUri = `data:image/png;base64,${capture.mobilePng.toString("base64")}`;
    const audit = assembleAudit(intake, draft, { desktopDataUri, mobileDataUri });

    const validation = validateAudit(audit);
    const issues = validation.ok
      ? validation.warnings.map((w) => `WARNING ${w.path}: ${w.message}`)
      : [
          ...validation.errors.map((e) => `ERROR ${e.path}: ${e.message}`),
          ...validation.warnings.map((w) => `WARNING ${w.path}: ${w.message}`),
        ];

    const brand = await loadBrand();
    const ctx = { audit, brand, draft: true as const };
    const html = renderReportHtml(ctx);

    const page = await browser.newPage();
    let pdf: Buffer;
    try {
      await page.emulateMedia({ media: "print" });
      await page.setContent(html, { waitUntil: "load" });
      pdf = await page.pdf({
        format: brand.page.format,
        printBackground: true,
        margin: pdfMargin(brand, { draft: true }),
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: renderFooterTemplate(ctx),
      });
    } finally {
      await page.close();
    }

    const summaryHtml = `
      <p><strong>AI draft — unreviewed.</strong> Not sent to the client. Do not forward as-is.</p>
      <p><strong>Client:</strong> ${escapeHtml(intake.client_name)} (${escapeHtml(intake.contact_email)})<br>
         <strong>Page:</strong> ${escapeHtml(intake.page_url)}<br>
         <strong>Findings:</strong> ${audit.findings.length}</p>
      <p><strong>Verdict:</strong> ${escapeHtml(draft.verdict)}</p>
      ${issues.length > 0 ? `<p><strong>Validation notes:</strong></p><ul>${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""}
    `.trim();

    await sendEmail({
      apiKey: resendKey,
      to: recipient,
      from: fromAddress,
      subject: `AI draft — ${intake.client_name} — ${pageUrl.hostname}`,
      html: summaryHtml,
      attachments: [
        { filename: "draft.pdf", content: pdf.toString("base64") },
        { filename: "findings.json", content: Buffer.from(JSON.stringify(audit, null, 2)).toString("base64") },
      ],
    });

    send(res, 200, { ok: true });
  } catch (error) {
    console.error("submit pipeline failed:", error);
    // Best-effort failure notice so a broken run is never silent — the intake
    // itself (URL, contact) is cheap to recover even if the AI/PDF/email leg
    // fails partway.
    if (resendKey) {
      await sendEmail({
        apiKey: resendKey,
        to: recipient,
        from: fromAddress,
        subject: `AI draft FAILED — ${intake.client_name} — ${intake.page_url}`,
        html: `<p>The draft pipeline failed for this submission.</p>
               <p><strong>Client:</strong> ${escapeHtml(intake.client_name)} (${escapeHtml(intake.contact_email)})<br>
                  <strong>Page:</strong> ${escapeHtml(intake.page_url)}<br>
                  <strong>Goal:</strong> ${escapeHtml(intake.conversion_goal)}<br>
                  <strong>Audience:</strong> ${escapeHtml(intake.audience)}</p>
               <p><strong>Error:</strong> ${escapeHtml((error as Error).message)}</p>`,
        attachments: [],
      }).catch((emailError) => console.error("failure-notice email also failed:", emailError));
    }
    send(res, 200, {
      ok: true,
      note: "Received. If anything looks off you'll hear from us directly.",
    });
  } finally {
    await browser?.close().catch(() => {});
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
