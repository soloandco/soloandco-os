# Architecture

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

## Versioning

- Package version follows Semantic Versioning.
- Generated configuration records `schemaVersion` separately.
- A future `migrations/` directory will update generated workspaces between schema versions.
- Template updates must never silently delete or overwrite user documents.

## Why presets instead of arbitrary folder names?

Automation, documentation links, and migrations require stable machine-facing paths. Users customize by choosing a preset and optional modules. Display labels can be localized later without changing canonical paths.

