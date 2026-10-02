# remote-skills

A remote-only jobs platform with a skills performance ledger. See `CLAUDE.md` for the rules and `TICKETS.md` for the build plan.

## Run it locally

Needs Node.js 20+ and PostgreSQL 14+.

1. Install dependencies: `npm install`
2. Create a database: `createdb remote_skills`
3. Copy the env file and set `DATABASE_URL`: `cp .env.example .env.local`
4. Start the dev server: `npm run dev`
5. Open http://localhost:3000 and check http://localhost:3000/api/health shows `"database":"up"`

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm run lint` | ESLint (Next.js rules) |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests (Vitest) |
