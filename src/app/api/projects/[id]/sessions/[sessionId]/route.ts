import { NextResponse } from "next/server";
import { getSessionDetail } from "@/lib/claude-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id, sessionId } = await params;
    const projectId = decodeURIComponent(id);
    const decodedSessionId = decodeURIComponent(sessionId);
    const session = await getSessionDetail(projectId, decodedSessionId);
    return NextResponse.json(session);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error reading session";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
