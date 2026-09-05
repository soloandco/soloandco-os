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

test("rejects an unknown counterparty name", () => {
  // 이 테스트는 경로 안전성을 증명하지 않는다. readCounterparty는 정확한 이름
  // 일치로만 행을 찾으므로, 어떤 미등록 이름을 넣어도 같은 이유로 거절된다.
  // 경로 탈출 자체의 안전성은 아래 "탈출을 시도하는 today 값" 테스트가 맡는다.
  const config = makeConfig();
  assert.throws(
    () => createQuote(config, { counterparty: "../탈출", items, valid_days: 30, today: "2026-01-02" }),
    /찾지 못했다/
  );
});

test("rejects a today value that tries to escape the workspace, and writes nothing outside it", () => {
  const config = makeConfig();
  const maliciousToday = "../../../../../../outside";

  assert.throws(
    () => createQuote(config, { counterparty: "샘플상사", items, valid_days: 30, today: maliciousToday }),
    /today/
  );

  // 검증이 없었다면 실제로 만들어졌을 탈출 파일명이 워크스페이스 안에도 없어야 하고,
  // 워크스페이스 바깥(부모 디렉터리)에도 새 항목이 생기지 않아야 한다.
  const escapedFilename = `quote-샘플상사-${maliciousToday}.html`;
  const naiveTargetInsideCounterpartyDir = path.join(config.workspace_root, "leads", "샘플상사", escapedFilename);
  assert.ok(!fs.existsSync(naiveTargetInsideCounterpartyDir));

  const parentOfWorkspace = path.dirname(config.workspace_root);
  assert.ok(!fs.existsSync(path.join(parentOfWorkspace, "outside")));
});

test("defaults issued_on to the local calendar day, not the UTC day", () => {
  // OS 타임존과 무관하게 결정적으로 만들기 위해 Date를 오버라이드한다: 기본 생성자
  // (인자 없음, 즉 "지금")는 실제 UTC로는 2025-12-31인 시각을 가리키게 하되,
  // getFullYear/getMonth/getDate(로컬 달력 값)는 2026-01-02를 돌려주게 한다.
  // 구현이 isoDate(new Date())처럼 toISOString()(UTC)을 썼다면 "2025-12-31"이,
  // localIsoDate처럼 로컬 getter를 썼다면 "2026-01-02"가 나온다.
  const config = makeConfig();
  const RealDate = globalThis.Date;

  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [RealDate.UTC(2025, 11, 31, 20, 0, 0)]));
    }
    getFullYear() {
      return 2026;
    }
    getMonth() {
      return 0;
    }
    getDate() {
      return 2;
    }
  }

  globalThis.Date = FixedDate;
  try {
    const result = createQuote(config, { counterparty: "샘플상사", items, valid_days: 30 });
    const html = fs.readFileSync(result.path, "utf8");
    assert.ok(html.includes("2026-01-02"));
    assert.ok(!html.includes("2025-12-31"));
  } finally {
    globalThis.Date = RealDate;
  }
});
