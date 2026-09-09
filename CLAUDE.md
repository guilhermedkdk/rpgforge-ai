# RPGForge AI — Claude Code Project Memory

## What this project is

**RPGForge AI** is a fullstack web app that generates and manages RPG character sheets using AI.
Current scope: **D&D SRD 5.2** (CC BY 4.0 open content) as the only pack. The architecture is
**engine-first**: the engine must support multiple packs in the future without rewrites.

Users: type a prompt → answer 3–5 clarifying questions → receive a structured JSON character sheet

- original backstory → edit choices from the SRD-only library → save/export/share.

## Critical constraints — never violate

- **AI must never invent SRD items.** All choices (spells, feats, equipment, features) must
  reference `rule_item` IDs from the database.
- **Deterministic math belongs to backend domain services**, not the AI (HP, modifiers, proficiency
  bonus, saves, skills, AC).
- **No copyrighted content.** Only D&D SRD 5.2 (CC BY 4.0). Attribution is mandatory.
- **Schema-first development:** define Zod schemas in `packages/shared` first, then build around them.
- **No homebrew, no user-created packs** in this phase.
- **A provider identity is NEVER auto-linked to an account that has a password.** No e-mail
  verification exists here, so a matching address proves nothing: confirm with the password first.
  See `docs/DECISIONS.md`.
- **Multiclassing is supported** (SRD 5.2). A character carries `identity.classes[]`, each with its
  own level and subclass; `classes[0]` is the INITIAL class and its position is load-bearing (it is
  the only one granting saving throws, the full starting proficiencies, starting equipment and the
  level 1 maximum-die hit points). See "Multiclassing" below before touching anything class-scoped.

## Monorepo

```
rpgforge-ai/              # pnpm workspaces + Turborepo
  apps/
    api/                  # NestJS backend  (@rpgforce-ai/api)
    web/                  # Next.js 15 frontend (@rpgforce-ai/web)
  packages/
    shared/               # Shared TS types, Zod schemas, constants (@rpgforce-ai/shared)
  turbo.json
  pnpm-workspace.yaml
  tsconfig.base.json
  docker-compose.yml      # PostgreSQL
```

## Key commands

```bash
# Root (run from repo root)
pnpm dev                  # start all apps in parallel (turbo)
pnpm build                # build all
pnpm lint                 # lint all
pnpm format               # prettier write
pnpm type-check           # tsc --noEmit all
pnpm test                 # vitest across packages (apps/api needs Docker up: it uses a real DB)

# Database
pnpm db:up                # docker compose up -d (PostgreSQL)
pnpm db:down              # docker compose down
pnpm db:migrate           # prisma migrate dev (api)

# Run a single app
pnpm --filter @rpgforce-ai/api dev
pnpm --filter @rpgforce-ai/web dev

# Prisma (from apps/api/)
pnpm exec prisma migrate dev --name <migration_name>
pnpm exec prisma generate
pnpm exec prisma studio

# SRD ingestion (from apps/api/, or pnpm --filter @rpgforce-ai/api run <script>)
pnpm run ingest:srd               # full ingestion (all scopes, incl. languages + synthetic)
pnpm run ingest:srd:<scope>       # single scope, e.g. ingest:srd:items, ingest:srd:languages
pnpm run embed:srd                # backfill pgvector embeddings for rule_items missing one
pnpm run embed:srd -- --force     # re-embed everything (e.g. after changing the embedding text)

# Rate-limit exemption (from apps/api/): ADMIN accounts skip every limit
pnpm run user:role -- voce@exemplo.com ADMIN
pnpm run user:role -- --list          # who is ADMIN today
```

## Tech stack (summary)

- **`apps/api`** — NestJS (DDD-light: Domain -> Application -> Infrastructure -> Interfaces),
  PostgreSQL + Prisma, class-validator DTOs, Passport + JWT, **pgvector** (`RuleItem.embedding`,
  `vector(1536)`, HNSW cosine) backing `POST /rule-items/search`.
- **`apps/web`** — Next.js 15 App Router, TanStack Query, React Hook Form + Zod, Tailwind +
  shadcn/ui. Route groups: `(protected)` / `(public)` / `auth/`.
- **`packages/shared`** — Zod API contracts + **`src/domain/dnd-srd/`: the ENTIRE SRD rules engine**
  (pure, framework-free). Backend recompute and the web read-path call the IDENTICAL functions, so
  server and client cannot disagree on combat. Consumers import the barrel `@rpgforce-ai/shared`
  ONLY, never a deep path. `lib/dnd-srd/` on web is deleted, not stubbed: there is exactly ONE door
  to the domain.
- Tests: `vitest`. `packages/shared` covers the rules engine; `apps/api` runs auth INTEGRATION
  tests over supertest against a real `*_test` database it creates itself. See
  `docs/ARCHITECTURE.md`. Anything touching sessions must be proven there.

