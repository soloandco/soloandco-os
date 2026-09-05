import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createQuote } from "../src/quote.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doc-mcp-q-"));
  for (const name of ["metrics.md", "contacts.md", "pipeline.md"]) {
    fs.copyFileSync(path.join(FIXTURES, name), path.join(root, name));
  }
  fs.mkdirSync(path.join(root, "leads", "샘플상사"), { recursive: true });
  return {
    workspace_root: root,
    pricing: { path: "metrics.md", fields: { metric: "수치", key: "키", value: "값", source: "정본", verified_at: "확인일" } },
    contacts: { path: "contacts.md", fields: { label: "항목", value: "값" }, lookup: { person: "담당", email: "이메일" } },
    counterparties: { path: "pipeline.md", fields: { id: "lead_id", name: "대상", stage: "단계" }, dir: "leads" },
    issuer: { display_name: "샘플컴퍼니", business_number: "" },
    brand: {},
    output: { filename: "quote-{name}-{date}.html" },
  };
}

const items = [{ label: "알파 모듈", amount: 1000000 }, { label: "베타 모듈", amount: 2000000 }];

test("writes the file into the counterparty folder", () => {
  const config = makeConfig();
  const result = createQuote(config, { counterparty: "샘플상사", items, valid_days: 30, today: "2026-01-02" });
  assert.equal(result.path, path.join(config.workspace_root, "leads", "샘플상사", "quote-샘플상사-2026-01-02.html"));
  assert.ok(fs.existsSync(result.path));
});

test("sums the item amounts", () => {
  const config = makeConfig();
  const result = createQuote(config, { counterparty: "샘플상사", items, valid_days: 30, today: "2026-01-02" });
  assert.equal(result.total, 3000000);
  assert.ok(fs.readFileSync(result.path, "utf8").includes("3,000,000"));
});

test("computes the valid until date", () => {
  const config = makeConfig();
  const result = createQuote(config, { counterparty: "샘플상사", items, valid_days: 30, today: "2026-01-02" });
  assert.ok(fs.readFileSync(result.path, "utf8").includes("2026-02-01"));
});

test("creates the folder when it is missing", () => {
  const config = makeConfig();
  fs.rmSync(path.join(config.workspace_root, "leads", "샘플상사"), { recursive: true });
  const result = createQuote(config, { counterparty: "샘플상사", items, valid_days: 30, today: "2026-01-02" });
  assert.ok(fs.existsSync(result.path));
});

test("rejects an empty item list", () => {
  const config = makeConfig();
  assert.throws(() => createQuote(config, { counterparty: "샘플상사", items: [], valid_days: 30, today: "2026-01-02" }), /항목/);
});

test("rejects an amount that is not a positive number", () => {
  const config = makeConfig();
  assert.throws(
    () => createQuote(config, { counterparty: "샘플상사", items: [{ label: "x", amount: -1 }], valid_days: 30, today: "2026-01-02" }),
    /금액/
  );
});

test("rejects a counterparty name that contains a path separator", () => {
  const config = makeConfig();
  assert.throws(
    () => createQuote(config, { counterparty: "../탈출", items, valid_days: 30, today: "2026-01-02" }),
    /찾지 못했다|워크스페이스 밖/
  );
});
