import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(sourceDirectory, "workspace-presets.json");

// Older profiles keep loading so an existing workspace is never blocked by a schema bump.
const supportedProfileVersions = ["0.1.0", "0.2.0"];
const hexPattern = /^#[0-9a-fA-F]{6}$/;

export function loadManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function loadProfile(profilePath) {
  const profile = JSON.parse(fs.readFileSync(path.resolve(profilePath), "utf8"));
  const manifest = loadManifest();
  const errors = [];

  if (!supportedProfileVersions.includes(profile.schemaVersion)) {
    errors.push(`schemaVersion must be one of: ${supportedProfileVersions.join(", ")}`);
  }
  if (!profile.workspaceName || typeof profile.workspaceName !== "string") {
    errors.push("workspaceName is required");
  }
  if (!manifest.presets[profile.preset]) {
    errors.push(`preset must be one of: ${Object.keys(manifest.presets).join(", ")}`);
  }
  if (profile.modules && !Array.isArray(profile.modules)) {
    errors.push("modules must be an array");
  }
  for (const moduleName of profile.modules ?? []) {
    if (!manifest.modules[moduleName]) errors.push(`unknown module: ${moduleName}`);
  }
  errors.push(...brandErrors(profile.brand));
  if (errors.length) throw new Error(`Invalid interview profile:\n- ${errors.join("\n- ")}`);
  return profile;
}

function brandErrors(brand) {
  if (brand === undefined) return [];
  if (typeof brand !== "object" || brand === null || Array.isArray(brand)) return ["brand must be an object"];
  const errors = [];
  if (brand.colors !== undefined && !Array.isArray(brand.colors)) errors.push("brand.colors must be an array");
  for (const [index, color] of (Array.isArray(brand.colors) ? brand.colors : []).entries()) {
    if (!color || typeof color.name !== "string" || !color.name) errors.push(`brand.colors[${index}].name is required`);
    if (!hexPattern.test(color?.hex ?? "")) errors.push(`brand.colors[${index}].hex must look like #RRGGBB`);
    if (color?.textHex !== undefined && !hexPattern.test(color.textHex)) {
      errors.push(`brand.colors[${index}].textHex must look like #RRGGBB`);
    }
  }
  return errors;
}

