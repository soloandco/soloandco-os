#!/usr/bin/env node

import { createInterface } from "node:readline/promises";

import { buildPlan, generateWorkspace, loadManifest, loadProfile } from "../src/generator.mjs";

const STARTS = ["notion", "folder"];

function usage() {
  const manifest = loadManifest();
  return `Solo & Co OS workspace generator\n\nUsage:\n  create-soloandco-os --preset <name> --target <path> [--name <workspace>] [--modules a,b] [--dry-run]\n  create-soloandco-os --profile <interview-profile.json> --target <path> [--dry-run]\n  create-soloandco-os --start notion|folder\n  create-soloandco-os --list\n\nStart:\n  notion             노션 템플릿으로 시작합니다. 설치가 필요 없습니다\n  folder             파일 기반 워크스페이스를 생성합니다\n\nPresets:\n${Object.entries(manifest.presets)
    .map(([name, value]) => `  ${name.padEnd(18)} ${value.description}`)
    .join("\n")}\n\nModules:\n  ${Object.keys(manifest.modules).join(", ")}\n`;
}

function notionGuide() {
  return [
    "노션 템플릿으로 시작합니다. 설치할 것이 없습니다.",
    "",
    "1. docs/notion/template.md 를 노션에서 가져오기 > Markdown 으로 올립니다.",
    "2. 표 4개를 각각 데이터베이스로 전환하고, 파일에 적힌 선택지를 넣습니다.",
    "3. 클로드나 ChatGPT에 이 노션 워크스페이스를 연결합니다.",
    "4. 「클로드 지시문」 페이지를 복사해 프로젝트 지시문에 붙입니다.",
    "5. 「오늘 시작」이라고 말합니다.",
    "",
    "온보딩 표 11칸을 채우고 상태를 active 로 바꾸기 전에는 홈페이지·콘텐츠·마케팅·영업을 시작하지 않습니다.",
    "파일 기반으로 시작하려면 --start folder 를 붙여 다시 실행합니다.",
    "",
  ].join("\n");
}

async function resolveStart(explicit, presetChosen) {
  if (explicit !== undefined) {
    if (!STARTS.includes(explicit)) throw new Error(`Unknown --start value: ${explicit}`);
    return explicit;
  }
  if (presetChosen) return "folder";
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "folder";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("노션 템플릿을 먼저 만들까요? 설치 없이 노션에서 바로 씁니다. [Y/n] ");
    const normalized = answer.trim().toLowerCase();
    return normalized === "" || normalized === "y" || normalized === "yes" ? "notion" : "folder";
  } finally {
    rl.close();
  }
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") result.dryRun = true;
    else if (argument === "--help" || argument === "-h") result.help = true;
    else if (argument === "--list") result.list = true;
    else if (argument.startsWith("--")) {
      const key = argument.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
      result[key] = value;
      index += 1;
    } else throw new Error(`Unexpected argument: ${argument}`);
  }
  return result;
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.help || arguments_.list) {
    process.stdout.write(usage());
    return;
  }

  const presetChosen = Boolean(arguments_.preset || arguments_.profile);
  const start = await resolveStart(arguments_.start, presetChosen);
  if (start === "notion") {
    process.stdout.write(notionGuide());
    return;
  }

  if (!arguments_.target || (!arguments_.preset && !arguments_.profile)) {
    process.stderr.write(usage());
    process.exitCode = 1;
    return;
  }

  const interviewProfile = arguments_.profile ? loadProfile(arguments_.profile) : undefined;
  const modules = interviewProfile?.modules ?? arguments_.modules?.split(",").filter(Boolean) ?? [];
  const options = {
    preset: interviewProfile?.preset ?? arguments_.preset,
    name: interviewProfile?.workspaceName ?? arguments_.name,
    modules,
    profile: interviewProfile,
    target: arguments_.target,
  };

  if (arguments_.dryRun) {
    process.stdout.write(`${JSON.stringify(buildPlan(options), null, 2)}\n`);
    return;
  }
  const plan = generateWorkspace(options);
  process.stdout.write(`Created ${plan.preset} workspace at ${plan.target}\n`);
  process.stdout.write("BLOCKED: complete onboarding.md before homepage, content, marketing, sales, or branding work\n");
  process.stdout.write("Then run: node .soloandco/onboarding-check.mjs\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
