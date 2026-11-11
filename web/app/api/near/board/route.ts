import { NextResponse } from "next/server";
import { readNearBoard } from "@/lib/near";

export const dynamic = "force-dynamic";

/** GET /api/near/board — stats, latest calls, agent policies and leaderboard, read live from the NEAR contract. */
export async function GET() {
  const board = await readNearBoard();
  return NextResponse.json(board, { status: board.ok ? 200 : 502 });
}