> Subfolder-by-subfolder map of `domain/dnd-srd` (math / character / derivation / features / spells /
> equipment / proficiencies / options / validation), the backend module structure, the frontend
> layout and the important-files index: **`docs/ARCHITECTURE.md`**. Read it before touching any of
> them; do not work from this summary alone.

## Prisma schema

The model reference lives in **`docs/ARCHITECTURE.md`** ("Prisma schema"). Read it before touching a
model or writing a query; keep it in step with `apps/api/prisma/schema.prisma`.

One rule survives here because it bites at a distance: **`User.password` is NULLABLE** (a
provider-only account has none), so never `bcrypt.compare` against it without a null check.

## Coding conventions (summary)

- **Early returns** over nesting. **`const` arrow functions** for components and utilities.
  Handlers prefixed `handle`. **Types always explicit** — no implicit `any`.
- **Comments: English only, always.** User-facing strings (UI copy, logs) stay in Portuguese.
  `/** */` JSDoc ONLY above an exported symbol; `//` for every internal note (stacked, never a
  `/* */` block). As short as possible — explain a non-obvious _why_, never narrate the _what_.
  **Impersonal and finished**: state the constraint, never the work that found it (no "measured on a
  real Cleric 9 draft", no "this used to be X", no comment continuing another with "..."). One or
  two lines is the norm; a three-paragraph JSDoc is a defect.
  Normalize the comments you touch to this standard rather than matching a legacy deviation.
- NestJS: thin controllers, logic in services. Next.js/React: server components by default.

> Full rules (NestJS, Next.js/React, TypeScript, the complete comment standard):
> **`docs/CONVENTIONS.md`**. Read it before writing code here.

## API endpoints

The full route index lives in **`docs/ARCHITECTURE.md`** ("API endpoints"). Read it before adding a
route or calling one you have not used this session; add new routes there, not here.

## Milestone commit conventions

Format: `type(scope): description`
Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`
Scopes: `auth`, `packs`, `ruleitems`, `characters`, `generation`, `exports`, `sharing`, `web`, `shared`, `db`, `api`

Example: `feat(ruleitems): add vector search with pgvector`

## Project memory map

| File                        | What it holds                                                                                                                                             | When to read it                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **`CLAUDE.md`** (this file) | Only what must hold in EVERY session: constraints, commands, contracts, the conventions summary.                                                          | Always — it is auto-loaded.                                                                 |
| **`docs/ARCHITECTURE.md`**  | Where code lives and why it is shaped that way. Tech stack, the Prisma models, the API endpoint index, backend modules, frontend layout, important files. | Before touching a module or model you have not read this session, or before adding a route. |
| **`docs/CONVENTIONS.md`**   | The complete style rules.                                                                                                                                 | Before writing code.                                                                        |
| **`docs/DECISIONS.md`**     | Append-only log of traps found, bugs fixed and non-obvious calls made.                                                                                    | `grep` it for the area you are about to change.                                             |
| **`docs/HISTORY.md`**       | Narrative of completed milestones.                                                                                                                        | Only when you need to know _how_ something got its current shape.                           |

These four are NOT auto-loaded. They cost nothing until read, which is the point: this file was
185 KB / ~46k tokens of every session before the split, and the rules that actually matter were
drowning in it.

## Keeping project memory updated

Project memory is stale memory unless you write to it. **The default destination is
`docs/DECISIONS.md`, not this file.**

**After fixing a bug, hitting a trap, or making a call that was not obvious**, append an entry to
`docs/DECISIONS.md` (newest first):

```md
### YYYY-MM-DD - short title

**Trap:** what bit us, or what was non-obvious.
**Rule:** what to do instead, written as an instruction to your future self.
**Where:** `path/to/file.ts`
```

Write it while the reasoning is fresh — at the end of the task that produced it, not "later".
An entry that only says what changed is worthless; it must say what a future session would
otherwise get wrong.

**Promote something into this file ONLY when both hold:**

1. it would change a decision in an unrelated future session, and
2. it fits in three lines or fewer.

If it does not fit in three lines, it stays in `docs/DECISIONS.md` and this file gets a one-line
pointer at most. Never restate here what a doc already says — link to it by path.

**Where the other updates go:**

- module/endpoint/model added or moved -> `docs/ARCHITECTURE.md` (its module map AND its API endpoint index)
- milestone completed or rescoped -> `docs/HISTORY.md`
- a style rule changed -> `docs/CONVENTIONS.md`

**This file has a budget: ~12 KB.** If an edit pushes it past that, something in it belongs in a
doc instead. Check with `wc -c CLAUDE.md` when you edit it.

Before considering any task done: `pnpm lint`, `pnpm type-check` and `pnpm test`.
