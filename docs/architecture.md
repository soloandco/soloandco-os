# Architecture

> Public summary. The detailed working documents live in the maintainer private workspace; this file tracks only what is public.

## Pipeline

```text
human interview
  → model or manual summarization
  → interview-profile.json
  → schema and semantic validation
  → deterministic plan
  → user approval / dry run
  → workspace generation
  → lint and review cadence
```

The model does not decide arbitrary paths or mutate the destination directly. It produces a provider-neutral profile. The generator owns the canonical mapping from profile to folders.

## Product boundaries

1. Private operational workspaces contain real data.
2. This public repository contains only schemas, empty templates, fictional examples, and deterministic tooling.
3. Generated workspaces belong to users and are not linked back or uploaded automatically.

## Brand as machine-readable output

The `brand` module writes the same values twice: `brand/brand-guidelines.md` for people and `.claude/skills/<slug>-brand/SKILL.md` for AI coding tools. The guidelines file is canonical; the skill is a derived copy that assistants load automatically.

Duplication is deliberate. A brand guide that only humans can read has to be re-explained to an assistant on every document. Writing it in the assistant's own format removes that step.

When no brand values were captured, both files are still generated but the skill instructs the assistant to stop and ask rather than to invent a palette. An empty brand file must never become a license to guess.

## Versioning

- Package version follows Semantic Versioning.
- Generated configuration records `schemaVersion` separately.
- The generator accepts every profile version it has ever published. `0.1.0` profiles still load after the `0.2.0` bump and simply generate no brand files.
- A future `migrations/` directory will update generated workspaces between schema versions.
- Template updates must never silently delete or overwrite user documents.

## Why presets instead of arbitrary folder names?

Automation, documentation links, and migrations require stable machine-facing paths. Users customize by choosing a preset and optional modules. Display labels can be localized later without changing canonical paths.

