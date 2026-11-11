import { NextResponse } from "next/server";
import { getBoardStats } from "@/lib/board";

export const dynamic = "force-dynamic";

/** GET /api/stats — public traction metrics from AfterHoursBoard events on Base Sepolia. */
export async function GET() {
  const stats = await getBoardStats();
  return NextResponse.json(stats, { status: stats.ok ? 200 : 502 });
}
