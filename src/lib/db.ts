import { Pool } from "pg";

/** Reads DATABASE_URL from the given env and fails loudly if it is missing or malformed. */
export function getDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must start with postgres:// or postgresql://");
  }
  return url;
}

let pool: Pool | undefined;

/** Shared connection pool, created on first use. */
export function getPool(): Pool {
  pool ??= new Pool({ connectionString: getDatabaseUrl() });
  return pool;
}

/** Returns true when a trivial query succeeds against the database. */
export async function checkDatabase(): Promise<boolean> {
  const result = await getPool().query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
