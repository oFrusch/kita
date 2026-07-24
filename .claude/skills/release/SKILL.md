---
name: release
description: Use when cutting and publishing a new release of @ofrusch/kita — bumping the version (patch/minor/major), rolling the changelog, running the quality gates, publishing to npm, and creating the git tag and GitHub release.
---

# Release

Cut and publish a release of `@ofrusch/kita` to npm and GitHub.

Argument is the bump: `patch`, `minor`, `major`, or an explicit version (`0.3.0`).
If none is given, infer it from the `## Unreleased` section of `CHANGELOG.md` and state
the choice before touching anything.

**Two irreversible steps — `pnpm publish` and `git push origin <tag>` — require explicit
confirmation in-session. Never run either without it.**

## 1. Preflight

Stop and report if any check fails; do not "fix it along the way".

```bash
git status --short          # must be clean
git rev-parse --abbrev-ref HEAD   # must be main
git fetch origin && git status -sb # must be up to date with origin/main
npm whoami                  # must print a user — E401 means run `npm login` first
gh auth status              # must be authenticated
```

`npm whoami` failing is the most common blocker. Surface it before running the gates,
not after.

## 2. Choose the version

Semver, per `CONTRIBUTING.md`:

| Bump  | For                                          |
| ----- | -------------------------------------------- |
| patch | bugfixes, non-breaking type improvements     |
| minor | new public API, opt-in features              |
| major | breaking changes                             |

Pre-1.0 (`0.x`), a breaking change is a **minor** bump. The `### Breaking Changes` block
under `## Unreleased` is the signal.

For public-surface changes where the bump is unclear, get **api-guardian**'s semver
verdict rather than guessing.

## 3. Bump the version everywhere

The version string is duplicated. Bump all of them:

- `package.json` → `version` — the source of truth.
- `docs/.vitepress/config.ts` → the hardcoded version label in the nav dropdown.

Then grep for stragglers before moving on:

```bash
rg -n --fixed-strings "<old-version>" -g '!pnpm-lock.yaml' -g '!CHANGELOG.md'
```

## 4. Roll the changelog

In `CHANGELOG.md`, rename the `## Unreleased` heading to `## <version> — <YYYY-MM-DD>`
and insert a fresh empty `## Unreleased` above it.

Then edit the rolled section for consumers: grouped (Breaking Changes / Added / Fixed /
Changed), written as what changed for someone using the library — not a commit dump.
Match the voice of existing entries.

If `## Unreleased` is empty, there is nothing to release. Stop and say so.

## 5. Quality gates — all green, no exceptions

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm check:types    # attw — package export map / .d.ts resolution
pnpm size           # size-limit budgets
```

Any failure stops the release. Do not publish over a red gate, and do not raise a
size-limit budget to make `pnpm size` pass as part of a release.

## 6. Commit

```bash
git add -A
git commit -m "chore | release v<version>"
git push origin main
```

Commit style is `<type> | <summary>`, imperative, ≤72 chars. No `Co-Authored-By` trailer.

## 7. Publish to npm — CONFIRM FIRST

Present the plan — version, the rolled changelog entry, gate results — and wait for an
explicit yes.

```bash
pnpm publish --access public   # prepublishOnly re-runs the build
```

Verify it landed:

```bash
npm view @ofrusch/kita version
```

## 8. Tag and GitHub release — CONFIRM FIRST

```bash
git tag -a v<version> -m "v<version>"
git push origin v<version>

gh release create v<version> \
  --title "v<version>" \
  --notes-file <notes-file>
```

Write `<notes-file>` to the scratchpad: the rolled `CHANGELOG.md` section body for this
version, without the version heading. Do not hand-write separate notes — the changelog
is the single source.

## 9. Report

State: published version, npm URL, release URL, and anything skipped or deferred.

## Red flags

| Thought                                        | Reality                                               |
| ---------------------------------------------- | ----------------------------------------------------- |
| "The tree is only dirty with unrelated stuff"  | A release ships from a clean, known state. Stop.       |
| "One test is flaky, publish anyway"            | Red gate = no publish. Fix or defer the release.       |
| "I'll write the changelog after publishing"    | The tag and release notes come from it. Roll it first. |
| "Just bump package.json"                       | The docs nav version drifts and advertises the wrong release. |
| "Confirmation was implied by 'do a release'"   | Confirm again at the publish and tag-push steps.       |
