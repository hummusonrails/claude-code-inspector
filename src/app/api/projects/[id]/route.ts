import { NextResponse } from "next/server";
import { getProjectDetail } from "@/lib/claude-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const projectId = decodeURIComponent(id);
    const project = await getProjectDetail(projectId);
    return NextResponse.json(project);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error reading project";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
