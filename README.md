# remote-skills

A remote-only jobs platform with a skills performance ledger. See `CLAUDE.md` for the rules and `TICKETS.md` for the build plan.

## Run it locally

Needs Node.js 20+ and PostgreSQL 14+.

1. Install dependencies: `npm install`
2. Create a database: `createdb remote_skills`
3. Copy the env file and set `DATABASE_URL`: `cp .env.example .env.local`
4. Create the tables, then start the dev server: `npm run db:migrate && npm run dev`
5. Open http://localhost:3000 and check http://localhost:3000/api/health shows `"database":"up"`

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm run lint` | ESLint (Next.js rules) |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (Vitest). Set `TEST_DATABASE_URL` to also run the schema tests |
| `npm run db:migrate` | Apply pending migrations (node-pg-migrate, files in `migrations/`) |
| `npm run db:migrate:down` | Roll back the last migration |

## Database schema

```
users ──1:1── employers ──1:n── jobs ──1:n── job_reports ──n:1── users (reporter)
  │
  ├──1:n── task_attempts ──n:1── task_templates ──n:1── topics
  │             │
  └──1:n── ledger_entries (one per scored attempt) ──n:1── topics
```

| Table | Purpose |
| --- | --- |
| `users` | Everyone who signs in. `role` is `worker` or `employer`. `profile_visible` controls employer search. |
| `employers` | Company details for an employer user. `flagged_for_review` is set by job reports. |
| `topics` | Skill areas, with a per-topic `max_attempts` limit. |
| `task_templates` | Platform-written tasks: instructions, 30–60 min time limit, rubric, variable parts, `allows_ai`. |
| `task_attempts` | One attempt at one generated variant. Stores the exact `variant_content` given plus a unique `variant_hash`, so no two attempts share a task and every score can be audited. Holds answer, explanation, follow-ups and score breakdown. |
| `ledger_entries` | Public results. Append-only, one row per scored attempt, so full history is kept. |
| `ledger_best` (view) | Best verified score per worker per topic, read from `ledger_entries`. |
| `jobs` | Postings. `remote_type` is `anywhere` or `timezone_overlap` (overlap text required for the latter), plus a required `remote_declaration`. |
| `job_reports` | Worker reports that a job is not truly remote. One per worker per job. |
