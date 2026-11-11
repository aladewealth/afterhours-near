import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { DATA_SUFFIX } from "./attribution";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_LOGS_RPC,
  BASE_SEPOLIA_RPC,
  BOARD_ABI,
  BOARD_ADDRESS,
  BOARD_DEPLOY_BLOCK,
  DEFAULT_AGENT_ADDRESS,
} from "./contracts";
import type { AgentCall } from "./agent";

export type BoardCall = {
  callId: number;
  user: string;
  ticker: string;
  direction: -1 | 0 | 1;
  note: string;
  postedAt: string;
  txHash: string;
  blockNumber: number;
  byAgent: boolean;
};

export type BoardFeed = {
  ok: boolean;
  calls: BoardCall[];
  subscribers: number;
  subscriptions: number;
  uniqueWallets: number;
  error?: string;
};

export type BoardStats = {
  ok: boolean;
  uniqueWallets: number;
  totalCalls: number;
  agentCalls: number;
  communityCalls: number;
  subscribers: number;
  subscriptions: number;
  board?: `0x${string}`;
  chain: "base-sepolia";
  chainId: number;
  updatedAt: string;
  error?: string;
};

const CHUNK = BigInt(49_000);
const MAX_CHUNKS = 40; // ~45 days of Base Sepolia blocks

export function agentAddress(): string {
  const key = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
  if (key) {
    try {
      return privateKeyToAccount(key).address;
    } catch {
      /* fall through */
    }
  }
  return process.env.AGENT_ADDRESS || DEFAULT_AGENT_ADDRESS;
}

export function agentCanPost(): boolean {
  return Boolean(process.env.AGENT_PRIVATE_KEY && BOARD_ADDRESS);
}

const readClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC) });
const logsClient = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_LOGS_RPC) });

let cache: { at: number; feed: BoardFeed } | undefined;

export async function readBoardFeed(force = false): Promise<BoardFeed> {
  if (!BOARD_ADDRESS) return { ok: false, calls: [], subscribers: 0, subscriptions: 0, uniqueWallets: 0, error: "Board not deployed" };
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.feed;
  try {
    const latest = await logsClient.getBlockNumber();
    const ranges: [bigint, bigint][] = [];
    for (let to = latest; to >= BOARD_DEPLOY_BLOCK && ranges.length < MAX_CHUNKS; to -= CHUNK + BigInt(1)) {
      const from = to - CHUNK > BOARD_DEPLOY_BLOCK ? to - CHUNK : BOARD_DEPLOY_BLOCK;
      ranges.push([from, to]);
    }
    const logs = [];
    for (let i = 0; i < ranges.length; i += 6) {
      const batch = await Promise.all(
        ranges.slice(i, i + 6).map(([fromBlock, toBlock]) =>
          logsClient.getContractEvents({ address: BOARD_ADDRESS, abi: BOARD_ABI, fromBlock, toBlock }),
        ),
      );
      logs.push(...batch.flat());
    }
    const agent = agentAddress().toLowerCase();
    const calls: BoardCall[] = [];
    const subs = new Set<string>();
    const wallets = new Set<string>();
    let subscriptions = 0;
    for (const log of logs) {
      if (log.eventName === "CallPosted") {
        const a = log.args as { callId: bigint; user: string; ticker: string; direction: number; note: string; postedAt: bigint };
        wallets.add(a.user.toLowerCase());
        calls.push({
          callId: Number(a.callId),
          user: a.user,
          ticker: a.ticker,
          direction: (a.direction > 0 ? 1 : a.direction < 0 ? -1 : 0) as -1 | 0 | 1,
          note: a.note,
          postedAt: new Date(Number(a.postedAt) * 1000).toISOString(),
          txHash: log.transactionHash ?? "",
          blockNumber: Number(log.blockNumber ?? BigInt(0)),
          byAgent: a.user.toLowerCase() === agent,
        });
      } else if (log.eventName === "Subscribed") {
        const a = log.args as { user: string };
        subs.add(a.user.toLowerCase());
        wallets.add(a.user.toLowerCase());
        subscriptions += 1;
      }
    }
    calls.sort((x, y) => y.callId - x.callId);
    const feed = { ok: true, calls, subscribers: subs.size, subscriptions, uniqueWallets: wallets.size };
    cache = { at: Date.now(), feed };
    return feed;
  } catch (err) {
    return {
      ok: false,
      calls: cache?.feed.calls ?? [],
      subscribers: cache?.feed.subscribers ?? 0,
      subscriptions: cache?.feed.subscriptions ?? 0,
      uniqueWallets: cache?.feed.uniqueWallets ?? 0,
      error: err instanceof Error ? err.message.split("\n")[0] : "Could not read board",
    };
  }
}

export async function getBoardStats(force = false): Promise<BoardStats> {
  const feed = await readBoardFeed(force);
  const agentCalls = feed.calls.filter((c) => c.byAgent).length;
  return {
    ok: feed.ok,
    uniqueWallets: feed.uniqueWallets,
    totalCalls: feed.calls.length,
    agentCalls,
    communityCalls: feed.calls.length - agentCalls,
    subscribers: feed.subscribers,
    subscriptions: feed.subscriptions,
    board: BOARD_ADDRESS,
    chain: "base-sepolia",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    updatedAt: new Date().toISOString(),
    error: feed.error,
  };
}

export type PostResult = { ticker: string; direction: number; status: "posted" | "skipped" | "failed"; txHash?: string; reason?: string };

/** Post the agent's top calls onchain. Skips a ticker the agent already called the same way in the last 6 hours. */
export async function postAgentCalls(calls: AgentCall[], maxPosts = 3): Promise<PostResult[]> {
  const key = process.env.AGENT_PRIVATE_KEY as Hex | undefined;
  if (!key || !BOARD_ADDRESS) return calls.map((c) => ({ ticker: c.ticker, direction: c.direction, status: "skipped", reason: "read-only mode" }));
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(BASE_SEPOLIA_RPC),
    ...(DATA_SUFFIX ? { dataSuffix: DATA_SUFFIX } : {}),
  });
  const feed = await readBoardFeed(true);
  const sixHoursAgo = Date.now() - 6 * 3600_000;
  const results: PostResult[] = [];
  let posted = 0;
  for (const c of calls) {
    if (posted >= maxPosts) {
      results.push({ ticker: c.ticker, direction: c.direction, status: "skipped", reason: "per-run cap" });
      continue;
    }
    const dup = feed.calls.find(
      (b) => b.user.toLowerCase() === account.address.toLowerCase() && b.ticker === c.ticker && b.direction === c.direction && Date.parse(b.postedAt) > sixHoursAgo,
    );
    if (dup) {
      results.push({ ticker: c.ticker, direction: c.direction, status: "skipped", reason: `already called #${dup.callId}` });
      continue;
    }
    try {
      const hash = await wallet.writeContract({
        address: BOARD_ADDRESS,
        abi: BOARD_ABI,
        functionName: "postCall",
        args: [c.ticker, c.direction, c.note],
      });
      await readClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
      results.push({ ticker: c.ticker, direction: c.direction, status: "posted", txHash: hash });
      posted += 1;
    } catch (err) {
      results.push({ ticker: c.ticker, direction: c.direction, status: "failed", reason: err instanceof Error ? err.message.split("\n")[0] : "tx failed" });
    }
  }
  cache = undefined;
  return results;
}
