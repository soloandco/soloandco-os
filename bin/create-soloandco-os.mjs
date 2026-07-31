#!/usr/bin/env node

import { buildPlan, generateWorkspace, loadManifest, loadProfile } from "../src/generator.mjs";

function usage() {
  const manifest = loadManifest();
  return `Solo & Co OS workspace generator\n\nUsage:\n  create-soloandco-os --preset <name> --target <path> [--name <workspace>] [--modules a,b] [--dry-run]\n  create-soloandco-os --profile <interview-profile.json> --target <path> [--dry-run]\n  create-soloandco-os --list\n\nPresets:\n${Object.entries(manifest.presets)
    .map(([name, value]) => `  ${name.padEnd(18)} ${value.description}`)
    .join("\n")}\n\nModules:\n  ${Object.keys(manifest.modules).join(", ")}\n`;
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
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

