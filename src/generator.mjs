import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(sourceDirectory, "workspace-presets.json");

export function loadManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function loadProfile(profilePath) {
  const profile = JSON.parse(fs.readFileSync(path.resolve(profilePath), "utf8"));
  const manifest = loadManifest();
  const errors = [];

  if (profile.schemaVersion !== manifest.schemaVersion) {
    errors.push(`schemaVersion must be ${manifest.schemaVersion}`);
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
  if (errors.length) throw new Error(`Invalid interview profile:\n- ${errors.join("\n- ")}`);
  return profile;
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
  return `# ${plan.name}\n\n이 워크스페이스는 Solo & Co OS \`${plan.preset}\` 프리셋으로 생성되었습니다.\n\n## 운영 규칙\n\n- 폴더 색인은 \`index.md\`를 사용합니다.\n- 프로젝트 폴더는 \`YYYY-MM-<slug>/\` 형식을 권장합니다.\n- 실제 수치가 없으면 \`unknown\`으로 기록합니다.\n- 활성 업무에는 담당자, 다음 행동, 재검토일을 기록합니다.\n- 고객·계약·정산 등 민감 정보는 공개 저장소에 올리지 않습니다.\n- 한 사실에는 하나의 정본만 두고 다른 문서에서는 링크합니다.\n`;
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
  return plan;
}