export function buildPlan({ preset, name = "My Business OS", target = ".", modules = [], profile, notion = false }) {
  const manifest = loadManifest();
  const selected = manifest.presets[preset];
  if (!selected) {
    throw new Error(`Unknown preset: ${preset}. Choose one of: ${Object.keys(manifest.presets).join(", ")}`);
  }

  const unknownModules = modules.filter((moduleName) => !manifest.modules[moduleName]);
  if (unknownModules.length) throw new Error(`Unknown modules: ${unknownModules.join(", ")}`);

  const moduleDirectories = modules.flatMap((moduleName) => manifest.modules[moduleName]);
  const seen = new Set();
  const directories = [...manifest.common, ...selected.directories, ...moduleDirectories].filter((entry) => {
    if (seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });

  return {
    schemaVersion: manifest.schemaVersion,
    preset,
    presetTitle: selected.title,
    presetDescription: selected.description,
    name,
    modules,
    profile,
    notion: notion === true,
    target: path.resolve(target),
    directories,
    tables: tableLocations[preset],
    tableFiles: [...tableFileList(tableLocations[preset]), ...(modules.includes("ir") ? irTableFiles : [])],
  };
}

// toISOString() is UTC, so a workspace generated before 09:00 in Korea would be stamped with yesterday.
export function localDate(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function assertSafeTarget(target) {
  const resolved = path.resolve(target);
  if (resolved === path.parse(resolved).root || resolved === path.resolve(os.homedir())) {
    throw new Error(`Refusing to generate into broad path: ${resolved}`);
  }
  if (fs.existsSync(resolved) && fs.readdirSync(resolved).length > 0) {
    throw new Error(`Target must be empty or absent: ${resolved}`);
  }
  return resolved;
}

function frontmatter({ type, title, description, date, extra = "" }) {
  return `---\ntype: ${type}\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\ntimestamp: ${date}${extra}\n---\n`;
}

// ir is outward-facing like sales, so investor material waits for the onboarding gate too.
const gatedPathPattern = /(^|\/)(branding|content|ir|marketing|sales|website)(\/|$)/;

function isGated(entry) {
  return gatedPathPattern.test(entry.path);
}

function onboardingMarkdown(plan, date) {
  return `---
type: Note
title: ${JSON.stringify(`${plan.name} 필수 온보딩`)}
description: 홈페이지·콘텐츠·마케팅·영업보다 먼저 확인하는 고객·상품 정의
timestamp: ${date}
status: blocked
owner: ""
review_at: ""
primary_customer: ""
offer: ""
excluded_customer: ""
strengths: ""
purchase_trigger: ""
first_question: ""
objection: ""
decision_criteria: ""
desired_change: ""
evidence: ""
---

# 필수 온보딩

이 문서가 \`active\`가 되기 전에는 홈페이지·콘텐츠·마케팅·영업 실행을 시작하지 않습니다. 폴더가 있다는 것과 사업 맥락이 입력됐다는 것은 다릅니다.

## 필수 네 가지

프론트매터의 아래 값을 채웁니다. 에이전트가 문서에서 추정하지 않고 운영자에게 확인받습니다.

| 필드 | 답할 질문 |
|---|---|
| \`primary_customer\` | 가장 먼저 데려올 고객은 누구인가 |
| \`offer\` | 그 고객에게 무엇을 파는가 |
| \`excluded_customer\` | 누구에게는 팔지 않는가 |
| \`strengths\` | 실제 결과를 낸 적 있는 일은 무엇인가. 둘까지만 적는다 |

## 나중에 채워도 되는 것

비워 두고 시작해도 됩니다. 고객을 만나면서 알게 되면 채웁니다.

| 필드 | 답할 질문 |
|---|---|
| \`purchase_trigger\` | 어떤 사건이 생겼을 때 돈을 쓰는가 |
| \`first_question\` | 처음 가장 먼저 묻는 질문은 무엇인가 |
| \`objection\` | 구매 전에 가장 크게 망설이는 이유는 무엇인가 |
| \`decision_criteria\` | 무엇을 확인하면 구매를 결정하는가 |
| \`desired_change\` | 구매 뒤 어떤 상태가 되길 원하는가 |
| \`evidence\` | 이를 증명할 사례·수치·산출물은 무엇인가 |

## 완료 방법

1. 필수 네 가지를 운영자에게 확인받아 프론트매터에 적습니다.
2. 네 가지가 확인되면 \`status: active\`로 바꿉니다.
3. 루트에서 \`node .soloandco/onboarding-check.mjs\`를 실행합니다.
4. \`OK: onboarding complete\`가 나온 뒤 다음 업무를 시작합니다.

## 허용 범위

완료 전에는 이 온보딩 작성, 기존 자료 수집, 증거 위치 확인만 합니다. 홈페이지 카피·콘텐츠 원고·캠페인·영업 제안은 만들지 않습니다.
`;
}

function onboardingCheckScript() {
  return `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "..");
const onboardingPath = path.join(workspaceRoot, "onboarding.md");
const requiredFields = [
  "primary_customer",
  "offer",
  "excluded_customer",
  "strengths",
];

if (!fs.existsSync(onboardingPath)) {
  process.stderr.write("BLOCKED: onboarding.md not found\\n");
  process.exit(1);
}

const content = fs.readFileSync(onboardingPath, "utf8");
function fieldValue(name) {
  const match = content.match(new RegExp("^" + name + ":\\\\s*(.*)$", "m"));
  if (!match) return "";
  return match[1].trim().replace(/^(["'])|(["'])$/g, "").trim();
}

const invalidValues = new Set(["", "unknown", "미정", "확인 필요"]);
const missing = requiredFields.filter((field) => invalidValues.has(fieldValue(field)));
const status = fieldValue("status");

if (status !== "active" || missing.length > 0) {
  process.stderr.write("BLOCKED: required onboarding is incomplete\\n");
  if (status !== "active") process.stderr.write("- status must be active\\n");
  for (const field of missing) process.stderr.write("- missing: " + field + "\\n");
  process.exit(1);
}

process.stdout.write("OK: onboarding complete\\n");
`;
}

function readmeMarkdown(plan) {
  const rows = plan.directories
    .map((entry) => `| \`${entry.path}/\` | ${entry.description} | ${isGated(entry) ? "온보딩 후" : ""} |`)
    .join("\n");
  const tables = plan.tableFiles.map((entry) => `| \`${entry.path}\` | ${entry.role} |`).join("\n");
  return `# ${plan.name}

Solo & Co OS의 \`${plan.preset}\` 프리셋으로 생성된 파일 기반 Business OS입니다.

## 구조

폴더 지도는 이 표 한 곳입니다. 폴더 안 파일이 10개를 넘으면 그때 그 폴더에 \`index.md\`를 만듭니다.

「온보딩 후」 표시가 있는 폴더는 \`onboarding.md\`가 \`status: active\`가 되기 전에는 실행 업무를 시작하지 않습니다.

| 폴더 | 역할 | 시작 조건 |
|---|---|---|
${rows}

## 고정 표

같은 형태로 반복되는 기록은 요약 문서가 아니라 아래 표에 한 줄씩 쌓습니다. 견적서 도구(\`packages/doc-mcp\`)는 가격·연락처·고객 표를 그대로 읽고, 설정은 \`.soloandco/doc-mcp.config.json\`에 미리 채워져 있습니다.

| 파일 | 담는 것 |
|---|---|
${tables}

${plan.notion ? notionReadmeSection() : ""}## 첫 10분

1. 다른 업무보다 먼저 루트의 [필수 온보딩](onboarding.md)을 운영자와 작성합니다.
2. \`status: active\`로 바꾼 뒤 \`node .soloandco/onboarding-check.mjs\`를 실행합니다.
3. 검사를 통과한 뒤 현재 진행 중인 고객·멤버·프로젝트 하나를 기록합니다.
4. 모든 활성 문서에 담당자·다음 행동·재검토일을 둡니다.
5. 실제 숫자가 없으면 0으로 추정하지 않고 \`unknown\`으로 기록합니다.
6. 비밀번호·복구 코드·불필요한 개인정보는 저장하지 않습니다.

온보딩을 통과하기 전에는 홈페이지·콘텐츠·마케팅·영업 실행을 시작하지 않습니다. 생성 설정은 \`.soloandco/config.json\`에 있습니다.
`;
}

function agentsMarkdown(plan) {
  return `# ${plan.name}\n\n이 워크스페이스는 Solo & Co OS \`${plan.preset}\` 프리셋으로 생성되었습니다.\n\n> 이 파일이 AI 도구가 읽는 워크스페이스 규칙의 정본입니다. \`CLAUDE.md\`는 이 파일을 가리키는 포인터입니다.\n\n## 규칙과 스킬의 위치\n\n- 규칙은 이 파일에만 기록하고 \`CLAUDE.md\`에는 복사하지 않습니다.\n- 스킬의 정본은 \`.claude/skills/\`입니다. 관련 작업 전에 그 안의 해당 \`SKILL.md\`를 읽습니다.\n\n## 필수 온보딩 관문\n\n- 모든 세션은 루트의 \`onboarding.md\`를 먼저 읽고 \`node .soloandco/onboarding-check.mjs\`를 실행합니다.\n- 문서가 없거나 검사가 실패하면 다른 요청보다 온보딩을 먼저 안내합니다. 운영자에게 필수 값을 하나씩 확인받고 문서에 기록합니다.\n- 온보딩 완료 전 허용되는 작업은 온보딩 작성, 기존 자료 수집, 증거 위치 확인뿐입니다.\n- 온보딩 완료 전에는 홈페이지 카피·콘텐츠 원고·마케팅 캠페인·영업 제안·브랜드 메시지를 만들거나 확정하지 않습니다.\n- 값을 기존 문서에서 추정하지 않습니다. 운영자가 확인한 뒤 \`status: active\`로 바꾸고 검사 통과를 확인합니다.\n\n## 운영 규칙\n\n- 폴더 지도는 루트 \`README.md\` 한 곳에 둡니다. 폴더 안 파일이 10개를 넘을 때만 그 폴더에 \`index.md\`를 만듭니다.\n- 가격·연락처·고객·수치처럼 반복되는 기록은 README 「고정 표」의 파일에 한 줄씩 추가합니다. 같은 내용을 요약 문서로 따로 만들지 않습니다.\n- 프로젝트 폴더는 \`YYYY-MM-<slug>/\` 형식을 권장합니다.\n- 실제 수치가 없으면 \`unknown\`으로 기록합니다.\n- 활성 업무에는 담당자, 다음 행동, 재검토일을 기록합니다.\n- 고객·계약·정산 등 민감 정보는 공개 저장소에 올리지 않습니다.\n- 한 사실에는 하나의 정본만 두고 다른 문서에서는 링크합니다.\n\n${plan.notion ? notionAgentsSection() : notionOffAgentsSection()}`;
}

// Claude Code auto-loads CLAUDE.md (not AGENTS.md), so ship a pointer file.
// Keeping the rules in ONE file avoids two copies drifting apart.
function claudeMarkdown(plan) {
  return `# ${plan.name}\n\n**워크스페이스 규칙의 정본은 [AGENTS.md](AGENTS.md)입니다. 작업 시작 전 AGENTS.md를 읽으세요.**\n\n이 파일은 포인터입니다. 규칙 변경은 AGENTS.md에만 반영합니다. 같은 내용을 두 파일에 병기하면 반드시 한쪽만 갱신되어 갈라지기 때문입니다.\n`;
}

function scorecardMarkdown(date) {
  return `${frontmatter({ type: "Note", title: "주간 운영 점수판", description: "영업·실행·재무·학습의 현재 상태와 다음 행동", date })}\n# 주간 운영 점수판\n\n| 영역 | 신호 | 현재 상태 | 다음 행동 | 재검토일 |\n|---|---|---|---|---|\n| 영업 | unknown | 기준선 미입력 | 실제 파이프라인 확인 |  |\n| 실행 | unknown | 기준선 미입력 | 가장 중요한 결과 하나 선택 |  |\n| 재무 | unknown | 기준선 미입력 | 실제 수금·비용 확인 |  |\n| 학습 | unknown | 기준선 미입력 | 다음 실험 하나 선택 |  |\n`;
}

function decisionsMarkdown(date) {
  return `${frontmatter({ type: "Log", title: "의사결정 로그", description: "결정과 이유를 최신순으로 남기는 append-only 로그", date })}\n# 의사결정 로그\n\n## ${date}\n\n- **워크스페이스 생성** — Solo & Co OS 프리셋으로 초기 구조를 만들었다.\n`;
}

function memberOverviewTemplate(date) {
  return `${frontmatter({ type: "Template", title: "멤버 프로필 템플릿", description: "신규 소속 멤버의 사업·계약·성장 현황을 시작하는 템플릿", date })}\n# 멤버 이름\n\n## 기본 정보\n\n- 사업/브랜드:\n- 대표:\n- 소속 시작:\n- 계약 기간:\n- 핵심 고객:\n- 핵심 상품:\n\n## 첫 90일 목표\n\n1.\n2.\n3.\n\n## 현재 병목과 다음 행동\n\n- 병목:\n- 담당자:\n- 다음 행동:\n- 재검토일:\n`;
}

// Skill folder names stay ASCII so every harness can load them. Rename freely afterwards.
function workspaceSlug(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workspace";
}

function brandData(plan) {
  const brand = plan.profile?.brand ?? {};
  return {
    colors: Array.isArray(brand.colors) ? brand.colors : [],
    fonts: brand.fonts ?? {},
    tone: brand.tone ?? "",
    avoid: Array.isArray(brand.avoid) ? brand.avoid : [],
  };
}

function colorRows(colors) {
  if (!colors.length) return "|  |  |  |  |\n|  |  |  |  |\n|  |  |  |  |";
  return colors
    .map((color) => {
      const forText = color.textHex ? `\`${color.textHex}\`` : "그대로 사용";
      return `| ${color.name} | \`${color.hex}\` | ${color.usage ?? ""} | ${forText} |`;
    })
    .join("\n");
}

function fontLines(fonts) {
  return [
    `- 제목: ${fonts.heading ?? ""}`,
    `- 본문: ${fonts.body ?? ""}`,
    `- 코드·수치: ${fonts.mono ?? ""}`,
  ].join("\n");
}

function brandCss(brand) {
  const variables = brand.colors
    .map((color, index) => `  --brand-${index + 1}:${color.hex}; /* ${color.name} */`)
    .join("\n");
  const family = brand.fonts.body ? `'${brand.fonts.body}', sans-serif` : "sans-serif";
  return `\`\`\`css\n:root{\n${variables}\n}\nbody{ font-family:${family}; }\n\`\`\``;
}

function brandGuidelinesMarkdown(plan, date) {
  const brand = brandData(plan);
  const avoid = brand.avoid.length
    ? brand.avoid.map((entry) => `- ${entry}`).join("\n")
    : "- 아직 없음. 쓰면 안 되는 색·표현·이미지를 발견하면 여기에 적는다.";
  return `${frontmatter({
    type: "Reference",
    title: "브랜드 규격",
    description: "산출물에 적용하는 색·서체·톤의 정본",
    date,
  })}
# 브랜드 규격

브랜드 값의 정본은 \`.claude/skills/${workspaceSlug(plan.name)}-brand/SKILL.md\` 하나다. 에이전트가 산출물을 만들 때 읽는 파일이 그쪽이기 때문이다. 이 문서는 사람이 읽고 처음 값을 채우는 안내판이며, 스킬에 값이 들어간 뒤에는 값 변경을 스킬에서만 한다. 두 파일의 값이 다르면 스킬을 따른다.

## 색

| 이름 | HEX | 용도 | 글자에 쓸 때 |
|---|---|---|---|
${colorRows(brand.colors)}

옅은 색은 면·막대·점처럼 칠하는 자리에만 쓰고, 글자에는 대비가 확보되는 어두운 값을 따로 적는다.

## 서체

${fontLines(brand.fonts)}

## 톤

${brand.tone || "문장의 태도를 한 줄로 적는다. 예: 담백하게, 과장하지 않는다."}

## 쓰지 말 것

${avoid}

## 채우는 법

1. 이미 만든 홈페이지·명함·소개서에서 실제로 쓰는 색을 뽑는다. 없으면 새로 정하지 말고 비워 둔다.
2. 색마다 용도를 한 줄로 적는다. 용도 없는 색은 결국 안 쓰인다.
3. 서체는 제목·본문 두 벌이면 충분하다.
`;
}

function brandSkillMarkdown(plan) {
  const brand = brandData(plan);
  const slug = workspaceSlug(plan.name);
  const description = `${plan.name}의 브랜드 색·서체 규격. ${plan.name} 이름으로 나가는 소개서·제안서·슬라이드·웹페이지·도식·썸네일을 만들거나 고칠 때 사용한다. 트리거 - 브랜드 색, 우리 색, 로고 색, 소개서, 제안서, 슬라이드.`;
  const header = `---\nname: ${slug}-brand\ndescription: ${description}\n---\n\n# ${plan.name} 브랜드 규격\n\n색·서체 값의 정본은 이 파일이다. \`brand/brand-guidelines.md\`는 처음 값을 채울 때 쓰는 안내판이며, 값 변경은 여기서만 한다.\n`;

  if (!brand.colors.length) {
    return `${header}
## 아직 쓸 수 없다

이 워크스페이스의 브랜드 값은 **아직 채워지지 않았다.**

\`brand/brand-guidelines.md\`를 먼저 채우고 그 값을 이 파일로 옮긴다. 옮긴 뒤에는 이 파일이 정본이다. 그 전에는 이 스킬을 적용하지 말고, 색이나 서체가 필요한 산출물을 만들 때 사용자에게 직접 묻는다. 임의로 색을 골라 쓰지 않는다.
`;
  }

  const avoid = brand.avoid.length ? brand.avoid.map((entry) => `- ${entry}`).join("\n") : "- 없음";
  return `${header}
## 색

| 이름 | HEX | 용도 | 글자에 쓸 때 |
|---|---|---|---|
${colorRows(brand.colors)}

## 서체

${fontLines(brand.fonts)}

## 쓰는 규칙

- 한 화면에 모든 색을 뿌리지 않는다. 그 문서의 주제에 해당하는 색 하나를 강조색으로 잡고 나머지는 회색조로 간다.
- 강조는 색보다 크기·굵기·여백으로 먼저 만든다. 그래도 부족할 때 색을 얹는다.
- 표에 \`글자에 쓸 때\` 값이 따로 있으면 글자·숫자에는 반드시 그 값을 쓴다. 원색은 면에만 쓴다.

## 쓰지 말 것

${avoid}
- 다른 회사나 제품의 브랜드 색. 만드는 물건의 주제가 그 회사일 때만 예외다.

## 붙여 쓰는 CSS

${brandCss(brand)}
`;
}

function writeBrandFiles(target, plan, date) {
  fs.writeFileSync(path.join(target, "brand", "brand-guidelines.md"), brandGuidelinesMarkdown(plan, date), "utf8");
  const skillDirectory = path.join(target, ".claude", "skills", `${workspaceSlug(plan.name)}-brand`);
  fs.mkdirSync(skillDirectory, { recursive: true });
  fs.writeFileSync(path.join(skillDirectory, "SKILL.md"), brandSkillMarkdown(plan), "utf8");
}

function writeStarterFiles(target, plan, date) {
  fs.writeFileSync(path.join(target, "ops", "scorecard.md"), scorecardMarkdown(date), "utf8");
  fs.writeFileSync(path.join(target, "memory", "decisions.md"), decisionsMarkdown(date), "utf8");
  if (plan.preset === "management-agency") {
    fs.writeFileSync(
      path.join(target, "members", "_templates", "member-overview.md"),
      memberOverviewTemplate(date),
      "utf8",
    );
  }
  if (plan.modules.includes("brand")) writeBrandFiles(target, plan, date);
}

// Where each preset keeps the record tables that packages/doc-mcp reads.
const tableLocations = {
  "solo-founder": {
    pricing: "offers/pricing.md",
    contacts: "business/contacts.md",
    pipeline: "customers/pipeline.md",
    counterpartyDir: "customers",
  },
  freelancer: {
    pricing: "services/pricing.md",
    contacts: "ops/contacts.md",
    pipeline: "sales/pipeline.md",
    counterpartyDir: "clients",
  },
  "management-agency": {
    pricing: "services/pricing.md",
    contacts: "ops/contacts.md",
    pipeline: "sales/pipeline.md",
    counterpartyDir: "sales",
  },
};

function tableFileList(tables) {
  return [
    { path: tables.pricing, role: "상품별 가격" },
    { path: tables.contacts, role: "견적서에 찍힐 담당자·이메일" },
    { path: tables.pipeline, role: `고객 한 명당 한 줄. 견적서는 「폴더」 칸의 \`${tables.counterpartyDir}/<폴더>/\`에 저장됩니다` },
  ];
}

function pricingMarkdown(date) {
  return `${frontmatter({ type: "Table", title: "가격표", description: "상품별 가격. 견적서 도구가 읽는다", date })}
# 가격표

상품 하나에 한 줄. 「키」는 견적서를 만들 때 부르는 짧은 이름이다. 가격이 정해지지 않았으면 줄을 만들지 않는다.

| 수치 | 키 | 값 | 정본 | 확인일 |
|---|---|---|---|---|
`;
}

function contactsMarkdown(date) {
  return `${frontmatter({ type: "Table", title: "대외 연락처", description: "견적서·제안서에 찍히는 담당자와 이메일", date })}
# 대외 연락처

견적서 도구는 「담당」과 「이메일」 두 줄을 읽는다. 비어 있으면 견적서를 만들지 않고 멈춘다.

| 항목 | 값 |
|---|---|
| 담당 |  |
| 이메일 |  |
`;
}

function pipelineMarkdown(date, counterpartyDir) {
  return `${frontmatter({ type: "Table", title: "고객 목록", description: "고객 한 명당 한 줄. 단계와 저장 폴더", date })}
# 고객 목록

고객 한 명당 한 줄. 「폴더」는 \`${counterpartyDir}/\` 아래 그 고객 자료를 두는 폴더 이름이다. 비우면 「대상」 이름을 그대로 쓴다.

단계: \`captured\`(알게 됨) · \`meeting\`(상담) · \`proposal\`(제안) · \`won\`(계약) · \`lost\`(무산)

| lead_id | 대상 | 단계 | 폴더 | 담당 | 다음 행동 | 재검토일 |
|---|---|---|---|---|---|---|
`;
}

function docMcpConfig(target, plan) {
  const tables = plan.tables;
  const brand = brandData(plan);
  const accent = brand.colors[0]?.textHex ?? brand.colors[0]?.hex ?? "";
  return {
    workspace_root: target.split(path.sep).join("/"),
    pricing: {
      path: tables.pricing,
      fields: { metric: "수치", key: "키", value: "값", source: "정본", verified_at: "확인일" },
    },
    contacts: {
      path: tables.contacts,
      fields: { label: "항목", value: "값" },
      lookup: { person: "담당", email: "이메일" },
    },
    counterparties: {
      path: tables.pipeline,
      fields: { id: "lead_id", name: "대상", stage: "단계", slug: "폴더" },
      dir: tables.counterpartyDir,
    },
    issuer: { display_name: plan.name, business_number: "" },
    brand: { accent, ink: "", font_family: brand.fonts.body ?? "" },
    output: { filename: "quote-{name}-{date}.html" },
  };
}

// IR material is assembled from four record files, not written from scratch each time.
// Order follows the usual investor read: numbers → market → strategy and team → the ask.
function irMetricsMarkdown(date) {
  return `${frontmatter({ type: "Table", title: "IR 수치", description: "IR 자료에 들어가는 숫자의 정본. 값마다 기준일과 출처", date })}
# IR 수치

IR 자료의 숫자는 전부 이 표에서 가져온다. 자료에 직접 숫자를 적지 않는다. 모르는 값은 \`unknown\`으로 두고 0으로 채우지 않는다.

같은 지표가 바뀌면 줄을 고치지 않고 새 기준일로 한 줄을 더한다. 추이가 그대로 남는다.

| 지표 | 값 | 단위 | 기준일 | 출처 | 비고 |
|---|---|---|---|---|---|
| 월 매출 | unknown | 원 |  |  |  |
| 누적 매출 | unknown | 원 |  |  |  |
| 유료 고객 수 | unknown | 명 |  |  |  |
| 재구매율 | unknown | % |  |  |  |
| 고객 1명 확보 비용 | unknown | 원 |  |  |  |
| 월 고정비 | unknown | 원 |  |  |  |
| 보유 현금 | unknown | 원 |  |  |  |
`;
}

function irMarketMarkdown(date) {
  return `${frontmatter({ type: "Table", title: "시장과 경쟁", description: "시장 규모 추정과 경쟁사 비교", date })}
# 시장과 경쟁

## 시장 규모

계산식을 함께 적는다. 숫자만 있으면 투자자가 믿지 않는다.

| 구분 | 정의 | 규모 | 계산식 | 출처 | 기준일 |
|---|---|---|---|---|---|
| 전체 시장 |  | unknown |  |  |  |
| 들어갈 수 있는 시장 |  | unknown |  |  |  |
| 3년 안에 가져올 시장 |  | unknown |  |  |  |

## 경쟁사

경쟁사 한 곳에 한 줄. 「우리가 다른 점」은 고객이 체감하는 차이로 적는다.

| 경쟁사 | 고객 | 가격 | 강점 | 약점 | 우리가 다른 점 | 확인일 |
|---|---|---|---|---|---|---|
`;
}

function irStoryMarkdown(date) {
  return `${frontmatter({ type: "Table", title: "사업 이야기", description: "문제·해결·전략·팀을 한 줄씩. IR 자료 앞부분의 재료", date })}
# 사업 이야기

항목마다 한두 문장. 길게 쓴 근거는 다른 문서에 두고 「근거」 칸에 링크한다. \`onboarding.md\`에 있는 고객·상품 정의와 어긋나면 온보딩 쪽이 맞다.

| 항목 | 내용 | 근거 |
|---|---|---|
| 고객이 겪는 문제 |  |  |
| 우리의 해결 방법 |  |  |
| 왜 지금인가 |  |  |
| 포지셔닝 (누구에게 무엇으로 기억되나) |  |  |
| 따라 하기 어려운 이유 |  |  |
| 돈 버는 구조 |  |  |
| 가격 |  |  |
| 성장 경로 (다음에 넓힐 고객·상품) |  |  |
| 위험과 대응 |  |  |

## 팀

| 이름 | 역할 | 이 일을 해낼 수 있는 근거 | 합류 시점 |
|---|---|---|---|
`;
}

function irFundingMarkdown(date) {
  return `${frontmatter({ type: "Table", title: "자금 계획", description: "필요 금액·용도·마일스톤·조달 이력", date })}
# 자금 계획

## 이번에 필요한 돈

| 항목 | 값 |
|---|---|
| 필요 금액 | unknown |
| 조달 방식 (투자·지원사업·융자) |  |
| 이 돈으로 버티는 기간 | unknown |

## 용도

| 용도 | 금액 | 비중 | 이 돈으로 달성할 것 |
|---|---|---|---|

## 마일스톤

IR에서 약속하는 목표. 지표는 \`ir/metrics.md\`의 지표 이름을 그대로 쓴다.

| 시점 | 지표 | 목표값 | 상태 |
|---|---|---|---|

## 조달 이력

| 날짜 | 방식 | 상대 | 금액 | 조건 |
|---|---|---|---|---|
`;
}

function writeIrFiles(target, date) {
  const irDirectory = path.join(target, "ir");
  fs.writeFileSync(path.join(irDirectory, "metrics.md"), irMetricsMarkdown(date), "utf8");
  fs.writeFileSync(path.join(irDirectory, "market.md"), irMarketMarkdown(date), "utf8");
  fs.writeFileSync(path.join(irDirectory, "story.md"), irStoryMarkdown(date), "utf8");
  fs.writeFileSync(path.join(irDirectory, "funding.md"), irFundingMarkdown(date), "utf8");
}

const irTableFiles = [
  { path: "ir/metrics.md", role: "IR 숫자의 정본. 지표마다 기준일·출처" },
  { path: "ir/market.md", role: "시장 규모 계산과 경쟁사 비교" },
  { path: "ir/story.md", role: "문제·해결·전략·팀을 한 줄씩" },
  { path: "ir/funding.md", role: "필요 금액·용도·마일스톤·조달 이력" },
];

function writeTableFiles(target, plan, date) {
  const tables = plan.tables;
  const write = (relativePath, content) => {
    const absolute = path.join(target, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, "utf8");
  };
  write(tables.pricing, pricingMarkdown(date));
  write(tables.contacts, contactsMarkdown(date));
  write(tables.pipeline, pipelineMarkdown(date, tables.counterpartyDir));
  if (plan.modules.includes("ir")) writeIrFiles(target, date);
  write(".soloandco/doc-mcp.config.json", `${JSON.stringify(docMcpConfig(target, plan), null, 2)}\n`);
}

// ---------- Notion ----------
// With Notion on, the folder stays the source of truth for business facts and Notion becomes the
// task board: every instructed task gets a row before work starts. With Notion off, agents are told
// not to write to Notion even when their tool happens to have it connected.

const notionWorkLogPath = "ops/notion-work-log.md";
const sessionTimeSource = path.join(sourceDirectory, "..", "scripts", "session-time.mjs");

function notionReadmeSection() {
  return `## 노션 연동

업무 진행은 노션 표에서 보고, 사업 자료와 근거는 이 폴더에 둡니다.

1. 노션에서 \`가져오기 → Markdown\`으로 \`${notionWorkLogPath}\`를 올리고, 표를 데이터베이스로 전환합니다.
2. AI 도구(클로드 등)에 노션을 연결합니다.
3. 표 주소를 \`.soloandco/config.json\`의 \`notion.workLogUrl\`에 붙여 넣습니다. 비워 두면 AI가 처음 일할 때 묻습니다.
4. 일을 하나 시켜 보고, 답 끝에 「노션 기록:」 한 줄이 붙는지 확인합니다.

`;
}

function notionAgentsSection() {
  return `## 노션 연동

- 사업 사실과 근거의 정본은 이 폴더입니다. 노션 「업무 기록」 표는 업무 진행을 보는 실행 화면입니다.
- 표 주소는 \`.soloandco/config.json\`의 \`notion.workLogUrl\`에 있습니다. 비어 있으면 운영자에게 한 번 묻고 그 자리에 적습니다.
- 운영자가 일을 시키거나 업무 이야기를 하면 **작업을 시작하기 전에** 표에 한 줄을 만듭니다. 상태 \`진행 중\`, 메모에 지시 원문, 결과 위치에 작업 파일 경로를 적습니다.
- 같은 일의 미완료 줄이 있으면 새로 만들지 않고 그 줄을 고칩니다.
- 끝나면 \`완료\`·완료일·메모 끝 \`결과:\` 한 줄로 고칩니다. 코드 도구(Claude Code·Codex)로 한 일은 \`node .soloandco/session-time.mjs --session <세션 id>\`로 잰 값을 소요 시간(시간 단위)에 적고, 그 밖에는 운영자에게 묻습니다.
- 운영자 판단을 기다리면 \`내 결정 대기\`, 상대 답을 기다리면 \`외부 대기\`. 안 할 일은 지우지 않고 \`보류\`로 둡니다.
- 기한은 운영자가 날짜를 말했을 때만 적습니다. 모르는 값은 지어내지 않고 비웁니다.
- 답 끝에 \`노션 기록: <업무> · <상태>\` 한 줄을 붙입니다. 실패하면 \`노션 기록 실패: <이유>\`로 적습니다. 일반 질문·설명은 기록하지 않고, 애매하면 기록합니다.
- 노션에 비밀번호·계좌번호·주민번호를 적지 않습니다.
`;
}

function notionOffAgentsSection() {
  return `## 노션 연동

- 이 워크스페이스는 노션을 쓰지 않습니다. AI 도구에 노션이 연결돼 있어도 노션에 기록하지 않고, 업무 기록은 이 폴더에만 남깁니다.
- 운영자가 연동을 원하면 Solo & Co OS README의 「노션 연동」 절대로 이 절과 \`.soloandco/config.json\`의 \`notion\` 값을 바꿉니다.
`;
}

function notionWorkLogMarkdown(plan, date) {
  const examplePath = `${plan.tables.counterpartyDir}/가나상사/quote-가나상사-${date}.html`;
  return `${frontmatter({ type: "notion-template", title: "노션 업무 기록 표", description: "노션으로 가져올 업무 기록 표", date })}
# 노션 업무 기록 표

노션에서 \`가져오기 → Markdown\`으로 이 파일을 올리고, 표 왼쪽 위 메뉴에서 **데이터베이스로 전환**합니다. 전환한 뒤 아래 「열 설정」대로 형식과 선택지를 맞춥니다. 예시 줄은 모양을 본 뒤 지웁니다.

| 업무 | 상태 | 영역 | 관련 대상 | 메모 | 결과 위치 | 기한 | 완료일 | 소요 시간 |
|---|---|---|---|---|---|---|---|---|
| 예시: 가나상사 견적서 만들기 | 완료 | 영업 | 가나상사 | 지시: 「가나상사 견적 만들어 줘」. 결과: 견적서 1부 작성 | \`${examplePath}\` | | ${date} | 0.5 |

## 열 설정

| 열 | 형식 | 선택지·규칙 |
|---|---|---|
| 업무 | 제목 | 동사로 끝나게. 「견적서 만들기」 |
| 상태 | 선택 | \`할 일\` / \`진행 중\` / \`내 결정 대기\` / \`외부 대기\` / \`완료\` / \`보류\` |
| 영역 | 선택 | \`영업\` / \`고객\` / \`콘텐츠\` / \`운영\` / \`실험\` |
| 관련 대상 | 텍스트 | 고객·기관·멤버 이름 |
| 메모 | 텍스트 | 지시 원문. 끝날 때 \`결과:\` 한 줄을 덧붙임 |
| 결과 위치 | 텍스트 | 이 폴더 안 파일 경로나 링크 |
| 기한 | 날짜 | 운영자가 날짜를 말했을 때만 |
| 완료일 | 날짜 | \`완료\`로 바꿀 때 |
| 소요 시간 | 숫자 | 시간 단위(1시간 30분 = 1.5) |

칸은 AI가 전부 채웁니다. 사람은 상태만 바꿉니다. 손으로 채워야 하는 칸은 비어 가므로 늘리지 않습니다.
`;
}

function writeNotionFiles(target, plan, date) {
  fs.writeFileSync(path.join(target, notionWorkLogPath), notionWorkLogMarkdown(plan, date), "utf8");
  fs.copyFileSync(sessionTimeSource, path.join(target, ".soloandco", "session-time.mjs"));
}

export function generateWorkspace(options) {
  const plan = buildPlan(options);
  const target = assertSafeTarget(plan.target);
  const date = localDate();

  fs.mkdirSync(target, { recursive: true });
  for (const entry of plan.directories) {
    fs.mkdirSync(path.join(target, entry.path), { recursive: true });
  }
  writeStarterFiles(target, plan, date);
  writeTableFiles(target, plan, date);
  // Git drops empty folders; a .gitkeep keeps the structure when the workspace is committed.
  for (const entry of plan.directories) {
    const directory = path.join(target, entry.path);
    if (fs.readdirSync(directory).length === 0) fs.writeFileSync(path.join(directory, ".gitkeep"), "", "utf8");
  }

  const configDirectory = path.join(target, ".soloandco");
  fs.mkdirSync(configDirectory, { recursive: true });
  const configuration = {
    schemaVersion: plan.schemaVersion,
    preset: plan.preset,
    name: plan.name,
    modules: plan.modules,
    generatedAt: date,
    onboarding: "blocked",
    notion: plan.notion ? { enabled: true, workLogUrl: null } : { enabled: false },
    interviewProfile: plan.profile ?? null,
  };
  fs.writeFileSync(path.join(configDirectory, "config.json"), `${JSON.stringify(configuration, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(configDirectory, "onboarding-check.mjs"), onboardingCheckScript(), "utf8");
  if (plan.notion) writeNotionFiles(target, plan, date);
  fs.writeFileSync(path.join(target, "onboarding.md"), onboardingMarkdown(plan, date), "utf8");
  fs.writeFileSync(path.join(target, "README.md"), readmeMarkdown(plan), "utf8");
  fs.writeFileSync(path.join(target, "AGENTS.md"), agentsMarkdown(plan), "utf8");
  fs.writeFileSync(path.join(target, "CLAUDE.md"), claudeMarkdown(plan), "utf8");
  return plan;
}
