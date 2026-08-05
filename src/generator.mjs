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

export function buildPlan({ preset, name = "My Business OS", target = ".", modules = [], profile }) {
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
    target: path.resolve(target),
    directories,
  };
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

function indexMarkdown(entry, date) {
  return `${frontmatter({ type: "Index", title: entry.title, description: entry.description, date })}\n# ${entry.title}\n\n${entry.description}\n`;
}

function readmeMarkdown(plan) {
  const rows = plan.directories.map((entry) => `| \`${entry.path}/\` | ${entry.description} |`).join("\n");
  return `# ${plan.name}\n\nSolo & Co OS의 \`${plan.preset}\` 프리셋으로 생성된 파일 기반 Business OS입니다.\n\n## 구조\n\n| 폴더 | 역할 |\n|---|---|\n${rows}\n\n## 첫 10분\n\n1. 각 폴더의 \`index.md\`를 읽습니다.\n2. 현재 진행 중인 고객·멤버·프로젝트 하나만 먼저 기록합니다.\n3. 모든 활성 문서에 담당자·다음 행동·재검토일을 둡니다.\n4. 실제 숫자가 없으면 0으로 추정하지 않고 \`unknown\`으로 기록합니다.\n5. 비밀번호·복구 코드·불필요한 개인정보는 저장하지 않습니다.\n\n생성 설정은 \`.soloandco/config.json\`에 있습니다.\n`;
}

function agentsMarkdown(plan) {
  return `# ${plan.name}\n\n이 워크스페이스는 Solo & Co OS \`${plan.preset}\` 프리셋으로 생성되었습니다.\n\n> 이 파일이 워크스페이스 규칙의 정본입니다. \`CLAUDE.md\`는 이 파일을 가리키는 포인터이므로 규칙 변경은 여기에만 반영합니다.\n\n## 운영 규칙\n\n- 폴더 색인은 \`index.md\`를 사용합니다.\n- 프로젝트 폴더는 \`YYYY-MM-<slug>/\` 형식을 권장합니다.\n- 실제 수치가 없으면 \`unknown\`으로 기록합니다.\n- 활성 업무에는 담당자, 다음 행동, 재검토일을 기록합니다.\n- 고객·계약·정산 등 민감 정보는 공개 저장소에 올리지 않습니다.\n- 한 사실에는 하나의 정본만 두고 다른 문서에서는 링크합니다.\n`;
}

// Claude Code auto-loads CLAUDE.md (not AGENTS.md), so ship a pointer file.
// Keeping the rules in ONE file avoids the two-copy drift this project's own
// workspace hit before consolidating (2026-08-05).
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

export function generateWorkspace(options) {
  const plan = buildPlan(options);
  const target = assertSafeTarget(plan.target);
  const date = new Date().toISOString().slice(0, 10);

  fs.mkdirSync(target, { recursive: true });
  for (const entry of plan.directories) {
    const directory = path.join(target, entry.path);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "index.md"), indexMarkdown(entry, date), "utf8");
  }
  writeStarterFiles(target, plan, date);

  const configDirectory = path.join(target, ".soloandco");
  fs.mkdirSync(configDirectory, { recursive: true });
  const configuration = {
    schemaVersion: plan.schemaVersion,
    preset: plan.preset,
    name: plan.name,
    modules: plan.modules,
    generatedAt: date,
    interviewProfile: plan.profile ?? null,
  };
  fs.writeFileSync(path.join(configDirectory, "config.json"), `${JSON.stringify(configuration, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(target, "README.md"), readmeMarkdown(plan), "utf8");
  fs.writeFileSync(path.join(target, "AGENTS.md"), agentsMarkdown(plan), "utf8");
  fs.writeFileSync(path.join(target, "CLAUDE.md"), claudeMarkdown(plan), "utf8");
  return plan;
}
