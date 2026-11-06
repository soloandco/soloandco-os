import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { buildPlan, generateWorkspace, loadProfile, localDate } from "../src/generator.mjs";

test("management preset contains member management structure", () => {
  const plan = buildPlan({ preset: "management-agency", target: "generated-test" });
  const paths = new Set(plan.directories.map((entry) => entry.path));
  assert(paths.has("members"));
  assert(paths.has("services"));
  assert(paths.has("sales"));
  assert(paths.has("finance"));
  assert(!paths.has("ops/marketing"));
  assert(!paths.has("services/management"));
});

test("community and lecture modules add their folders", () => {
  const plan = buildPlan({
    preset: "solo-founder",
    modules: ["community", "lecture"],
    target: "generated-test",
  });
  const paths = plan.directories.map((entry) => entry.path);
  assert(paths.includes("community"));
  assert(paths.includes("lecture"));
});

test("optional modules are added without duplicate folders", () => {
  const plan = buildPlan({
    preset: "solo-founder",
    modules: ["automation", "ventures", "content"],
    target: "generated-test",
  });
  const paths = plan.directories.map((entry) => entry.path);
  assert(paths.includes("ops/automation"));
  assert.equal(paths.filter((entry) => entry === "content").length, 1);
});

test("interview profile validates and drives generation", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-profile-test-"));
  const profilePath = path.join(temporaryRoot, "profile.json");
  try {
    fs.writeFileSync(
      profilePath,
      JSON.stringify({
        schemaVersion: "0.1.0",
        workspaceName: "Sample Studio",
        preset: "solo-founder",
        modules: ["automation"],
      }),
    );
    const profile = loadProfile(profilePath);
    assert.equal(profile.preset, "solo-founder");
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("brand module adds the brand folder", () => {
  const plan = buildPlan({ preset: "freelancer", modules: ["brand"], target: "generated-test" });
  const paths = plan.directories.map((entry) => entry.path);
  assert(paths.includes("brand"));
});

test("profiles from the previous schema version still load", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-migration-test-"));
  const profilePath = path.join(temporaryRoot, "profile.json");
  try {
    fs.writeFileSync(
      profilePath,
      JSON.stringify({
        schemaVersion: "0.2.0",
        workspaceName: "Sample Studio",
        preset: "solo-founder",
        modules: ["brand"],
        brand: {
          colors: [{ name: "주요", hex: "#1A2B3C", usage: "강조", textHex: "#1A2B3C" }],
          fonts: { heading: "Test Sans", body: "Test Sans" },
        },
      }),
    );
    assert.equal(loadProfile(profilePath).schemaVersion, "0.2.0");
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("malformed brand colors are rejected", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-brand-invalid-test-"));
  const profilePath = path.join(temporaryRoot, "profile.json");
  try {
    fs.writeFileSync(
      profilePath,
      JSON.stringify({
        schemaVersion: "0.2.0",
        workspaceName: "Sample Studio",
        preset: "solo-founder",
        modules: ["brand"],
        brand: { colors: [{ name: "주요", hex: "blue" }] },
      }),
    );
    assert.throws(() => loadProfile(profilePath), /brand\.colors\[0\]\.hex/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("brand module writes guidelines and an agent skill carrying the profile values", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-brand-test-"));
  const target = path.join(temporaryRoot, "workspace");
  try {
    generateWorkspace({
      preset: "solo-founder",
      target,
      name: "Sample Studio",
      modules: ["brand"],
      profile: {
        schemaVersion: "0.2.0",
        workspaceName: "Sample Studio",
        preset: "solo-founder",
        modules: ["brand"],
        brand: {
          colors: [
            { name: "주요", hex: "#1A2B3C", usage: "강조와 링크" },
            { name: "보조", hex: "#4D8F5A", usage: "면과 막대", textHex: "#2C6438" },
          ],
          fonts: { heading: "Test Sans", body: "Test Sans", mono: "Test Mono" },
          tone: "담백하고 과장하지 않는다",
          avoid: ["경쟁사 색 재사용"],
        },
      },
    });

    const guidelines = fs.readFileSync(path.join(target, "brand", "brand-guidelines.md"), "utf8");
    assert(guidelines.includes("#1A2B3C"));
    assert(guidelines.includes("Test Sans"));
    // the skill file is the single source of truth for brand values
    assert(guidelines.includes(".claude/skills/sample-studio-brand/SKILL.md"));

    // CLAUDE.md must exist as a pointer to AGENTS.md (Claude Code auto-loads CLAUDE.md only)
    const claudePointer = fs.readFileSync(path.join(target, "CLAUDE.md"), "utf8");
    assert(claudePointer.includes("AGENTS.md"));

    const skillPath = path.join(target, ".claude", "skills", "sample-studio-brand", "SKILL.md");
    const skill = fs.readFileSync(skillPath, "utf8");
    assert(skill.includes("name: sample-studio-brand"));
    assert(skill.includes("#1A2B3C"));
    assert(skill.includes("#2C6438"));
    assert(skill.includes("경쟁사 색 재사용"));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("brand files stay blank and self-disabling when the profile has no brand values", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-brand-empty-test-"));
  const target = path.join(temporaryRoot, "workspace");
  try {
    generateWorkspace({ preset: "freelancer", target, name: "Blank Co", modules: ["brand"] });
    const skill = fs.readFileSync(path.join(target, ".claude", "skills", "blank-co-brand", "SKILL.md"), "utf8");
    assert(skill.includes("아직 채워지지 않았다"));
    assert(!skill.includes("#1A2B3C"));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("generator creates starter files and refuses overwrite", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-os-test-"));
  const target = path.join(temporaryRoot, "workspace");
  try {
    generateWorkspace({ preset: "management-agency", target, name: "Test Agency", modules: [] });
    assert(fs.existsSync(path.join(target, ".soloandco", "config.json")));
    assert(fs.existsSync(path.join(target, ".soloandco", "onboarding-check.mjs")));
    assert(fs.existsSync(path.join(target, "onboarding.md")));
    assert(fs.existsSync(path.join(target, "members", "_templates", "member-overview.md")));
    assert(fs.existsSync(path.join(target, "ops", "scorecard.md")));
    assert.match(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), /필수 온보딩 관문/);
    assert.doesNotMatch(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), /Claude와 Codex에 동일하게 적용/);
    assert.match(fs.readFileSync(path.join(target, "AGENTS.md"), "utf8"), /\.claude\/skills/);
    assert.match(fs.readFileSync(path.join(target, "CLAUDE.md"), "utf8"), /AGENTS\.md/);
    assert.match(fs.readFileSync(path.join(target, "README.md"), "utf8"), /`sales\/` \| [^|]+ \| 온보딩 후 \|/);
    assert(!fs.existsSync(path.join(target, "sales", "index.md")));
    assert.throws(
      () => generateWorkspace({ preset: "management-agency", target, name: "Again", modules: [] }),
      /Target must be empty or absent/,
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("generated workspace blocks downstream work until required onboarding is complete", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-onboarding-test-"));
  const target = path.join(temporaryRoot, "workspace");
  try {
    generateWorkspace({ preset: "solo-founder", target, name: "Test Founder", modules: ["content"] });
    const checker = path.join(target, ".soloandco", "onboarding-check.mjs");

    const blocked = spawnSync(process.execPath, [checker], { cwd: target, encoding: "utf8" });
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /BLOCKED: required onboarding is incomplete/);
    assert.match(blocked.stderr, /missing: primary_customer/);

    const onboardingPath = path.join(target, "onboarding.md");
    let onboarding = fs.readFileSync(onboardingPath, "utf8");
    const fill = (values) => {
      for (const [field, value] of Object.entries(values)) {
        onboarding = onboarding.replace(new RegExp(`^${field}:.*$`, "m"), `${field}: ${JSON.stringify(value)}`);
      }
      fs.writeFileSync(onboardingPath, onboarding, "utf8");
    };

    // Only four fields are required; the rest may stay empty and fill in over time.
    fill({
      status: "active",
      primary_customer: "반복 업무가 막힌 1인 사업자",
      offer: "업무 자동화 구축 서비스",
      excluded_customer: "직접 구축 방법만 배우려는 사람",
    });
    const stillBlocked = spawnSync(process.execPath, [checker], { cwd: target, encoding: "utf8" });
    assert.equal(stillBlocked.status, 1);
    assert.match(stillBlocked.stderr, /missing: strengths/);
    assert.doesNotMatch(stillBlocked.stderr, /missing: (purchase_trigger|evidence)/);

    fill({ strengths: "반복 업무를 자동화해 실제로 시간을 줄여 준 일" });

    const completed = spawnSync(process.execPath, [checker], { cwd: target, encoding: "utf8" });
    assert.equal(completed.status, 0);
    assert.match(completed.stdout, /OK: onboarding complete/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

const cliPath = path.join(import.meta.dirname, "..", "bin", "create-soloandco-os.mjs");

test("--start notion prints the Notion template guide and creates nothing", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-notion-"));
  fs.rmSync(target, { recursive: true, force: true });
  const result = spawnSync(process.execPath, [cliPath, "--start", "notion"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /docs\/notion\/template\.md/);
  assert.match(result.stdout, /--start folder/);
  // The template requires four onboarding fields, so the guide must not ask for all eleven.
  assert.match(result.stdout, /필수 4칸/);
  assert.doesNotMatch(result.stdout, /11칸/);
  assert.equal(fs.existsSync(target), false);
});

test("--start rejects unknown values", () => {
  const result = spawnSync(process.execPath, [cliPath, "--start", "bogus"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown --start value/);
});

test("a preset run is never interrupted by the Notion question", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-folder-"));
  fs.rmSync(target, { recursive: true, force: true });
  const result = spawnSync(
    process.execPath,
    [cliPath, "--preset", "solo-founder", "--target", target, "--name", "Test"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /노션 템플릿을 먼저 만들까요/);
  assert(fs.existsSync(path.join(target, "onboarding.md")));
  fs.rmSync(target, { recursive: true, force: true });
});

test("the shipped Notion template carries every table and page", () => {
  const template = fs.readFileSync(
    path.join(import.meta.dirname, "..", "docs", "notion", "template.md"),
    "utf8",
  );
  assert.equal((template.match(/^## 표 /gm) ?? []).length, 4);
  assert.equal((template.match(/^## 페이지 /gm) ?? []).length, 4);
  assert.match(template, /온보딩/);
  assert.match(template, /오늘 기록/);
});

test("ventures module reuses experiments instead of adding a second experiment folder", () => {
  const plan = buildPlan({ preset: "solo-founder", modules: ["ventures"], target: "generated-test" });
  const paths = plan.directories.map((entry) => entry.path);
  assert.equal(paths.filter((entry) => entry === "experiments").length, 1);
  assert(!paths.includes("ventures"));
  const freelancer = buildPlan({ preset: "freelancer", modules: ["ventures"], target: "generated-test" });
  assert(freelancer.directories.some((entry) => entry.path === "experiments"));
});

test("localDate uses the local calendar day, not UTC", () => {
  // 00:30 local time is still the previous day in UTC for any zone east of Greenwich.
  assert.equal(localDate(new Date(2026, 10, 7, 0, 30)), "2026-11-07");
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

for (const [preset, pricing, contacts, pipeline, counterpartyDir] of [
  ["solo-founder", "offers/pricing.md", "business/contacts.md", "customers/pipeline.md", "customers"],
  ["freelancer", "services/pricing.md", "ops/contacts.md", "sales/pipeline.md", "clients"],
  ["management-agency", "services/pricing.md", "ops/contacts.md", "sales/pipeline.md", "sales"],
]) {
  test(`${preset} workspace ships record tables and a doc-mcp config that point at them`, async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-tables-test-"));
    const target = path.join(temporaryRoot, "workspace");
    try {
      generateWorkspace({ preset, target, name: "Table Co", modules: [] });
      const configPath = path.join(target, ".soloandco", "doc-mcp.config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      assert.equal(config.pricing.path, pricing);
      assert.equal(config.contacts.path, contacts);
      assert.equal(config.counterparties.path, pipeline);
      assert.equal(config.counterparties.dir, counterpartyDir);
      assert.equal(config.issuer.display_name, "Table Co");

      // the doc-mcp loader and table reader accept the generated files as they are
      const { loadConfig } = await import("../packages/doc-mcp/src/config.mjs");
      const { readPricing, readIssuer, readCounterparty } = await import("../packages/doc-mcp/src/workspace.mjs");
      const loaded = loadConfig(configPath);
      assert.deepEqual(readPricing(loaded), []);
      assert.throws(() => readIssuer(loaded), /「담당」 값이 없다/);
      assert.throws(() => readCounterparty(loaded, "없는 고객"), /상대를 찾지 못했다/);

      // no per-folder index stubs; empty folders keep a .gitkeep instead
      assert(!fs.existsSync(path.join(target, "knowledge", "index.md")));
      assert(fs.existsSync(path.join(target, "knowledge", "_inbox", ".gitkeep")));
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
}

test("ir module writes four record tables, lists them in README, and is gated", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soloandco-ir-test-"));
  const target = path.join(temporaryRoot, "workspace");
  try {
    generateWorkspace({ preset: "solo-founder", target, name: "IR Co", modules: ["ir"] });
    for (const file of ["metrics.md", "market.md", "story.md", "funding.md"]) {
      assert(fs.existsSync(path.join(target, "ir", file)), file);
    }
    assert(fs.existsSync(path.join(target, "ir", "decks", ".gitkeep")));
    const metrics = fs.readFileSync(path.join(target, "ir", "metrics.md"), "utf8");
    assert.match(metrics, /\| 지표 \| 값 \| 단위 \| 기준일 \| 출처 \| 비고 \|/);
    assert.doesNotMatch(metrics, /\| 0 \|/);
    const readme = fs.readFileSync(path.join(target, "README.md"), "utf8");
    assert.match(readme, /`ir\/metrics\.md`/);
    assert.match(readme, /`ir\/` \| [^|]+ \| 온보딩 후 \|/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
