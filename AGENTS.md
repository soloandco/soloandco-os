# Solo & Co OS

This repository is the public, data-free Solo & Co OS product. Never add real member, customer, contract, settlement, banking, credential, or private meeting data.

## Rules

- Keep the generator deterministic: the same profile and version must produce the same structure except for the generation date.
- Do not let a model write directly into a user workspace without a validated profile and user-approved plan.
- Preserve cross-platform path behavior on Windows, macOS, and Linux.
- Refuse broad or non-empty generation targets.
- Add or update tests for every preset, module, schema, and migration change.
- Examples must be fictional and contain no copied production data.
- Use English kebab-case for machine-facing paths. User-facing Markdown may be Korean or English.

