import { NextResponse } from "next/server";
import { getGlobalStats } from "@/lib/claude-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getGlobalStats();
    return NextResponse.json({ stats });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error reading stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
