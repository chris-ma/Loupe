import { chromium, type Browser } from "playwright";
import type { Brand } from "../schema/brand.ts";
import { renderFooterTemplate, renderReportHtml, type RenderContext } from "./template.ts";

/**
 * PDF output — BR §7.3 ("Output: PDF via headless browser render").
 *
 * The renderer holds one browser across calls. Launching Chromium costs
 * ~300-600ms; at ten audits that is irrelevant, but the PDF route is meant to
 * survive into Phase 2 where it renders on demand, and a per-request launch is
 * the first thing that would have to be undone.
 */

export interface PdfOptions {
  /** Chromium binary to use. Defaults to Playwright's own download, then $LOUPE_CHROMIUM_PATH. */
  executablePath?: string;
}

function pdfMargin(brand: Brand) {
  const m = brand.page.marginMm;
  return {
    top: `${m.top}mm`,
    right: `${m.right}mm`,
    // Chromium draws the footer band inside the bottom margin, so leave it room.
    bottom: `${m.bottom}mm`,
    left: `${m.left}mm`,
  };
}

export class ReportRenderer {
  #browser: Browser | undefined;
  readonly #options: PdfOptions;

  constructor(options: PdfOptions = {}) {
    this.#options = options;
  }

  async #getBrowser(): Promise<Browser> {
    if (this.#browser?.isConnected()) return this.#browser;
    const executablePath = this.#options.executablePath ?? process.env["LOUPE_CHROMIUM_PATH"];
    this.#browser = await chromium.launch(executablePath ? { executablePath } : {});
    return this.#browser;
  }

  /** Render a findings file to PDF bytes. Assets must already be inlined. */
  async renderPdf(ctx: RenderContext): Promise<Buffer> {
    const html = renderReportHtml(ctx);
    const browser = await this.#getBrowser();
    const page = await browser.newPage();
    try {
      await page.emulateMedia({ media: "print" });
      await page.setContent(html, { waitUntil: "load" });
      return await page.pdf({
        format: ctx.brand.page.format,
        printBackground: true,
        preferCSSPageSize: false,
        margin: pdfMargin(ctx.brand),
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: renderFooterTemplate(ctx),
      });
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    await this.#browser?.close();
    this.#browser = undefined;
  }
}

/** One-shot convenience for CLI use. */
export async function renderPdfOnce(ctx: RenderContext, options: PdfOptions = {}): Promise<Buffer> {
  const renderer = new ReportRenderer(options);
  try {
    return await renderer.renderPdf(ctx);
  } finally {
    await renderer.close();
  }
}
