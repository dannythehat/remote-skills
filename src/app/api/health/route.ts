import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/health — reports whether the app can reach PostgreSQL. */
export async function GET() {
  try {
    const ok = await checkDatabase();
    return NextResponse.json({ status: "ok", database: ok ? "up" : "down" }, { status: ok ? 200 : 503 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ status: "error", database: "down", error: message }, { status: 503 });
  }
}
