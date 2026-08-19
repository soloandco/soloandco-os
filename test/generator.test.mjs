import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { buildPlan, generateWorkspace, loadProfile } from "../src/generator.mjs";

test("management preset contains member management structure", () => {
  const plan = buildPlan({ preset: "management-agency", target: "generated-test" });
  const paths = new Set(plan.directories.map((entry) => entry.path));
  assert(paths.has("members"));
  assert(paths.has("services/management"));
  assert(paths.has("services/sales"));
  assert(paths.has("ops/marketing"));
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
        workspaceName: "Evan Studio",
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
        workspaceName: "Evan Studio",
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
        workspaceName: "Evan Studio",
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
      name: "Evan Studio",
      modules: ["brand"],
      profile: {
        schemaVersion: "0.2.0",
        workspaceName: "Evan Studio",
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
    assert(guidelines.includes(".claude/skills/evan-studio-brand/SKILL.md"));

    // CLAUDE.md must exist as a pointer to AGENTS.md (Claude Code auto-loads CLAUDE.md only)
    const claudePointer = fs.readFileSync(path.join(target, "CLAUDE.md"), "utf8");
    assert(claudePointer.includes("AGENTS.md"));

    const skillPath = path.join(target, ".claude", "skills", "evan-studio-brand", "SKILL.md");
    const skill = fs.readFileSync(skillPath, "utf8");
    assert(skill.includes("name: evan-studio-brand"));
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
    assert.match(fs.readFileSync(path.join(target, "CLAUDE.md"), "utf8"), /AGENTS\.md/);
    assert.match(fs.readFileSync(path.join(target, "services", "content", "index.md"), "utf8"), /온보딩 관문/);
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
    const values = {
      status: "active",
      primary_customer: "반복 업무가 막힌 1인 사업자",
      offer: "업무 자동화 구축 서비스",
      purchase_trigger: "수작업 때문에 고객 대응이 늦어질 때",
      first_question: "우리 업무도 자동화할 수 있나요",
      objection: "도입 뒤 직접 관리하기 어려울까 걱정한다",
      decision_criteria: "작동 데모와 유지 방법을 확인한다",
      desired_change: "반복 업무가 자동으로 처리되는 상태",
      excluded_customer: "직접 구축 방법만 배우려는 사람",
      evidence: "현재 공개 사례 없음",
    };
    for (const [field, value] of Object.entries(values)) {
      onboarding = onboarding.replace(new RegExp(`^${field}:.*$`, "m"), `${field}: ${JSON.stringify(value)}`);
    }
    fs.writeFileSync(onboardingPath, onboarding, "utf8");

    const completed = spawnSync(process.execPath, [checker], { cwd: target, encoding: "utf8" });
    assert.equal(completed.status, 0);
    assert.match(completed.stdout, /OK: onboarding complete/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
