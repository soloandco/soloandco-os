import assert from "node:assert/strict";
import test from "node:test";

import { renderQuoteHtml } from "../src/templates/quote-html.mjs";

const base = {
  issuer: { display_name: "샘플컴퍼니", person: "홍길동", email: "hello@example.test", business_number: "" },
  counterparty: { name: "샘플상사" },
  items: [{ label: "알파 모듈", amount: 1000000, note: "" }],
  total: 1000000,
  issued_on: "2026-01-02",
  valid_until: "2026-02-01",
  brand: { accent: "", ink: "", font_family: "" },
};

test("prints the counterparty and the formatted total", () => {
  const html = renderQuoteHtml(base);
  assert.ok(html.includes("샘플상사"));
  assert.ok(html.includes("1,000,000"));
});

test("omits the tax line when there is no business number", () => {
  const html = renderQuoteHtml(base);
  assert.ok(!html.includes("부가세"));
  assert.ok(!html.includes("사업자등록번호"));
});

test("prints the tax line when a business number exists", () => {
  const html = renderQuoteHtml({ ...base, issuer: { ...base.issuer, business_number: "000-00-00000" } });
  assert.ok(html.includes("사업자등록번호"));
  assert.ok(html.includes("부가세"));
});

test("escapes html in every text field", () => {
  const html = renderQuoteHtml({ ...base, counterparty: { name: "<script>alert(1)</script>" } });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("keeps a4 safe margins", () => {
  const html = renderQuoteHtml(base);
  assert.ok(/margin:\s*24mm\s+22mm/.test(html));
  assert.ok(html.includes("size: A4"));
});

test("falls back to neutral colors when brand values are empty", () => {
  const html = renderQuoteHtml(base);
  assert.ok(html.includes("--accent:#111111"));
});

test("uses the configured accent when present", () => {
  const html = renderQuoteHtml({ ...base, brand: { accent: "#123456", ink: "#222222", font_family: "serif" } });
  assert.ok(html.includes("--accent:#123456"));
  assert.ok(html.includes("serif"));
});

test("rejects a brand accent that is not a hex color", () => {
  assert.throws(
    () => renderQuoteHtml({ ...base, brand: { accent: "red; } body{display:none", ink: "", font_family: "" } }),
    /accent/
  );
});
