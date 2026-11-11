/**
 * AfterHours on NEAR — read the board contract over public RPC (works in the browser and on the server)
 * and, on the server only, sign agent / resolver transactions with NEAR function-call access keys.
 */

export const NEAR_NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK || process.env.NEAR_NETWORK || "testnet") as "testnet" | "mainnet";
export const NEAR_BOARD_CONTRACT =
  process.env.NEXT_PUBLIC_NEAR_BOARD_CONTRACT || process.env.NEAR_BOARD_CONTRACT || "board.afterhours-near.testnet";
export const NEAR_OWNER_ACCOUNT = "afterhours-near.testnet";
export const NEAR_AGENT_ACCOUNT = process.env.NEAR_AGENT_ACCOUNT || "agent.afterhours-near.testnet";
export const NEAR_RESOLVER_ACCOUNT = process.env.NEAR_RESOLVER_ACCOUNT || "resolver.afterhours-near.testnet";
export const NEAR_RPC =
  process.env.NEXT_PUBLIC_NEAR_RPC || process.env.NEAR_RPC || (NEAR_NETWORK === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org");
export const NEAR_EXPLORER = NEAR_NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

export type NearResolution = {
  open_price_e6: number;
  realized: -1 | 0 | 1;
  hit: boolean;
  resolved_by: string;
  resolved_at_ms: number;
};

export type NearCall = {
  id: number;
  author: string;
  by_agent: boolean;
  ticker: string;
  direction: -1 | 0 | 1;
  confidence: number;
  note: string;
  ref_nav_e6: number;
  ref_dex_e6: number;
  posted_at_ms: number;
  resolution: NearResolution | null;
};

export type NearPolicy = {
  can_post: boolean;
  can_resolve: boolean;
  max_calls_per_day: number;
  min_confidence: number;
  allowed_tickers: string[];
  active: boolean;
  expires_at_ms: number;
};

export type NearAgentView = {
  account_id: string;
  policy: NearPolicy;
  usage: { day: number; calls_today: number; blocked_total: number; last_blocked_reason: string | null };
  stats: { calls: number; resolved: number; hits: number };
};

export type NearLeaderRow = {
  account_id: string;
  is_agent: boolean;
  stats: { calls: number; resolved: number; hits: number };
  hit_rate_bps: number;
};

export type NearStats = {
  owner: string;
  paused: boolean;
  total_calls: number;
  agent_calls: number;
  community_calls: number;
  resolved_calls: number;
  blocked_attempts: number;
  authors: number;
  agents: number;
};

export type NearBoard = {
  ok: boolean;
  contract: string;
  network: string;
  stats?: NearStats;
  calls: NearCall[];
  agents: NearAgentView[];
  leaderboard: NearLeaderRow[];
  error?: string;
};

function b64(s: string): string {
  return typeof Buffer !== "undefined" ? Buffer.from(s, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(s)));
}

function decodeBytes(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Call a view method over JSON-RPC. No SDK needed. */
export async function nearView<T>(method: string, args: Record<string, unknown> = {}, contract = NEAR_BOARD_CONTRACT): Promise<T> {
  const res = await fetch(NEAR_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "afterhours",
      method: "query",
      params: { request_type: "call_function", finality: "optimistic", account_id: contract, method_name: method, args_base64: b64(JSON.stringify(args)) },
    }),
  });
  if (!res.ok) throw new Error(`NEAR RPC HTTP ${res.status}`);
  const data = (await res.json()) as { result?: { result?: number[]; error?: string }; error?: { message?: string; data?: string } };
  if (data.error) throw new Error(data.error.data || data.error.message || "NEAR RPC error");
  if (data.result?.error) throw new Error(data.result.error);
  return JSON.parse(decodeBytes(data.result?.result ?? [])) as T;
}

let cache: { at: number; board: NearBoard } | undefined;

export async function readNearBoard(force = false): Promise<NearBoard> {
  if (!force && cache && Date.now() - cache.at < 15_000) return cache.board;
  try {
    const [stats, calls, agents, leaderboard] = await Promise.all([
      nearView<NearStats>("get_stats"),
      nearView<NearCall[]>("get_calls", { limit: 100 }),
      nearView<NearAgentView[]>("get_agents"),
      nearView<NearLeaderRow[]>("get_leaderboard", { limit: 20 }),
    ]);
    const board: NearBoard = { ok: true, contract: NEAR_BOARD_CONTRACT, network: NEAR_NETWORK, stats, calls, agents, leaderboard };
    cache = { at: Date.now(), board };
    return board;
  } catch (err) {
    return {
      ok: false,
      contract: NEAR_BOARD_CONTRACT,
      network: NEAR_NETWORK,
      stats: cache?.board.stats,
      calls: cache?.board.calls ?? [],
      agents: cache?.board.agents ?? [],
      leaderboard: cache?.board.leaderboard ?? [],
      error: err instanceof Error ? err.message.split("\n")[0] : "Could not read NEAR board",
    };
  }
}

export function toE6(n: number | undefined): number | undefined {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 1_000_000);
}

export function fromE6(n: number): number {
  return n / 1_000_000;
}

export function invalidateNearCache() {
  cache = undefined;
}
