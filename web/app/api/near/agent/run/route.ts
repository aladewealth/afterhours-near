import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/snapshot";
import { analyzeSnapshot, maybeEnhanceWithLlm } from "@/lib/agent";
import { nearAgentCanPost, postAgentCallsNear, resolveDueCallsNear } from "@/lib/nearAgent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/near/agent/run — one tick of the two NEAR agents:
 *   1. caller agent: snapshot → rules (+ optional NEAR AI Cloud note) → board.post_call (policy-checked onchain)
 *   2. resolver agent: grade due calls with the latest official NAV → board.resolve_call
 * Needs AGENT_RUN_SECRET (header x-agent-secret) when keys are configured. Without keys it is a dry run.
 */
async function handle(req: Request) {
  const secret = process.env.AGENT_RUN_SECRET;
  const auth = req.headers.get("x-agent-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (nearAgentCanPost() && (!secret || auth !== secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const snapshot = await buildSnapshot();
  const report = await maybeEnhanceWithLlm(analyzeSnapshot(snapshot));
  const max = Number(new URL(req.url).searchParams.get("max") ?? "2");
  const posts = await postAgentCallsNear(report.calls, Number.isFinite(max) ? Math.min(Math.max(max, 0), 4) : 2);
  const resolutions = await resolveDueCallsNear(snapshot);
  return NextResponse.json({ mode: nearAgentCanPost() ? "near-testnet" : "dry-run", llm: report.llm, posts, resolutions });
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "run failed" }, { status: 500 });
  }
}
