# shōbu

Browser-based PvP sniper arena FPS. TypeScript, Babylon.js, Colyseus, authoritative server.
Two developers, games fair on 19/11.

## What the tools enforce, and this file no longer repeats

`npm run verify` is the standard: lint, types, tests, coverage. Git hooks run it (`pre-commit`
on the index, `pre-push` on everything, `commit-msg` on the message), and CI runs the same
command. Function size, file size, `any`, formatting, test coverage, commit format, PR target
and tool credit are all checked there — read the error, not this file.

**A rule a tool can check does not get written here.** It goes in the tool and stays out of
this file, so there is only one copy of every limit. See
[ADR 0007](docs/adr/0007-regra-verificavel-mora-na-ferramenta.md). What follows is only what
no tool can verify.

## Code style

- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`.
  Prefer names that return <5 grep hits in the codebase.
- No code duplication. Extract shared logic into a function/module.
- Early returns over nested ifs. Max 2 levels of indentation. The complexity ceiling in
  `biome.json` only approximates this one — it still accepts three levels.
- Exception messages must include the offending value and expected shape.

## Comments

- Keep your own comments. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

## Tests

- Vitest, headless, no browser — see [ADR 0001](docs/adr/0001-engine-e-renderer.md). The I/O
  adapters that decision leaves unverified are listed in `vitest.config.ts`; everything else
  is at 100% and has to stay there. Adding a file to that list means turning it into an
  adapter, and a test audits the list — it is not a way to skip a test.
- Bug fixes get a regression test.
- Mock external I/O (API, DB, filesystem) with named fake classes,
  not inline stubs.
- Tests must be F.I.R.S.T: fast, independent, repeatable,
  self-validating, timely. Test order is shuffled, so order dependence fails on its own.

## Dependencies

- Inject dependencies through constructor/parameter, not global/import.
- Wrap third-party libs behind a thin interface owned by this project.
  `@shobu/core` importing an engine or a network framework is a test failure, not a review note.

## Structure

- Predictable paths: `packages/core` is the engine-agnostic domain, `packages/client` the
  browser side, adapters at the edge.

## Logging

- Structured JSON when logging for debugging / observability.
- Plain text only for user-facing CLI output.

## Branch flow

PRs target `dev`. `main` only takes merges from `dev`, and `main` is what runs at the fair.

## Git Conventions

Planning and specification documents live in `plans/`, which is gitignored — never commit one
from anywhere else. ADRs are decisions, not plans: those belong in `docs/adr/`.

Commit format is `type: description`; the `commit-msg` hook is the specification, and its
error message spells out the types.

**Atomic, frequent commits.** One logical change per commit — if the message needs "and",
split it. Refactor, feature, and fix go in separate commits even when touching the same
file. When a change needs config plus cleanup, land the cleanup first so every commit is
green on its own.

**Never take credit, in any artifact.** An agent is a tool the human uses; the human is the
author. The hook and CI reject it in commit messages and PR bodies; the rule is broader than
what they can see — never list a model or tool as author, reviewer, decider or owner in an
ADR, a docstring or a changelog either. If a template field expects an author, leave it for
the human.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Evolutionary-Coders/shobu`, via `gh`.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels, unrenamed. See `docs/agents/triage-labels.md`.

### Domain docs

Single context: `CONTEXT.md` at the root and `docs/adr/`. See `docs/agents/domain.md`.
