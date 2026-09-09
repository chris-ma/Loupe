import assert from "node:assert/strict";
import { test } from "node:test";
import { clientSlug, deriveFindingId, isDerivedId, pageKey } from "../src/schema/ids.ts";

test("the same check and locator always derive the same ID", () => {
  const a = deriveFindingId("headline-outcome", "hero h1");
  const b = deriveFindingId("headline-outcome", "hero h1");
  assert.equal(a, b);
  assert.match(a, /^headline-outcome--[0-9a-f]{8}$/);
});

test("locator formatting does not change the ID, but the locator itself does", () => {
  assert.equal(
    deriveFindingId("form-friction", "  #booking-form  "),
    deriveFindingId("form-friction", "#booking-form"),
  );
  assert.notEqual(
    deriveFindingId("form-friction", "#booking-form"),
    deriveFindingId("form-friction", "#contact-form"),
  );
});

test("the same locator under different checks gives different IDs", () => {
  assert.notEqual(deriveFindingId("traffic-quality"), deriveFindingId("comprehension-gap"));
});

test("an omitted locator resolves to the page-wide scope", () => {
  assert.equal(deriveFindingId("traffic-quality"), deriveFindingId("traffic-quality", "  "));
  assert.equal(deriveFindingId("traffic-quality"), deriveFindingId("traffic-quality", "page"));
});

test("an invalid check key is rejected rather than silently hashed", () => {
  assert.throws(() => deriveFindingId("Headline Outcome"), /Invalid rubric check key/);
  assert.equal(isDerivedId("anything", "Headline Outcome"), false);
});

test("page keys survive the URL variations a client will send between audits", () => {
  const canonical = pageKey("https://example.com/pricing");
  assert.equal(pageKey("https://www.example.com/pricing/"), canonical);
  assert.equal(pageKey("http://example.com/pricing"), canonical);
  assert.equal(pageKey("https://example.com/pricing#hero"), canonical);
  assert.equal(pageKey("https://EXAMPLE.com/pricing"), canonical);
  assert.notEqual(pageKey("https://example.com/checkout"), canonical);
});

test("query parameters are part of the page identity, but their order is not", () => {
  assert.equal(
    pageKey("https://example.com/lp?b=2&a=1"),
    pageKey("https://example.com/lp?a=1&b=2"),
  );
  assert.notEqual(pageKey("https://example.com/lp?a=1"), pageKey("https://example.com/lp"));
});

test("client slugs are filesystem-safe and stable", () => {
  assert.equal(clientSlug("Meridian Physio (specimen)"), "meridian-physio-specimen");
  assert.equal(clientSlug("Café Del Mar Pty Ltd"), "cafe-del-mar-pty-ltd");
  assert.match(clientSlug("...."), /^[0-9a-f]{12}$/);
});
