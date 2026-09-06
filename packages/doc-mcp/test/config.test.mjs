import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadConfig, resolveInWorkspace } from "../src/config.mjs";

function writeConfig(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-mcp-"));
  const root = path.join(dir, "workspace");
  fs.mkdirSync(root);
  const config = {
    workspace_root: root,
    pricing: { path: "metrics.md", fields: { metric: "수치", key: "키", value: "값", source: "정본", verified_at: "확인일" } },
    contacts: { path: "contacts.md", fields: { label: "항목", value: "값" }, lookup: { person: "담당", email: "이메일" } },
    counterparties: { path: "pipeline.md", fields: { id: "lead_id", name: "대상", stage: "단계" }, dir: "leads" },
    issuer: { display_name: "샘플컴퍼니", business_number: "" },
    brand: { accent: "", ink: "", font_family: "" },
    output: { filename: "quote-{name}-{date}.html" },
    ...overrides,
  };
  const configPath = path.join(dir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config), "utf8");
  return { configPath, root };
}

test("loads a valid config", () => {
  const { configPath, root } = writeConfig();
  const config = loadConfig(configPath);
  assert.equal(config.workspace_root, root);
  assert.equal(config.issuer.display_name, "샘플컴퍼니");
});

test("rejects a config without workspace_root", () => {
  const { configPath } = writeConfig({ workspace_root: "" });
  assert.throws(() => loadConfig(configPath), /workspace_root/);
});

test("rejects a workspace_root that does not exist", () => {
  const { configPath, root } = writeConfig();
  fs.rmSync(root, { recursive: true });
  assert.throws(() => loadConfig(configPath), /workspace_root/);
});

test("resolves a path inside the workspace", () => {
  const { configPath, root } = writeConfig();
  const config = loadConfig(configPath);
  assert.equal(resolveInWorkspace(config, "a/b.md"), path.join(root, "a", "b.md"));
});

test("rejects a path that escapes the workspace", () => {
  const { configPath } = writeConfig();
  const config = loadConfig(configPath);
  assert.throws(() => resolveInWorkspace(config, "../outside.md"), /워크스페이스 밖/);
});

test("rejects an absolute path outside the workspace", () => {
  const { configPath } = writeConfig();
  const config = loadConfig(configPath);
  assert.throws(() => resolveInWorkspace(config, path.join(os.tmpdir(), "x.md")), /워크스페이스 밖/);
});

test("error messages carry no workspace paths", () => {
  // resolveInWorkspace 는 config.json 의 사실 값(가격·이메일 등)에 애초에 접근할
  // 수 없으니 그런 값이 메시지에 없다는 확인은 이 함수를 결코 실패시킬 수 없다.
  // 이 함수가 실제로 다룰 수 있는 값은 워크스페이스 루트와 그로부터 계산한
  // 대상 경로뿐이므로, 새는지 확인할 대상은 그 둘이다.
  const { configPath, root } = writeConfig();
  const config = loadConfig(configPath);
  const relative = "../outside.md";
  const wouldBeTarget = path.resolve(root, relative);
  try {
    resolveInWorkspace(config, relative);
    assert.fail("throw 되어야 한다");
  } catch (err) {
    assert.ok(!err.message.includes(root));
    assert.ok(!err.message.includes(wouldBeTarget));
  }
});
