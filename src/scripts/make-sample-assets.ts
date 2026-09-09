import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PACKAGE_ROOT } from "../load.ts";

/**
 * Render the mock landing page that the sample audit is written against.
 *
 * The specimen report needs real exhibits, and a specimen must not screenshot a
 * real business's page. So the page being audited is synthesised here and the
 * screenshots are taken from it. Run with `npm run sample:assets`.
 */

const MOCK_PAGE = `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font:16px/1.5 "Helvetica Neue",Helvetica,Arial,sans-serif;color:#1b1d21;background:#fff}
  header{display:flex;justify-content:space-between;align-items:center;padding:18px 32px;border-bottom:1px solid #e6e4df}
  .brand{font:600 19px/1 Georgia,serif;letter-spacing:.04em}
  nav a{margin-left:22px;color:#5f636b;text-decoration:none;font-size:14px}
  .hero{display:grid;grid-template-columns:1.05fr .95fr;gap:44px;padding:64px 32px 56px;align-items:start}
  .hero h1{font:600 42px/1.12 Georgia,serif;letter-spacing:-.01em;margin-bottom:16px}
  .hero p.sub{color:#5f636b;font-size:17px;max-width:34ch;margin-bottom:26px}
  .badges{display:flex;gap:10px;flex-wrap:wrap}
  .badge{font-size:12px;color:#5f636b;border:1px solid #e6e4df;border-radius:3px;padding:5px 9px}
  form{background:#f6f5f2;border:1px solid #e6e4df;border-radius:4px;padding:22px}
  form h2{font:600 17px/1.3 Georgia,serif;margin-bottom:4px}
  form p.hint{font-size:12.5px;color:#5f636b;margin-bottom:16px}
  label{display:block;font-size:12px;color:#5f636b;margin:11px 0 4px}
  input,.select,.textarea{width:100%;padding:9px 10px;border:1px solid #d9d7d1;border-radius:3px;font-size:14px;background:#fff;color:#1b1d21;min-height:37px}
  .select{position:relative;padding-right:28px}
  .select::after{content:"";position:absolute;right:11px;top:15px;width:7px;height:7px;border-right:1.6px solid #8b8f97;border-bottom:1.6px solid #8b8f97;transform:rotate(45deg)}
  .textarea{min-height:74px}
  button{width:100%;margin-top:18px;padding:12px;background:#1f4b7a;color:#fff;border:0;border-radius:3px;font-size:15px;font-weight:600}
  .fineprint{font-size:11px;color:#8b8f97;margin-top:10px;text-align:center}
  section.band{padding:44px 32px;border-top:1px solid #e6e4df}
  section.band h2{font:600 24px/1.2 Georgia,serif;margin-bottom:20px}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
  .card{border:1px solid #e6e4df;border-radius:4px;padding:18px}
  .card h3{font-size:15px;margin-bottom:7px}
  .card p{font-size:13.5px;color:#5f636b}
  @media (max-width:520px){
    header{padding:14px 16px}
    nav{display:none}
    .hero{grid-template-columns:1fr;gap:26px;padding:28px 16px 34px}
    .hero h1{font-size:29px}
    .cards{grid-template-columns:1fr}
    section.band{padding:28px 16px}
  }
</style></head><body>
<header>
  <span class="brand">Meridian Physio</span>
  <nav><a href="#">Services</a><a href="#">Our team</a><a href="#">Fees</a><a href="#">Contact</a></nav>
</header>
<div class="hero">
  <div>
    <h1>Evidence-based physiotherapy, delivered with care</h1>
    <p class="sub">A modern practice combining hands-on treatment with exercise prescription and a patient-first philosophy.</p>
    <div class="badges">
      <span class="badge">Est. 2014</span><span class="badge">APA members</span>
      <span class="badge">HICAPS on site</span><span class="badge">Parking available</span>
    </div>
  </div>
  <form id="booking-form">
    <h2>Get in touch</h2>
    <p class="hint">Complete the form and a member of our team will be in contact.</p>
    <label>Full name</label><input>
    <label>Email</label><input>
    <label>Phone</label><input>
    <label>Preferred practitioner</label><div class="select">No preference</div>
    <label>Health fund</label><input>
    <label>Referral source</label><div class="select" style="color:#8b8f97">Please select</div>
    <label>How can we help?</label><div class="textarea"></div>
    <button>Submit</button>
    <p class="fineprint">We respond to all enquiries.</p>
  </form>
</div>
<section class="band">
  <h2>Our approach</h2>
  <div class="cards">
    <div class="card"><h3>Assessment</h3><p>A thorough initial consultation to understand your presentation and history.</p></div>
    <div class="card"><h3>Treatment</h3><p>Hands-on therapy tailored to your diagnosis and delivered by qualified clinicians.</p></div>
    <div class="card"><h3>Rehabilitation</h3><p>Progressive exercise programmes to restore function and reduce recurrence.</p></div>
  </div>
</section>
</body></html>`;

const shots = [
  { file: "hero-desktop.png", width: 1280, height: 820, deviceScaleFactor: 2 },
  { file: "hero-mobile.png", width: 390, height: 844, deviceScaleFactor: 3 },
];

const outDir = resolve(PACKAGE_ROOT, "examples/assets");
await mkdir(outDir, { recursive: true });

const executablePath = process.env["LOUPE_CHROMIUM_PATH"];
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const shot of shots) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: shot.deviceScaleFactor,
    });
    await page.setContent(MOCK_PAGE, { waitUntil: "load" });
    await page.screenshot({ path: resolve(outDir, shot.file) });
    await page.close();
    process.stdout.write(`Wrote examples/assets/${shot.file}\n`);
  }
} finally {
  await browser.close();
}
