import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseTables, readCounterparty, readIssuer, readPricing } from "../src/workspace.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doc-mcp-ws-"));
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

test("parses every markdown table", () => {
  const tables = parseTables("| a | b |\n|---|---|\n| 1 | 2 |\n\ntext\n\n| c |\n|---|\n| 3 |\n");
  assert.equal(tables.length, 2);
  assert.deepEqual(tables[0].headers, ["a", "b"]);
  assert.deepEqual(tables[0].rows[0], { a: "1", b: "2" });
});

test("picks the table that has all configured field headers", () => {
  const rows = readPricing(makeConfig());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].metric, "알파 모듈 시작가");
  assert.equal(rows[0].value, "1,000,000원");
});

test("keeps the source path and the verified date", () => {
  const rows = readPricing(makeConfig());
  assert.equal(rows[0].source, "offers/pricing.md");
  assert.equal(rows[0].verified_at, "2026-01-02");
});

test("reads issuer contact fields", () => {
  const issuer = readIssuer(makeConfig());
  assert.equal(issuer.person, "홍길동");
  assert.equal(issuer.email, "hello@example.test");
  assert.equal(issuer.display_name, "샘플컴퍼니");
});

test("throws when a required contact field is missing", () => {
  const config = makeConfig();
  fs.writeFileSync(path.join(config.workspace_root, "contacts.md"), "| 항목 | 값 |\n|---|---|\n| 담당 | 홍길동 |\n", "utf8");
  assert.throws(() => readIssuer(config), /이메일/);
});

test("finds a counterparty by name", () => {
  const found = readCounterparty(makeConfig(), "샘플상사");
  assert.equal(found.id, "L-001");
  assert.equal(found.stage, "proposal");
  assert.ok(found.dir.endsWith(path.join("leads", "샘플상사")));
});

test("throws for an unknown counterparty", () => {
  assert.throws(() => readCounterparty(makeConfig(), "없는곳"), /찾지 못했다/);
});

// slug 필드(선택) 관련 테스트. 표시 이름과 실제 폴더명이 다른 워크스페이스를 흉내낸다.

function makeSlugConfig(pipelineMarkdown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doc-mcp-ws-slug-"));
  fs.writeFileSync(path.join(root, "pipeline.md"), pipelineMarkdown, "utf8");
  return {
    workspace_root: root,
    counterparties: {
      path: "pipeline.md",
      fields: { id: "lead_id", name: "대상", stage: "단계", slug: "폴더" },
      dir: "leads",
    },
  };
}

test("uses the slug column value as the directory name when present", () => {
  const config = makeSlugConfig(
    "| lead_id | 대상 | 단계 | 폴더 |\n|---|---|---|---|\n| L-010 | 예시디자인 (Example Design) | proposal | example-design |\n"
  );
  const found = readCounterparty(config, "예시디자인 (Example Design)");
  assert.ok(found.dir.endsWith(path.join("leads", "example-design")));
});

test("falls back to the display name when the table has no slug column", () => {
  const config = makeSlugConfig(
    "| lead_id | 대상 | 단계 |\n|---|---|---|\n| L-010 | 예시디자인 (Example Design) | proposal |\n"
  );
  const found = readCounterparty(config, "예시디자인 (Example Design)");
  assert.ok(found.dir.endsWith(path.join("leads", "예시디자인 (Example Design)")));
});

test("falls back to the display name when the slug cell is empty", () => {
  const config = makeSlugConfig(
    "| lead_id | 대상 | 단계 | 폴더 |\n|---|---|---|---|\n| L-010 | 예시디자인 (Example Design) |  proposal | |\n"
  );
  const found = readCounterparty(config, "예시디자인 (Example Design)");
  assert.ok(found.dir.endsWith(path.join("leads", "예시디자인 (Example Design)")));
});

test("rejects a slug value that would escape the workspace", () => {
  const config = makeSlugConfig(
    "| lead_id | 대상 | 단계 | 폴더 |\n|---|---|---|---|\n| L-010 | 탈출상사 | proposal | ../../outside |\n"
  );
  assert.throws(() => readCounterparty(config, "탈출상사"), /워크스페이스 밖/);
});

test("throws when the configured table is absent", () => {
  const config = makeConfig();
  fs.writeFileSync(path.join(config.workspace_root, "metrics.md"), "# 없음\n", "utf8");
  assert.throws(() => readPricing(config), /표를 찾지 못했다/);
});

test("splits two tables with no blank line between them", () => {
  const tables = parseTables(
    "| a | b |\n|---|---|\n| 1 | 2 |\n| c | d |\n|---|---|\n| 3 | 4 |\n"
  );
  assert.equal(tables.length, 2);
  assert.deepEqual(tables[0].headers, ["a", "b"]);
  assert.deepEqual(tables[0].rows, [{ a: "1", b: "2" }]);
  assert.deepEqual(tables[1].headers, ["c", "d"]);
  assert.deepEqual(tables[1].rows, [{ c: "3", d: "4" }]);
});

test("does not split a table on a dash-only data row", () => {
  const tables = parseTables(
    "| 항목 | 값 |\n|---|---|\n| 담당 | 홍길동 |\n| - | - |\n| 이메일 | test@example.test |\n"
  );
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].headers, ["항목", "값"]);
  assert.deepEqual(tables[0].rows, [
    { 항목: "담당", 값: "홍길동" },
    { 항목: "-", 값: "-" },
    { 항목: "이메일", 값: "test@example.test" },
  ]);
});

test("a short divider (|-|-|) is not recognized as a table", () => {
  const tables = parseTables("| a | b |\n|-|-|\n| 1 | 2 |\n");
  assert.equal(tables.length, 0);
});
