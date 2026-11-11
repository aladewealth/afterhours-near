import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/snapshot";
import { buildAgentState } from "@/lib/agentState";

export const dynamic = "force-dynamic";

/** GET /api/agent — the agent's current read of every gap, plus the onchain activity feed. */
export async function GET() {
  try {
    const snapshot = await buildSnapshot();
    return NextResponse.json(await buildAgentState(snapshot));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "agent failed" }, { status: 502 });
  }
}
