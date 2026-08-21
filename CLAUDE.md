# shōbu

Browser-based PvP sniper arena FPS. TypeScript, Babylon.js, Colyseus, authoritative server.
Two developers, games fair on 19/11.

## Where things live

- `docs/simulation-model.md` — what the player controller implements, without the numbers: the
  three rates, the semantics of every mechanic, and the formulas the level design consumes. Read
  it before writing controller or hit-resolution code.
- Gameplay numbers — physics, speed, time, distance, scoring — do not exist yet, and none of
  them is ever a literal in the code. They live in a runtime-read config file that is born with
  the first code that reads it, and their values are chosen against a running prototype, per
  [ADR 0005](docs/adr/0005-fonte-de-verdade-das-metricas.md).
- `docs/pillars.md` — the scope cut criterion. Read it before proposing a feature or cutting one.
- `docs/adr/` — decisions that are expensive to reverse. Read before touching the engine,
  the transport, the physics or the asset pipeline.
- `docs/nfr.md` — the performance, network and bundle targets.
- `docs/planejamento.md` — what exists, what is missing, and what we decided not to write.
- `specs/*.feature` — domain behaviour. A behaviour without an example does not become code.

## The simulation core

Functional core, imperative shell. The core takes state, input and the tick, and returns
state. Engine, network, DOM and clock enter through the shell, as parameters.

The tick has a fixed duration (60 Hz, per [ADR 0002](docs/adr/0002-transporte-de-rede.md)) and the RNG is
seeded from the server. That is what makes client prediction converge with the authority,
and it is what the deterministic replay test verifies.

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
