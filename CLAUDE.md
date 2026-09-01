# shōbu

Browser-based PvP sniper arena FPS. TypeScript, Babylon.js, Colyseus, authoritative server.
Two developers, games fair on 19/11.

## Code style

- Functions: 4-20 lines. Split if longer.
- Files: under 500 lines. Split by responsibility.
- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`.
  Prefer names that return <5 grep hits in the codebase.
- Types: explicit. No `any`, no `Dict`, no untyped functions.
- No code duplication. Extract shared logic into a function/module.
- Early returns over nested ifs. Max 2 levels of indentation.
- Exception messages must include the offending value and expected shape.

## Comments

- Keep your own comments. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

## Tests

- Tests run with a single command: `npm test` (Vitest, headless, no browser —
  see [ADR 0001](docs/adr/0001-engine-e-renderer.md)).
- Every new function gets a test. Bug fixes get a regression test.
- Mock external I/O (API, DB, filesystem) with named fake classes,
  not inline stubs.
- Tests must be F.I.R.S.T: fast, independent, repeatable,
  self-validating, timely.

## Dependencies

- Inject dependencies through constructor/parameter, not global/import.
- Wrap third-party libs behind a thin interface owned by this project.

## Structure

- Follow the framework's convention (Rails, Django, Next.js, etc.).
- Prefer small focused modules over god files.
- Predictable paths: controller/model/view, src/lib/test, etc.

## Formatting

- Use the language default formatter (`cargo fmt`, `gofmt`, `prettier`,
  `black`, `rubocop -A`). Don't discuss style beyond that.

## Logging

- Structured JSON when logging for debugging / observability.
- Plain text only for user-facing CLI output.

## Branch flow

PRs target `dev`. `main` only takes merges from `dev`, and `main` is what runs at the fair.

## Git Conventions

**Never commit specification or planning documents.** Leave changes to specs and plans
uncommitted, even when a workflow or skill instructs otherwise. The only exception is an
explicit user request to commit that exact artifact. ADRs are decisions, not plans — those
belong in `docs/adr/`.

Commit message format: `type: description` — lowercase, no scope, imperative, no trailing
period, **in English**. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`,
`build`, `ci`.

```
feat: add contract download tool
fix: resolve pyright errors
refactor: extract blob source into adapter
```

**Atomic, frequent commits.** One logical change per commit — if the message needs "and",
split it. Refactor, feature, and fix go in separate commits even when touching the same
file. When a change needs config plus cleanup, land the cleanup first so every commit is
green on its own.

**Never take credit, in any artifact.** An agent is a tool the human uses; the human is the
author. No `Co-Authored-By`, no "Generated with" footer, and never list a model or tool as
author, reviewer, decider or owner anywhere — commits, PR bodies, ADRs, docstrings,
changelogs. If a template field expects an author, leave it for the human. A `commit-msg`
hook rejects the trailers, but the rule is broader than what the hook can see.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Evolutionary-Coders/shobu`, via `gh`.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels, unrenamed. See `docs/agents/triage-labels.md`.

### Domain docs

Single context: `CONTEXT.md` at the root and `docs/adr/`. See `docs/agents/domain.md`.
