import {
  createPublicClient,
  http,
  fallback,
  parseAbi,
} from "viem";
import { base } from "viem/chains";
import type { DexQuote } from "./types";
import { KNOWN_USDC_POOLS, PUBLIC_BASE_RPCS, USDC_BASE } from "./pools";

const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

/** Convert UniV3/Slipstream sqrtPriceX96 into a human USDC-per-stock price. */
export function priceFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  token0: string,
  token1: string,
  stock: string,
  stockDecimals = 8,
  quoteDecimals = 6,
): number {
  const SCALE = BigInt(12);
  const Q96 = BigInt(2) ** BigInt(96);
  const sqrtRatio = Number((sqrtPriceX96 * BigInt(10) ** SCALE) / Q96) / 10 ** Number(SCALE);
  const rawToken1PerToken0 = sqrtRatio * sqrtRatio;
  const t0 = token0.toLowerCase();
  const stockL = stock.toLowerCase();
  if (t0 === stockL) {
    return rawToken1PerToken0 * 10 ** (stockDecimals - quoteDecimals);
  }
  return (1 / rawToken1PerToken0) * 10 ** (stockDecimals - quoteDecimals);
}

function makeClient() {
  return createPublicClient({
    chain: base,
    transport: fallback(
      PUBLIC_BASE_RPCS.map((url) => http(url, { timeout: 8_000 })),
      { retryCount: 1 },
    ),
  });
}

export async function fetchOnchainUsdcPrices(): Promise<Map<string, DexQuote>> {
  const client = makeClient();
  const contracts = KNOWN_USDC_POOLS.flatMap((p) => [
    { address: p.pool, abi: poolAbi, functionName: "slot0" as const },
    { address: p.pool, abi: poolAbi, functionName: "token0" as const },
    { address: p.pool, abi: poolAbi, functionName: "token1" as const },
  ]);

  const results = await client.multicall({ contracts, allowFailure: true });
  const out = new Map<string, DexQuote>();

  KNOWN_USDC_POOLS.forEach((p, i) => {
    const slotRes = results[i * 3];
    const t0Res = results[i * 3 + 1];
    const t1Res = results[i * 3 + 2];
    if (slotRes.status !== "success" || t0Res.status !== "success" || t1Res.status !== "success") {
      return;
    }
    const slot = slotRes.result as readonly [bigint, number, number, number, number, boolean];
    const token0 = t0Res.result as `0x${string}`;
    const token1 = t1Res.result as `0x${string}`;
    const priceUsd = priceFromSqrtPriceX96(slot[0], token0, token1, p.token);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return;
    out.set(p.symbol, {
      priceUsd,
      source: "onchain",
      dex: p.dex,
      pool: p.pool,
      quoteToken: "USDC",
    });
  });

  return out;
}

type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  priceUsd?: string;
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
};

export async function fetchDexScreenerPrices(addresses: string[]): Promise<Map<string, DexQuote>> {
  const out = new Map<string, DexQuote>();
  if (addresses.length === 0) return out;

  // Query one token at a time — the batch endpoint caps at 30 pairs and drops names.
  await Promise.all(
    addresses.map(async (address) => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
          headers: { accept: "application/json", "user-agent": "AfterHours/0.1" },
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { pairs?: DexScreenerPair[] };
        const pairs = (body.pairs ?? []).filter((p) => p.chainId === "base" || p.chainId === "8453");
        const stables = new Set(["USDC", "USDbC", "USDT", "DAI", "frxUSD"]);
        const ranked = pairs
          .map((p) => {
            const baseSym = p.baseToken?.symbol ?? "";
            const quoteSym = p.quoteToken?.symbol ?? "";
            const baseAddr = p.baseToken?.address?.toLowerCase();
            const isStockBase = baseAddr === address.toLowerCase();
            const liq = p.liquidity?.usd ?? 0;
            const price = Number(p.priceUsd);
            const stableBonus = stables.has(quoteSym) && isStockBase ? 1e12 : 0;
            return { p, liq, price, isStockBase, quoteSym, baseSym, score: liq + stableBonus };
          })
          .filter((x) => x.isStockBase && Number.isFinite(x.price) && x.price > 0)
          .sort((a, b) => b.score - a.score);
        const best = ranked[0];
        if (!best) return;
        const symbol = best.baseSym;
        out.set(symbol, {
          priceUsd: best.price,
          source: "dexscreener",
          dex: best.p.dexId,
          pool: best.p.pairAddress,
          quoteToken: best.quoteSym,
          liquidityUsd: best.liq,
          volume24hUsd: best.p.volume?.h24,
        });
      } catch {
        // leave missing; snapshot will flag it
      }
    }),
  );
  return out;
}

export function emptyQuoteHint(): string {
  return USDC_BASE;
}
