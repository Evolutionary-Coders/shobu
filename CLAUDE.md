# shōbu

Browser-based PvP sniper arena FPS. TypeScript, Babylon.js, Colyseus, authoritative server.
Two developers, games fair on 19/11.

## Where things live

- `config/metrics.json` — every gameplay number, read at runtime. Physics, speed, time and
  distance come from here, never from a literal in the code.
- `docs/metrics.md` — why each key in the JSON holds its value, and the derived figures the
  level design consumes.
- `docs/pillars.md` — the scope cut criterion. Read it before proposing a feature or cutting one.
- `docs/adr/` — decisions that are expensive to reverse. Read before touching the engine,
  the transport, the physics or the asset pipeline.
- `docs/nfr.md` — the performance, network and bundle targets.
- `docs/planejamento.md` — what exists, what is missing, and what we decided not to write.
- `specs/*.feature` — domain behaviour. A behaviour without an example does not become code.

## The simulation core

Functional core, imperative shell. The core takes state, input and the tick, and returns
state. Engine, network, DOM and clock enter through the shell, as parameters.

The tick has a fixed duration (the value lives in `config/metrics.json`) and the RNG is
seeded from the server. That is what makes client prediction converge with the authority,
and it is what the deterministic replay test verifies.

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
