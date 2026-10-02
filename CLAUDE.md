# CLAUDE.md

Read this file fully before doing anything. Then read TICKETS.md.

## What we are building (project name TBD)

A remote-only jobs platform with a skills performance ledger.
Workers type in the skills they want to prove. The platform gives them its own internal tasks on that topic. Results go on a public ledger. Employers search by skill and see who has proven it, then hire.
We only list jobs that are truly remote. If a job is not truly remote, it is not added.

## Core rules (never break these)

1. The platform sets all tasks. Employers and workers never choose or write tasks. This stops free-work abuse.
2. Every attempt gets a unique task variant. No two people get the same task, so answers cannot be shared.
3. Tasks test judgment, not just output. Workers must explain or defend their choices, and follow-up questions are based on their own answer.
4. For AI-skill tasks, workers are allowed to use AI. We score how well they direct it.
5. Truly remote means: no location restriction, or timezone overlap only, stated up front. Anything else is rejected at posting time. No exceptions.
6. The best verified result counts on the ledger. Attempts are limited and history is visible.

## Proposed stack (change only if Danny approves)

1. TypeScript and Next.js
2. PostgreSQL
3. Hosting on Render or Cloudflare
4. Repo on GitHub
5. Anthropic API behind a small interface file, so the AI provider can be swapped later

## How builders must work

1. Do ONE ticket per session, then stop and report.
2. Work on a branch named after the ticket, for example `ticket-03-schema`. Never commit to main.
3. Keep changes small. If a ticket needs more than about 300 lines of change, stop and say so.
4. Do not edit files outside the ticket's scope. Another builder may be working there.
5. Write tests for anything with logic (scoring, variant generation, remote check).
6. Never put secrets in code. Use environment variables and update `.env.example`.
7. If something is unclear, ask. Do not guess and build.
8. If an approach fails twice, stop and report. Do not keep retrying the same thing.

## Definition of done

1. The "Done when" list on the ticket is fully met.
2. Tests pass and the app builds.
3. Final report contains: what changed, files touched, how to run it, what is not done, anything risky.

## Out of scope for now

Payments, mobile app, messaging between workers and employers, employer-created tasks, multiple topic areas beyond the first.
