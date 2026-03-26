import { NextResponse } from "next/server";
import { getProjects } from "@/lib/claude-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await getProjects();

    // omit snapshots from list view for performance
    const summaries = projects.map((p) => ({
      ...p,
      sessions: p.sessions.map((s) => ({
        ...s,
        contextWindowSnapshots: [],
      })),
    }));

    return NextResponse.json({ projects: summaries });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error reading projects";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
