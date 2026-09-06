import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { TOOL_LIST, dispatch } from "../src/tools.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doc-mcp-t-"));
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

test("exposes exactly three tools", () => {
  assert.deepEqual(TOOL_LIST.map((tool) => tool.name).sort(), ["create_quote", "get_counterparty", "get_pricing"]);
});

test("every tool declares an object input schema", () => {
  for (const tool of TOOL_LIST) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.description.length > 0);
  }
});

test("get_pricing returns values with their source", async () => {
  const result = await dispatch(makeConfig(), "get_pricing", {});
  assert.match(result.content[0].text, /알파 모듈 시작가/);
  assert.match(result.content[0].text, /offers\/pricing\.md/);
});

test("get_counterparty returns the stage", async () => {
  const result = await dispatch(makeConfig(), "get_counterparty", { slug: "샘플상사" });
  assert.match(result.content[0].text, /proposal/);
});

test("create_quote reports the saved path", async () => {
  const result = await dispatch(makeConfig(), "create_quote", {
    counterparty: "샘플상사",
    items: [{ label: "알파 모듈", amount: 1000000 }],
    valid_days: 30,
  });
  assert.match(result.content[0].text, /quote-샘플상사-/);
});

test("an unknown tool name returns an error result", async () => {
  const result = await dispatch(makeConfig(), "nope", {});
  assert.equal(result.isError, true);
});

test("a failure returns an error result instead of throwing", async () => {
  const result = await dispatch(makeConfig(), "get_counterparty", { slug: "없는곳" });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /찾지 못했다/);
});

test("get_counterparty with no slug rejects with a named-argument error", async () => {
  const result = await dispatch(makeConfig(), "get_counterparty", {});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /slug/);
});

test("create_quote with no counterparty rejects with a named-argument error", async () => {
  const result = await dispatch(makeConfig(), "create_quote", {
    items: [{ label: "알파 모듈", amount: 1000000 }],
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /counterparty/);
});

test("create_quote with no items rejects with a named-argument error", async () => {
  const result = await dispatch(makeConfig(), "create_quote", {
    counterparty: "샘플상사",
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /items/);
});

test("create_quote rejects a negative valid_days as an error result, not a throw", async () => {
  const result = await dispatch(makeConfig(), "create_quote", {
    counterparty: "샘플상사",
    items: [{ label: "알파 모듈", amount: 1000000 }],
    valid_days: -1,
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /valid_days/);
});

test("create_quote rejects a valid_days beyond the ceiling", async () => {
  const result = await dispatch(makeConfig(), "create_quote", {
    counterparty: "샘플상사",
    items: [{ label: "알파 모듈", amount: 1000000 }],
    valid_days: 3651,
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /valid_days/);
});

test("create_quote rejects a fractional valid_days", async () => {
  const result = await dispatch(makeConfig(), "create_quote", {
    counterparty: "샘플상사",
    items: [{ label: "알파 모듈", amount: 1000000 }],
    valid_days: 1.5,
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /valid_days/);
});

test("create_quote accepts valid_days at 0 and at the ceiling", async () => {
  const zero = await dispatch(makeConfig(), "create_quote", {
    counterparty: "샘플상사",
    items: [{ label: "알파 모듈", amount: 1000000 }],
    valid_days: 0,
  });
  assert.equal(zero.isError, undefined);
  const ceiling = await dispatch(makeConfig(), "create_quote", {
    counterparty: "샘플상사",
    items: [{ label: "알파 모듈", amount: 1000000 }],
    valid_days: 3650,
  });
  assert.equal(ceiling.isError, undefined);
});
