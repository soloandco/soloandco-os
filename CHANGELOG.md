# Changelog

All notable changes are documented here. This project follows Semantic Versioning.

## [Unreleased]

### Added

- `brand` module: generates `brand/brand-guidelines.md` for people and a matching agent skill for AI tools
- interview profile field `brand` with colors, text-safe color variants, fonts, tone, and an avoid list
- interview prompt extracts brand colors and fonts from user materials instead of asking for them
- generated brand skill disables itself and asks the user when no brand values were captured

### Changed

- interview profile `schemaVersion` moves to `0.2.0`; `0.1.0` profiles still load and generate unchanged
- interview prompt now reads user-provided materials (website, intro documents) first, extracts answers with sources, and asks only unanswered questions
- interview prompt guides the first real record within ten minutes after generation
- documented contribution scope and single-maintainer support expectations in README and CONTRIBUTING

## [0.1.0] - 2026-07-31

### Added

- management-agency, solo-founder, and freelancer presets
- optional automation, content, ventures, and website modules
- deterministic cross-platform workspace generator
- interview-profile JSON Schema and example
- Claude Fable 5 interview prompt
- dry-run, broad-path refusal, and non-empty target protection
- starter scorecard, decision log, and management member template
- open-source governance and security documentation

