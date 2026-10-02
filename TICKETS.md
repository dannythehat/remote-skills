# TICKETS.md

Do tickets in order unless told otherwise. One ticket per session.

## Ticket 1: Project scaffold

Set up the repo base.
Done when:
1. Next.js with TypeScript runs locally.
2. PostgreSQL connection works through environment variables.
3. `.env.example`, lint, and a basic test runner are set up.
4. README explains how to run it in 5 steps or fewer.

## Ticket 2: Database schema

Create the tables.
Done when:
1. Tables exist for: users, employers, topics, task_templates, task_attempts, ledger_entries, jobs, job_reports.
2. Migrations run cleanly from an empty database.
3. A short schema diagram or description is added to the README.

## Ticket 3: Auth and roles

Done when:
1. Users can sign up and log in as either worker or employer.
2. Role is stored and enforced on routes.
3. Workers cannot access employer pages and the reverse.

## Ticket 4: Topic and task bank (first topic: AI skills)

Done when:
1. Topics can be seeded from a file.
2. One topic, "Using AI at work", is seeded with 3 task templates.
3. Each template has: instructions, time limit (30 to 60 minutes), scoring rubric, and a list of variable parts used to make variants.

## Ticket 5: Task variant generator

Done when:
1. Given a task template, it generates a unique variant per attempt.
2. Two attempts at the same template never get identical content.
3. The AI call sits behind one interface file so the provider can change.
4. Tests confirm variants differ and still match the rubric.

## Ticket 6: Task attempt flow

Done when:
1. A worker picks a topic and starts an attempt.
2. A timer runs and the attempt is locked at the time limit.
3. The worker submits their answer plus a written or recorded explanation of their choices.
4. Attempt limits are enforced per topic.

## Ticket 7: Scoring engine

Done when:
1. Submissions are scored against the rubric, with a short reason for each score.
2. The system asks 1 to 3 follow-up questions based on the worker's own answer, and the replies affect the score.
3. For AI-skill tasks, use of AI is allowed and prompt quality is part of the score.
4. Scores are stored with the full attempt history.

## Ticket 8: Worker ledger profile

Done when:
1. Each worker has a profile page listing proven skills with scores and dates.
2. The best verified result per skill is shown, with attempt history available.
3. The worker can choose whether the profile is visible to employers.

## Ticket 9: Employer skill search

Done when:
1. Employers can search by skill or topic.
2. Results show workers ranked by verified score, with a minimum score filter.
3. Only workers who made their profile visible appear.

## Ticket 10: Remote job posting with verification

Done when:
1. Employers can post a job through a form.
2. The form requires the truly remote declaration: no location restriction, or timezone overlap only, stated clearly.
3. Any posting that mentions a location requirement, hybrid, or on-site is rejected with a clear reason.
4. Workers can report a job as not truly remote, and reports flag the employer for review.
5. Tests cover the rejection rules.
