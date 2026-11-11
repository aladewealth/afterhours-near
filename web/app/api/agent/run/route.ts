import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/snapshot";
import { analyzeSnapshot, maybeEnhanceWithLlm } from "@/lib/agent";
import { agentCanPost, postAgentCalls } from "@/lib/board";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/agent/run — one agent tick: snapshot → analyze → (optional LLM note) → postCall onchain.
 * Requires AGENT_PRIVATE_KEY (testnet) and AGENT_RUN_SECRET; send the secret as `x-agent-secret`
 * or `Authorization: Bearer <secret>` (works with Vercel Cron). Without a key it is a dry run.
 */
async function handle(req: Request) {
  const secret = process.env.AGENT_RUN_SECRET;
  const auth = req.headers.get("x-agent-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (agentCanPost() && (!secret || auth !== secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const snapshot = await buildSnapshot();
  const report = await maybeEnhanceWithLlm(analyzeSnapshot(snapshot));
  const max = Number(new URL(req.url).searchParams.get("max") ?? "3");
  const results = await postAgentCalls(report.calls, Number.isFinite(max) ? Math.min(Math.max(max, 0), 5) : 3);
  return NextResponse.json({ mode: agentCanPost() ? "onchain" : "dry-run", report, results });
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "run failed" }, { status: 500 });
  }
}

export const GET = POST;
