# kita subagents — design

**Date:** 2026-07-04
**Status:** approved, implementation in progress

## Goal

Add a set of repo-committed Claude Code subagents (`.claude/agents/*.md`) that encode
kita's specific conventions and judgment, so every teammate and every Claude session
applies them consistently.

## Principles

- **Repo-committed & shared.** Files live in `.claude/agents/`, checked into git.
- **Encode judgment, delegate mechanics.** Agents carry kita-specific knowledge and
  lean on the maintainer's installed skills (e.g. test-driven-development,
  requesting-code-review) for generic process.
- **Anti-drift.** kita's conventions already live in `CONTRIBUTING.md` and
  `docs/guide/architecture.md`. Agents **reference and read** those canonical docs
  rather than restating them, then add only the judgment specific to the agent's job.
- **Frontmatter.** Each agent declares `name`, an auto-triggering `description`,
  `tools`, and `model`.

## The seven agents

| Agent | Purpose | Tools | Model |
|---|---|---|---|
| **scout** | kita-flavored explorer, pre-loaded with the module map (models/ stores/ utils/ swr/ decorators/ devtools/, registry + reactive patterns). Reports a concise map; does not edit. | read-only (Read, Grep, Glob, read-only Bash) | sonnet |
| **pr-reviewer** | Broad pre-PR review: correctness + kita conventions + tests-exist + commit style. Runs test/typecheck/lint gates. Defers deep public-surface checks to api-guardian. | read-only + Bash | opus |
| **api-guardian** | Narrow specialist on the public contract: no `any` in public types, no `as` in tests, one-file-per-class barrels, semver impact via `pnpm check:types` (attw) + `pnpm size`. | read-only + Bash | opus |
| **test-writer** | Writes/maintains tests to kita standards: vitest patterns, `tests/helpers.ts`, MockHttpClient, no type assertions in tests, coverage expectations. Leans on the TDD skill for discipline. | Read, Edit, Write, Bash | opus |
| **pr-prep** | Assembles & opens PRs via `gh`: branch naming, conventional-commit title, one-feature-per-PR body, issue refs. Runs full gates (test/typecheck/lint/build) before opening. | Bash (gh/git/pnpm), Read | sonnet |
| **docs-writer** | On public-API change, updates VitePress docs (`docs/api`, `guide`, `cookbook`) and adds/updates a `playground/` demo — both living-doc surfaces. | Read, Edit, Write, Bash | sonnet |
| **release-manager** | Executes the documented release: semver bump, gates (test/typecheck/build/size), CHANGELOG entry, git tag, npm publish. Confirms before the actual publish — never auto-publishes. | Bash, Read, Edit | opus |

## Boundaries

- **pr-reviewer vs api-guardian** — pr-reviewer is breadth (correct? tested?
  conventional?); api-guardian is depth on the public type surface. pr-reviewer's body
  notes: for public-API-touching diffs, also run api-guardian. Separately invocable,
  composable.
- **scout vs built-in Explore** — scout is worth having because it starts pre-oriented
  to kita's architecture instead of rediscovering the layout each run.

## Out of scope

- SSR-related tooling (kita is SPA-only in 0.x).
- Any agent that duplicates a generic installed skill without adding kita-specific value.
