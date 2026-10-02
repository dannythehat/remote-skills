import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs only when TEST_DATABASE_URL points at a Postgres you are happy to write to.
// Each run uses a throwaway schema, so it starts from empty and is dropped after.
const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `schema_test_${randomUUID().replaceAll("-", "")}`;
const dir = fileURLToPath(new URL("../../migrations", import.meta.url));

function migrate(direction: "up" | "down") {
  return runner({
    databaseUrl: databaseUrl!,
    dir,
    direction,
    schema,
    createSchema: true,
    migrationsTable: "pgmigrations",
    count: Infinity,
    log: () => {},
  });
}

describe.skipIf(!databaseUrl)("database schema", () => {
  const db = new Client({ connectionString: databaseUrl });
  const sql = (text: string, values: unknown[] = []) => db.query(text, values);

  beforeAll(async () => {
    await migrate("up");
    await db.connect();
    await sql(`SET search_path TO ${schema}`);
  });

  afterAll(async () => {
    await sql(`DROP SCHEMA ${schema} CASCADE`);
    await db.end();
  });

  async function seedAttempt(variantHash: string) {
    const user = await sql(
      "INSERT INTO users (email, display_name, role) VALUES ($1, 'W', 'worker') RETURNING id",
      [`${variantHash}@example.com`],
    );
    const topic = await sql(
      "INSERT INTO topics (slug, name) VALUES ($1, 'T') RETURNING id",
      [`topic-${variantHash}`],
    );
    const template = await sql(
      `INSERT INTO task_templates (topic_id, title, instructions, time_limit_minutes, rubric)
       VALUES ($1, 'T', 'Do it', 45, '{}') RETURNING id`,
      [topic.rows[0].id],
    );
    const attempt = await sql(
      `INSERT INTO task_attempts (user_id, task_template_id, topic_id, variant_content, variant_hash, deadline_at)
       VALUES ($1, $2, $3, '{"x":1}', $4, now() + interval '45 minutes') RETURNING id`,
      [user.rows[0].id, template.rows[0].id, topic.rows[0].id, variantHash],
    );
    return { userId: user.rows[0].id, topicId: topic.rows[0].id, attemptId: attempt.rows[0].id };
  }

  it("creates every table from the ticket", async () => {
    const { rows } = await sql(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
      [schema],
    );
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        "users", "employers", "topics", "task_templates",
        "task_attempts", "ledger_entries", "jobs", "job_reports",
      ]),
    );
  });

  it("rejects a reused task variant", async () => {
    const { userId, topicId } = await seedAttempt("hash-a");
    const template = await sql("SELECT task_template_id FROM task_attempts WHERE variant_hash = 'hash-a'");
    await expect(
      sql(
        `INSERT INTO task_attempts (user_id, task_template_id, topic_id, variant_content, variant_hash, deadline_at)
         VALUES ($1, $2, $3, '{}', 'hash-a', now() + interval '1 hour')`,
        [userId, template.rows[0].task_template_id, topicId],
      ),
    ).rejects.toThrow(/variant_hash/);
  });

  it("rejects task time limits outside 30 to 60 minutes", async () => {
    const topic = await sql("INSERT INTO topics (slug, name) VALUES ('tl', 'T') RETURNING id");
    await expect(
      sql(
        `INSERT INTO task_templates (topic_id, title, instructions, time_limit_minutes, rubric)
         VALUES ($1, 'T', 'x', 90, '{}')`,
        [topic.rows[0].id],
      ),
    ).rejects.toThrow(/time_limit_minutes/);
  });

  it("ledger_best shows the best verified score and keeps full history", async () => {
    const first = await seedAttempt("hash-b1");
    const otherAttempt = await sql(
      `INSERT INTO task_attempts (user_id, task_template_id, topic_id, variant_content, variant_hash, deadline_at)
       SELECT user_id, task_template_id, topic_id, '{}', 'hash-b2', now() + interval '1 hour'
       FROM task_attempts WHERE id = $1 RETURNING id`,
      [first.attemptId],
    );
    const third = await sql(
      `INSERT INTO task_attempts (user_id, task_template_id, topic_id, variant_content, variant_hash, deadline_at)
       SELECT user_id, task_template_id, topic_id, '{}', 'hash-b3', now() + interval '1 hour'
       FROM task_attempts WHERE id = $1 RETURNING id`,
      [first.attemptId],
    );
    const insertEntry = (attemptId: string, score: number, verified: boolean) =>
      sql(
        "INSERT INTO ledger_entries (user_id, topic_id, task_attempt_id, score, verified) VALUES ($1, $2, $3, $4, $5)",
        [first.userId, first.topicId, attemptId, score, verified],
      );
    await insertEntry(first.attemptId, 60, true);
    await insertEntry(otherAttempt.rows[0].id, 85, true);
    await insertEntry(third.rows[0].id, 99, false);

    const history = await sql("SELECT count(*)::int AS n FROM ledger_entries WHERE user_id = $1", [first.userId]);
    expect(history.rows[0].n).toBe(3);

    const best = await sql("SELECT score, task_attempt_id FROM ledger_best WHERE user_id = $1", [first.userId]);
    expect(best.rows).toHaveLength(1);
    expect(Number(best.rows[0].score)).toBe(85);
    expect(best.rows[0].task_attempt_id).toBe(otherAttempt.rows[0].id);
  });

  it("rejects a ledger entry whose user or topic differs from its attempt", async () => {
    const a = await seedAttempt("hash-c1");
    const b = await seedAttempt("hash-c2");
    const insertEntry = (userId: string, topicId: string) =>
      sql(
        "INSERT INTO ledger_entries (user_id, topic_id, task_attempt_id, score) VALUES ($1, $2, $3, 50)",
        [userId, topicId, a.attemptId],
      );
    await expect(insertEntry(b.userId, a.topicId)).rejects.toThrow(/foreign key/);
    await expect(insertEntry(a.userId, b.topicId)).rejects.toThrow(/foreign key/);
    await expect(insertEntry(a.userId, a.topicId)).resolves.toBeDefined();
  });

  it("blocks UPDATE and DELETE on ledger entries", async () => {
    const a = await seedAttempt("hash-d1");
    await sql(
      "INSERT INTO ledger_entries (user_id, topic_id, task_attempt_id, score) VALUES ($1, $2, $3, 40)",
      [a.userId, a.topicId, a.attemptId],
    );
    await expect(
      sql("UPDATE ledger_entries SET score = 100 WHERE task_attempt_id = $1", [a.attemptId]),
    ).rejects.toThrow(/append-only: UPDATE/);
    await expect(
      sql("DELETE FROM ledger_entries WHERE task_attempt_id = $1", [a.attemptId]),
    ).rejects.toThrow(/append-only: DELETE/);
    // History also survives deleting the worker or the attempt.
    await expect(sql("DELETE FROM users WHERE id = $1", [a.userId])).rejects.toThrow(/foreign key/);
    await expect(sql("DELETE FROM task_attempts WHERE id = $1", [a.attemptId])).rejects.toThrow(/foreign key/);
  });

  it("only lets users with the employer role have an employer row", async () => {
    const worker = await sql(
      "INSERT INTO users (email, display_name, role) VALUES ('w-emp@example.com', 'W', 'worker') RETURNING id",
    );
    await expect(
      sql("INSERT INTO employers (user_id, company_name) VALUES ($1, 'Co')", [worker.rows[0].id]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql("INSERT INTO employers (user_id, user_role, company_name) VALUES ($1, 'worker', 'Co')", [worker.rows[0].id]),
    ).rejects.toThrow(/user_role/);

    const boss = await sql(
      "INSERT INTO users (email, display_name, role) VALUES ('e-emp@example.com', 'E', 'employer') RETURNING id",
    );
    await sql("INSERT INTO employers (user_id, company_name) VALUES ($1, 'Co')", [boss.rows[0].id]);
    await expect(
      sql("UPDATE users SET role = 'worker' WHERE id = $1", [boss.rows[0].id]),
    ).rejects.toThrow(/foreign key/);
  });

  it("only accepts truly remote job declarations", async () => {
    const user = await sql(
      "INSERT INTO users (email, display_name, role) VALUES ('boss@example.com', 'B', 'employer') RETURNING id",
    );
    const employer = await sql(
      "INSERT INTO employers (user_id, company_name) VALUES ($1, 'Co') RETURNING id",
      [user.rows[0].id],
    );
    const insertJob = (remoteType: string, overlap: string | null, declaration = "Work from anywhere.") =>
      sql(
        `INSERT INTO jobs (employer_id, title, description, remote_type, timezone_overlap, remote_declaration)
         VALUES ($1, 'Job', 'Desc', $2, $3, $4)`,
        [employer.rows[0].id, remoteType, overlap, declaration],
      );

    await expect(insertJob("anywhere", null)).resolves.toBeDefined();
    await expect(insertJob("timezone_overlap", "4h overlap with UTC")).resolves.toBeDefined();
    await expect(insertJob("hybrid", null)).rejects.toThrow(/check constraint/);
    await expect(insertJob("timezone_overlap", null)).rejects.toThrow(/jobs_remote_terms_check/);
    await expect(insertJob("anywhere", "UTC only")).rejects.toThrow(/jobs_remote_terms_check/);
    await expect(insertJob("anywhere", null, "   ")).rejects.toThrow(/remote_declaration/);
  });

  it("migrates down to an empty schema", async () => {
    await migrate("down");
    const { rows } = await sql(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name <> 'pgmigrations'",
      [schema],
    );
    expect(rows).toEqual([]);
  });
});
