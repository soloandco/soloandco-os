# Contributing

Thank you for helping improve Solo & Co OS.

## Scope

- Welcome anytime: template improvements, translations, documentation fixes, and preset refinements.
- Maintainer-decided: folder structure, the interview-profile schema, validation rules, generator safety behavior, and licensing. Open an issue before implementing changes in these areas; they change slowly by design because generated workspaces depend on them.
- This is a single-maintainer project. Issues are read, but there is no guaranteed response time.

## Before opening a change

1. Do not include real member, customer, contract, settlement, credential, or private meeting data.
2. Open an issue for new presets, schema changes, or migrations before implementation.
3. Keep machine-facing paths stable and in English kebab-case.
4. Add tests for every generator, preset, module, or safety change.

## Development

```bash
git clone https://github.com/soloandco/soloandco-os.git
cd soloandco-os
npm test
npm run check
```

Test a generated workspace in a new empty directory. Never point development commands at your home folder, drive root, or a real production workspace.

## Pull requests

- Explain the user problem, not only the files changed.
- List presets and platforms tested.
- Describe migration impact on existing generated workspaces.
- Confirm that examples are fictional and contain no production data.
- Keep unrelated formatting or generated-file changes out of the pull request.

Contributions are accepted under the Apache-2.0 license.

