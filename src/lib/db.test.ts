import { describe, expect, it } from "vitest";
import { getDatabaseUrl } from "./db";

describe("getDatabaseUrl", () => {
  it("returns a valid postgres URL", () => {
    const url = "postgres://user:pass@localhost:5432/app";
    expect(getDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it("accepts the postgresql:// scheme", () => {
    const url = "postgresql://localhost/app";
    expect(getDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it("throws when DATABASE_URL is missing or blank", () => {
    expect(() => getDatabaseUrl({})).toThrow(/not set/);
    expect(() => getDatabaseUrl({ DATABASE_URL: "  " })).toThrow(/not set/);
  });

  it("throws on a non-postgres or malformed URL", () => {
    expect(() => getDatabaseUrl({ DATABASE_URL: "mysql://localhost/app" })).toThrow(/postgres/);
    expect(() => getDatabaseUrl({ DATABASE_URL: "not a url" })).toThrow(/valid URL/);
  });
});
