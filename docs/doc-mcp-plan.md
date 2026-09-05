# 사업 문서 MCP 구현 계획

> **작업자용:** 필수 서브스킬 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`로 태스크 단위 실행. 각 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** 워크스페이스의 값을 읽어 A4 HTML 견적서를 만들어 저장하는 로컬 MCP 서버를 이 저장소의 별도 패키지로 추가한다.

**구조:** `packages/doc-mcp`는 npm 워크스페이스 패키지다. 루트 `create-soloandco-os`의 `files`와 의존성은 건드리지 않는다. 서버는 stdio로 붙고, 워크스페이스 경로·표 헤더·발행 명의·브랜드 값은 전부 `config.json`이 공급한다. 코드와 서식에는 특정 워크스페이스의 값이 들어가지 않는다.

**기술:** ESM JavaScript(`.mjs`), `node:test` + `node:assert/strict`, `@modelcontextprotocol/sdk`. TypeScript·YAML 파서·PDF 변환기를 도입하지 않는다.

**설계 문서:** [doc-mcp-design.md](doc-mcp-design.md)

## 전역 제약

- 저장소 규칙: 실제 멤버·고객·계약·정산·금융·인증 데이터를 넣지 않는다. 테스트 픽스처는 전부 가상이다
- 코드·서식·테스트에 실제 금액·이메일·색 HEX·상호를 넣지 않는다. 전부 `config.json`에서 읽는다
- 기계용 경로는 영문 kebab-case. 사용자용 마크다운은 한국어 가능
- 네트워크 호출을 하지 않는다. `fetch`·`http`·`https` 모듈을 import 하지 않는다
- `config.json`의 `workspace_root` 밖 경로는 읽기·쓰기 모두 거부한다
- 읽은 값을 `console.log`·에러 메시지에 싣지 않는다. 진단은 키 이름과 경로까지만
- 사실 값(가격·명의·연락처)이 비면 멈추고 알린다. 스타일 값(색·서체)이 비면 무채색으로 진행한다
- 한국어 산문에 줄표와 en dash를 쓰지 않는다. 숫자 범위는 물결표
- 커밋 메시지는 conventional commits. 각 태스크 끝에 커밋한다

## 파일 구조

| 파일 | 책임 |
|---|---|
| `packages/doc-mcp/package.json` | 패키지 정의, 의존성 1개, bin 등록 |
| `packages/doc-mcp/config.example.json` | 설정 견본. 값은 비어 있다 |
| `packages/doc-mcp/src/config.mjs` | 설정 로드·검증, 경로 가드 |
| `packages/doc-mcp/src/workspace.mjs` | 마크다운 표 파싱, 가격·연락처·상대 읽기 |
| `packages/doc-mcp/src/quote.mjs` | 견적 모델 조립, 파일 저장 |
| `packages/doc-mcp/src/templates/quote-html.mjs` | A4 HTML 렌더, 이스케이프 |
| `packages/doc-mcp/src/tools.mjs` | 도구 목록과 dispatch |
| `packages/doc-mcp/src/server.mjs` | stdio 서버 진입점 |
| `packages/doc-mcp/test/*.test.mjs` | 태스크별 테스트 |
| `packages/doc-mcp/test/fixtures/` | 가상 워크스페이스 |

---

### Task 1: 패키지 뼈대와 설정 로더

**Files:**
- Create: `packages/doc-mcp/package.json`
- Create: `packages/doc-mcp/config.example.json`
- Create: `packages/doc-mcp/src/config.mjs`
- Create: `packages/doc-mcp/test/config.test.mjs`
- Modify: `package.json` (루트, `workspaces` 추가)
- Modify: `.gitignore` (루트)

**Interfaces:**
- Produces: `loadConfig(configPath) -> config`, `resolveInWorkspace(config, relativePath) -> absolutePath` (루트 밖이면 throw)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/doc-mcp/test/config.test.mjs`:

```js
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

test("error messages carry no config values", () => {
  const { configPath } = writeConfig();
  const config = loadConfig(configPath);
  try {
    resolveInWorkspace(config, "../outside.md");
    assert.fail("throw 되어야 한다");
  } catch (err) {
    assert.ok(!err.message.includes("샘플컴퍼니"));
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test packages/doc-mcp/test/config.test.mjs`
Expected: FAIL. `Cannot find module '../src/config.mjs'`

- [ ] **Step 3: 최소 구현을 쓴다**

`packages/doc-mcp/src/config.mjs`:

```js
import fs from "node:fs";
import path from "node:path";

const REQUIRED_SECTIONS = ["pricing", "contacts", "counterparties", "issuer", "output"];

export function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);

  if (!config.workspace_root) {
    throw new Error("config: workspace_root 가 비어 있다");
  }
  if (!fs.existsSync(config.workspace_root)) {
    throw new Error("config: workspace_root 경로가 없다");
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!config[section]) {
      throw new Error(`config: ${section} 절이 없다`);
    }
  }

  config.workspace_root = path.resolve(config.workspace_root);
  config.brand = config.brand ?? {};
  return config;
}

export function resolveInWorkspace(config, relativePath) {
  const root = config.workspace_root;
  const target = path.resolve(root, relativePath);
  const inside = target === root || target.startsWith(root + path.sep);
  if (!inside) {
    throw new Error("경로가 워크스페이스 밖을 가리킨다");
  }
  return target;
}
```

`packages/doc-mcp/package.json`:

```json
{
  "name": "business-doc-mcp",
  "version": "0.1.0",
  "description": "Local MCP server that turns workspace facts into business documents",
  "type": "module",
  "license": "AGPL-3.0-only",
  "author": "soloandco",
  "bin": { "business-doc-mcp": "./src/server.mjs" },
  "files": ["src/", "config.example.json", "README.md"],
  "scripts": { "test": "node --test test/" },
  "engines": { "node": ">=20" },
  "dependencies": { "@modelcontextprotocol/sdk": "^1.26.0" }
}
```

`packages/doc-mcp/config.example.json`:

```json
{
  "workspace_root": "",
  "pricing": {
    "path": "ops/key-metrics.md",
    "fields": { "metric": "수치", "key": "키", "value": "값", "source": "정본", "verified_at": "확인일" }
  },
  "contacts": {
    "path": "ops/brand/positioning.md",
    "fields": { "label": "항목", "value": "값" },
    "lookup": { "person": "담당", "email": "이메일" }
  },
  "counterparties": {
    "path": "ops/sales/pipeline.md",
    "fields": { "id": "lead_id", "name": "대상", "stage": "단계" },
    "dir": "ops/sales/leads"
  },
  "issuer": { "display_name": "", "business_number": "" },
  "brand": { "accent": "", "ink": "", "font_family": "" },
  "output": { "filename": "quote-{name}-{date}.html" }
}
```

루트 `package.json`의 `"engines"` 바로 앞 줄에 아래를 추가한다.

```json
  "workspaces": ["packages/*"],
```

루트 `.gitignore`에 아래 줄을 추가한다.

```
packages/doc-mcp/config.json
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test packages/doc-mcp/test/config.test.mjs`
Expected: PASS 7건

- [ ] **Step 5: 커밋한다**

```bash
git add package.json .gitignore packages/doc-mcp/package.json packages/doc-mcp/config.example.json packages/doc-mcp/src/config.mjs packages/doc-mcp/test/config.test.mjs
git commit -m "feat(doc-mcp): add package skeleton with config loader and path guard"
```

---

### Task 2: 워크스페이스 값 읽기

**Files:**
- Create: `packages/doc-mcp/src/workspace.mjs`
- Create: `packages/doc-mcp/test/workspace.test.mjs`
- Create: `packages/doc-mcp/test/fixtures/metrics.md`
- Create: `packages/doc-mcp/test/fixtures/contacts.md`
- Create: `packages/doc-mcp/test/fixtures/pipeline.md`

**Interfaces:**
- Consumes: `loadConfig`, `resolveInWorkspace` (Task 1)
- Produces:
  - `parseTables(markdown) -> Array<{ headers: string[], rows: Array<Record<string,string>> }>`
  - `readPricing(config) -> Array<{ metric, key, value, source, verified_at }>`
  - `readIssuer(config) -> { display_name, business_number, person, email }`
  - `readCounterparty(config, slug) -> { id, name, stage, dir }`

표를 고르는 규칙은 하나다. **설정에 적은 필드 이름이 헤더에 전부 있는 첫 번째 표를 쓴다.** 열이 더 있어도 상관없다.

- [ ] **Step 1: 픽스처를 만든다**

`packages/doc-mcp/test/fixtures/metrics.md`:

```markdown
# 수치 등록부

## 관측 수치

| 수치 | 정본 |
|---|---|
| 팔로워 | 외부 도구 |

## 정책 수치

| 수치 | 키 | 값 | 정본 | 확인일 |
|---|---|---|---|---|
| 알파 모듈 시작가 | 알파 | 1,000,000원 | [모듈 가격](offers/pricing.md) | 2026-01-02 |
| 베타 모듈 시작가 | 베타 | 2,000,000원 | [모듈 가격](offers/pricing.md) | 2026-01-02 |
```

`packages/doc-mcp/test/fixtures/contacts.md`:

```markdown
# 브랜드

## 대외 연락처 정본

| 항목 | 값 |
|---|---|
| 담당 | 홍길동 |
| 이메일 | hello@example.test |
```

`packages/doc-mcp/test/fixtures/pipeline.md`:

```markdown
# 파이프라인

| lead_id | 대상 | 유형 | 단계 | 담당 |
|---|---|---|---|---|
| L-001 | 샘플상사 | 신규 | proposal | 홍길동 |
| L-002 | 예시공방 | 협업 | captured | 홍길동 |
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`packages/doc-mcp/test/workspace.test.mjs`:

```js
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

test("throws when the configured table is absent", () => {
  const config = makeConfig();
  fs.writeFileSync(path.join(config.workspace_root, "metrics.md"), "# 없음\n", "utf8");
  assert.throws(() => readPricing(config), /표를 찾지 못했다/);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test packages/doc-mcp/test/workspace.test.mjs`
Expected: FAIL. `Cannot find module '../src/workspace.mjs'`

- [ ] **Step 4: 최소 구현을 쓴다**

`packages/doc-mcp/src/workspace.mjs`:

```js
import fs from "node:fs";
import path from "node:path";

import { resolveInWorkspace } from "./config.mjs";

const splitRow = (line) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

const isDivider = (line) => /^\|?[\s:-]+\|[\s:|-]*$/.test(line.trim());

// 마크다운 링크에서 경로만 뽑는다. 링크가 아니면 원문을 돌려준다.
const unlink = (cell) => {
  const match = cell.match(/\]\(([^)]+)\)/);
  return (match ? match[1] : cell).split("#")[0].trim();
};

export function parseTables(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes("|") || !lines[i + 1] || !isDivider(lines[i + 1])) continue;
    const headers = splitRow(lines[i]);
    const rows = [];
    let cursor = i + 2;
    while (cursor < lines.length && lines[cursor].includes("|")) {
      const cells = splitRow(lines[cursor]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? "";
      });
      rows.push(row);
      cursor += 1;
    }
    tables.push({ headers, rows });
    i = cursor;
  }
  return tables;
}

function readTable(config, section) {
  const absolute = resolveInWorkspace(config, section.path);
  const markdown = fs.readFileSync(absolute, "utf8");
  const wanted = Object.values(section.fields);
  const table = parseTables(markdown).find((candidate) =>
    wanted.every((header) => candidate.headers.includes(header))
  );
  if (!table) {
    throw new Error(`설정한 열을 가진 표를 찾지 못했다: ${section.path}`);
  }
  return table;
}

export function readPricing(config) {
  const section = config.pricing;
  const table = readTable(config, section);
  return table.rows.map((row) => ({
    metric: row[section.fields.metric],
    key: row[section.fields.key],
    value: row[section.fields.value],
    source: unlink(row[section.fields.source]),
    verified_at: row[section.fields.verified_at],
  }));
}

export function readIssuer(config) {
  const section = config.contacts;
  const table = readTable(config, section);
  const result = { ...config.issuer };
  for (const [field, label] of Object.entries(section.lookup)) {
    const row = table.rows.find((candidate) => candidate[section.fields.label] === label);
    if (!row || !row[section.fields.value]) {
      throw new Error(`연락처 정본에 「${label}」 값이 없다`);
    }
    result[field] = row[section.fields.value];
  }
  return result;
}

export function readCounterparty(config, slug) {
  const section = config.counterparties;
  const table = readTable(config, section);
  const row = table.rows.find((candidate) => candidate[section.fields.name] === slug);
  if (!row) {
    throw new Error(`상대를 찾지 못했다: ${slug}`);
  }
  return {
    id: row[section.fields.id],
    name: row[section.fields.name],
    stage: row[section.fields.stage],
    dir: resolveInWorkspace(config, path.join(section.dir, slug)),
  };
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test packages/doc-mcp/test/workspace.test.mjs`
Expected: PASS 8건

- [ ] **Step 6: 기능을 지워도 통과하는지 확인한다**

`readTable`의 `wanted.every(...)` 조건을 잠시 `true`로 바꾸고 테스트를 돌린다.
Expected: "picks the table that has all configured field headers"가 FAIL. 되돌린 뒤 다시 PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add packages/doc-mcp/src/workspace.mjs packages/doc-mcp/test/workspace.test.mjs packages/doc-mcp/test/fixtures
git commit -m "feat(doc-mcp): read pricing, issuer, and counterparty from workspace tables"
```

---

### Task 3: 견적서 HTML 렌더

**Files:**
- Create: `packages/doc-mcp/src/templates/quote-html.mjs`
- Create: `packages/doc-mcp/test/quote-html.test.mjs`

**Interfaces:**
- Produces: `renderQuoteHtml(model) -> string`
  - `model`: `{ issuer: { display_name, person, email, business_number }, counterparty: { name }, items: Array<{ label, amount, note }>, total, issued_on, valid_until, brand: { accent, ink, font_family } }`

인쇄 안전 여백은 A4 세로 기준 상하 24mm·좌우 22mm다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/doc-mcp/test/quote-html.test.mjs`:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test packages/doc-mcp/test/quote-html.test.mjs`
Expected: FAIL. `Cannot find module '../src/templates/quote-html.mjs'`

- [ ] **Step 3: 최소 구현을 쓴다**

`packages/doc-mcp/src/templates/quote-html.mjs`:

```js
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);

const money = (amount) => Number(amount).toLocaleString("en-US");

const hexOr = (value, fallback, name) => {
  if (!value) return fallback;
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new Error(`brand.${name} 는 #RRGGBB 형식이어야 한다`);
  }
  return value;
};

const fontOr = (value, fallback) => {
  if (!value) return fallback;
  if (/[<>{};]/.test(value)) {
    throw new Error("brand.font_family 에 쓸 수 없는 문자가 있다");
  }
  return value;
};

export function renderQuoteHtml(model) {
  const accent = hexOr(model.brand?.accent, "#111111", "accent");
  const ink = hexOr(model.brand?.ink, "#111111", "ink");
  const font = fontOr(model.brand?.font_family, "sans-serif");
  const taxed = Boolean(model.issuer.business_number);

  const rows = model.items
    .map(
      (item) =>
        `<tr><td>${escape(item.label)}</td><td class="note">${escape(item.note)}</td>` +
        `<td class="num">${money(item.amount)}</td></tr>`
    )
    .join("");

  const issuerLines = [
    escape(model.issuer.display_name),
    taxed ? `사업자등록번호 ${escape(model.issuer.business_number)}` : "",
    escape(model.issuer.person),
    escape(model.issuer.email),
  ]
    .filter(Boolean)
    .map((line) => `<div>${line}</div>`)
    .join("");

  const totalLabel = taxed ? "합계 (부가세 별도)" : "합계";

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>견적서 ${escape(model.counterparty.name)}</title>
<style>
:root{ --accent:${accent}; --ink:${ink}; --line:#e6e6e6; --mid:#555555; }
@page{ size: A4; margin: 24mm 22mm; }
*{ box-sizing:border-box; }
body{ margin:0; font-family:${font}; color:var(--ink); font-size:10.5pt; line-height:1.6; }
h1{ font-size:20pt; margin:0 0 4mm; color:var(--accent); letter-spacing:-0.01em; }
.meta{ color:var(--mid); font-size:9.5pt; }
.parties{ display:flex; gap:12mm; margin:10mm 0 8mm; }
.parties > div{ flex:1; }
.label{ font-size:9pt; color:var(--mid); margin-bottom:2mm; }
table{ width:100%; border-collapse:collapse; margin-top:4mm; }
th,td{ padding:3mm 2mm; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
th{ font-size:9pt; color:var(--mid); font-weight:600; }
.num{ text-align:right; white-space:nowrap; }
.note{ color:var(--mid); font-size:9.5pt; }
tfoot td{ border-bottom:none; border-top:2px solid var(--accent); font-weight:700; font-size:12pt; padding-top:4mm; }
</style>
</head>
<body>
<h1>견적서</h1>
<div class="meta">발행일 ${escape(model.issued_on)} · 유효기간 ${escape(model.valid_until)}까지</div>
<div class="parties">
  <div><div class="label">받는 곳</div><div>${escape(model.counterparty.name)} 귀중</div></div>
  <div><div class="label">보내는 곳</div>${issuerLines}</div>
</div>
<table>
  <thead><tr><th>항목</th><th>내용</th><th class="num">금액 (원)</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td>${totalLabel}</td><td></td><td class="num">${money(model.total)}</td></tr></tfoot>
</table>
</body>
</html>
`;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test packages/doc-mcp/test/quote-html.test.mjs`
Expected: PASS 8건

- [ ] **Step 5: 기능을 지워도 통과하는지 확인한다**

`escape` 함수가 원문을 그대로 돌려주도록 잠시 바꾸고 테스트를 돌린다.
Expected: "escapes html in every text field"가 FAIL. 되돌린 뒤 다시 PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add packages/doc-mcp/src/templates/quote-html.mjs packages/doc-mcp/test/quote-html.test.mjs
git commit -m "feat(doc-mcp): render a4 quote html with escaping and neutral fallbacks"
```

---

### Task 4: 견적 조립과 저장

**Files:**
- Create: `packages/doc-mcp/src/quote.mjs`
- Create: `packages/doc-mcp/test/quote.test.mjs`

**Interfaces:**
- Consumes: `readIssuer`, `readCounterparty` (Task 2), `renderQuoteHtml` (Task 3), `resolveInWorkspace` (Task 1)
- Produces: `createQuote(config, { counterparty, items, valid_days, today }) -> { path, total, counterparty }`
  - `items`: `Array<{ label, amount, note? }>`
  - `today`는 테스트용 주입이며 생략하면 오늘 날짜를 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/doc-mcp/test/quote.test.mjs`:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `node --test packages/doc-mcp/test/quote.test.mjs`
Expected: FAIL. `Cannot find module '../src/quote.mjs'`

- [ ] **Step 3: 최소 구현을 쓴다**

`packages/doc-mcp/src/quote.mjs`:

```js
import fs from "node:fs";
import path from "node:path";

import { renderQuoteHtml } from "./templates/quote-html.mjs";
import { readCounterparty, readIssuer } from "./workspace.mjs";

const isoDate = (date) => date.toISOString().slice(0, 10);

const addDays = (isoString, days) => {
  const base = new Date(`${isoString}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return isoDate(base);
};

export function createQuote(config, input) {
  const items = input.items ?? [];
  if (items.length === 0) {
    throw new Error("항목이 최소 하나 있어야 한다");
  }
  for (const item of items) {
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      throw new Error("금액은 0보다 큰 숫자여야 한다");
    }
  }

  const counterparty = readCounterparty(config, input.counterparty);
  const issuer = readIssuer(config);
  const issuedOn = input.today ?? isoDate(new Date());
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  const html = renderQuoteHtml({
    issuer,
    counterparty,
    items: items.map((item) => ({ label: item.label, amount: item.amount, note: item.note ?? "" })),
    total,
    issued_on: issuedOn,
    valid_until: addDays(issuedOn, input.valid_days ?? 30),
    brand: config.brand ?? {},
  });

  const filename = config.output.filename
    .replace("{name}", counterparty.name)
    .replace("{date}", issuedOn);
  const target = path.join(counterparty.dir, filename);

  fs.mkdirSync(counterparty.dir, { recursive: true });
  fs.writeFileSync(target, html, "utf8");

  return { path: target, total, counterparty: counterparty.name };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `node --test packages/doc-mcp/test/quote.test.mjs`
Expected: PASS 7건

- [ ] **Step 5: 커밋한다**

```bash
git add packages/doc-mcp/src/quote.mjs packages/doc-mcp/test/quote.test.mjs
git commit -m "feat(doc-mcp): assemble and save the quote file"
```

---

### Task 5: MCP 서버 배선

**Files:**
- Create: `packages/doc-mcp/src/tools.mjs`
- Create: `packages/doc-mcp/src/server.mjs`
- Create: `packages/doc-mcp/test/tools.test.mjs`
- Create: `packages/doc-mcp/README.md`

**Interfaces:**
- Consumes: `readPricing`, `readCounterparty` (Task 2), `createQuote` (Task 4), `loadConfig` (Task 1)
- Produces: `TOOL_LIST`, `dispatch(config, name, args) -> { content: [{ type: "text", text }], isError? }`

- [ ] **Step 1: 의존성을 설치한다**

```bash
npm install --workspace packages/doc-mcp @modelcontextprotocol/sdk@^1.26.0
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`packages/doc-mcp/test/tools.test.mjs`:

```js
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
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `node --test packages/doc-mcp/test/tools.test.mjs`
Expected: FAIL. `Cannot find module '../src/tools.mjs'`

- [ ] **Step 4: 최소 구현을 쓴다**

`packages/doc-mcp/src/tools.mjs`:

```js
import { createQuote } from "./quote.mjs";
import { readCounterparty, readPricing } from "./workspace.mjs";

export const TOOL_LIST = [
  {
    name: "get_pricing",
    description: "워크스페이스 수치 등록부에서 정책 수치를 값·정본 경로·확인일과 함께 읽는다.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_counterparty",
    description: "파이프라인에서 상대의 식별자·이름·단계와 저장 폴더를 읽는다.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "파이프라인 표의 상대 이름" } },
      required: ["slug"],
    },
  },
  {
    name: "create_quote",
    description: "A4 HTML 견적서를 만들어 상대 폴더에 저장하고 경로를 돌려준다. 문구 작성은 하지 않는다.",
    inputSchema: {
      type: "object",
      properties: {
        counterparty: { type: "string", description: "파이프라인 표의 상대 이름" },
        items: {
          type: "array",
          description: "견적 항목",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              amount: { type: "number" },
              note: { type: "string" },
            },
            required: ["label", "amount"],
          },
        },
        valid_days: { type: "number", description: "유효기간 일수 (기본 30)", default: 30 },
      },
      required: ["counterparty", "items"],
    },
  },
];

const text = (body) => ({ content: [{ type: "text", text: body }] });
const fail = (body) => ({ content: [{ type: "text", text: body }], isError: true });

export async function dispatch(config, name, rawArgs) {
  const args = rawArgs ?? {};
  try {
    switch (name) {
      case "get_pricing": {
        const rows = readPricing(config);
        const body = rows
          .map((row) => `${row.metric}: ${row.value} (정본 ${row.source}, 확인 ${row.verified_at})`)
          .join("\n");
        return text(body || "등록된 정책 수치가 없다");
      }
      case "get_counterparty": {
        const found = readCounterparty(config, String(args.slug ?? ""));
        return text(`${found.name} / ${found.id} / 단계 ${found.stage} / 저장 폴더 ${found.dir}`);
      }
      case "create_quote": {
        const result = createQuote(config, {
          counterparty: String(args.counterparty ?? ""),
          items: Array.isArray(args.items) ? args.items : [],
          valid_days: Number.isFinite(args.valid_days) ? args.valid_days : 30,
        });
        return text(`견적서 저장됨\n경로: ${result.path}\n합계: ${result.total.toLocaleString("en-US")}`);
      }
      default:
        return fail(`알 수 없는 도구: ${name}`);
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
```

`packages/doc-mcp/src/server.mjs`:

```js
#!/usr/bin/env node
import path from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./config.mjs";
import { TOOL_LIST, dispatch } from "./tools.mjs";

const configPath = process.env.DOC_MCP_CONFIG ?? path.resolve(process.cwd(), "config.json");

let config;
try {
  config = loadConfig(configPath);
} catch (err) {
  console.error(`설정을 읽지 못했다: ${err instanceof Error ? err.message : err}`);
  console.error(`설정 위치: ${configPath}`);
  console.error("config.example.json 을 복사해 config.json 으로 만들고 DOC_MCP_CONFIG 로 경로를 지정한다.");
  process.exit(1);
}

const server = new Server({ name: "business-doc-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_LIST }));
server.setRequestHandler(CallToolRequestSchema, async (req) => dispatch(config, req.params.name, req.params.arguments));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("business-doc-mcp 시작됨");
```

`packages/doc-mcp/README.md`에는 아래만 적는다. 실제 값은 넣지 않는다.

- 무엇을 하는 도구인지 두 줄
- 설정 만드는 법 (`config.example.json` 복사, `workspace_root` 채우기)
- MCP 클라이언트 등록 예시 (`command: node`, `args`에 `src/server.mjs` 절대 경로, `env`에 `DOC_MCP_CONFIG`)
- 도구 3개 표
- "데이터는 전부 로컬에 저장된다. 외부로 전송되지 않는다"

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `node --test packages/doc-mcp/test/`
Expected: PASS 30건

- [ ] **Step 6: 서버가 실제로 뜨는지 확인한다**

픽스처를 복사한 임시 워크스페이스와 그것을 가리키는 `config.json`을 만든 뒤 실행한다.

Run: `DOC_MCP_CONFIG=<임시 config.json 경로> node packages/doc-mcp/src/server.mjs`
Expected: stderr에 `business-doc-mcp 시작됨`. Ctrl+C로 종료

- [ ] **Step 7: 커밋한다**

```bash
git add packages/doc-mcp/src/tools.mjs packages/doc-mcp/src/server.mjs packages/doc-mcp/test/tools.test.mjs packages/doc-mcp/README.md package.json package-lock.json
git commit -m "feat(doc-mcp): wire the stdio server and expose three tools"
```

---

### Task 6: 실사용 검증

**Files:**
- Create: `packages/doc-mcp/config.json` (커밋하지 않는다. Task 1에서 `.gitignore`에 넣었다)
- Modify: `docs/doc-mcp-design.md` (검증 결과 한 줄 추가)

**Interfaces:**
- Consumes: 전체

- [ ] **Step 1: 실제 워크스페이스를 가리키는 설정을 만든다**

`config.example.json`을 `config.json`으로 복사하고 `workspace_root`에 비공개 워크스페이스의 절대 경로를 넣는다. `issuer.display_name`과 `brand`는 그 워크스페이스의 정본 값으로 채운다. `business_number`는 비워 둔다.

- [ ] **Step 2: 가격이 등록부와 일치하는지 확인한다**

`readPricing`을 한 번 호출해 결과를 출력하는 임시 스크립트를 `packages/doc-mcp/`에 만들어 실행하고, 확인 후 지운다.

Expected: 등록부의 정책 수치가 그대로 출력된다. 값·정본 경로·확인일이 등록부와 한 글자도 다르지 않아야 한다

- [ ] **Step 3: 실제 리드로 견적서를 만든다**

같은 방식으로 `createQuote`를 한 번 호출한다. `counterparty`는 파이프라인 표에 실제로 있는 이름, `items`의 금액은 등록부의 값을 그대로 쓴다.

Expected: 상대 폴더에 견적서 HTML이 저장되고 경로가 출력된다

- [ ] **Step 4: 인쇄 여백을 실측한다**

브라우저로 그 HTML을 열고 PDF로 출력해 글자와 표가 상하 24mm·좌우 22mm 안에 들어오는지 확인한다.
Expected: 넘는 요소 0개. 넘으면 표 셀 여백부터 줄이고 글자 크기는 마지막에 건드린다

- [ ] **Step 5: 저장소에 실제 값이 없는지 확인한다**

```bash
git grep -nE "[0-9]{3}-[0-9]{2}-[0-9]{5}" -- packages/doc-mcp
git grep -nEi "@(gmail|naver|daum)\." -- packages/doc-mcp
git status --short
```

Expected: 앞의 두 명령이 0건. `config.json`이 추적 목록에 없어야 한다. 워크스페이스의 브랜드 색 HEX도 같은 방식으로 한 번 검색해 0건인지 본다

- [ ] **Step 6: 전체 테스트를 돌린다**

Run: `npm test --workspaces --if-present && npm test`
Expected: 전부 PASS. 기존 `generator.test.mjs`도 그대로 통과

- [ ] **Step 7: 검증 결과를 설계 문서에 적고 커밋한다**

`docs/doc-mcp-design.md` 맨 아래에 실측 결과 한 줄을 추가한다. 무엇으로 확인했고 여백이 몇 mm였는지 적는다.

```bash
git add docs/doc-mcp-design.md
git commit -m "docs(doc-mcp): record the first real quote verification"
```

---

## 자기 점검

- 설계의 도구 3개, 값 출처 5종, 보안 4항, 안 만드는 것 5종이 전부 태스크에 대응한다
- 보안 4항 대응: 1번은 전역 제약과 Task 5의 import 목록, 2번은 Task 1, 3번은 Task 1의 마지막 테스트, 4번은 Task 3
- 함수 이름은 태스크 사이에서 동일하다: `loadConfig`·`resolveInWorkspace`·`parseTables`·`readPricing`·`readIssuer`·`readCounterparty`·`renderQuoteHtml`·`createQuote`·`dispatch`
- 미결 항목과 자리표시자는 없다
