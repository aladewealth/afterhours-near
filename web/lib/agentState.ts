import { analyzeSnapshot, maybeEnhanceWithLlm, type AgentReport } from "./agent";
import { agentAddress, agentCanPost, readBoardFeed, type BoardFeed } from "./board";
import { BOARD_ADDRESS } from "./contracts";
import type { Snapshot } from "./types";

export type AgentMode = "onchain" | "read-only";

export type AgentState = {
  mode: AgentMode;
  agentAddress: string;
  boardAddress?: string;
  report: AgentReport;
  feed: BoardFeed;
};

export async function buildAgentState(snapshot: Snapshot): Promise<AgentState> {
  const [report, feed] = await Promise.all([maybeEnhanceWithLlm(analyzeSnapshot(snapshot)), readBoardFeed()]);
  return {
    mode: agentCanPost() ? "onchain" : "read-only",
    agentAddress: agentAddress(),
    boardAddress: BOARD_ADDRESS,
    report,
    feed,
  };
}
