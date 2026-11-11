import { classifyFeed, getMarketStatus } from "./market";
import { fetchAllTokenizedStocks, type CoinbaseToken } from "./coinbase";
import { fetchDexScreenerPrices, fetchOnchainUsdcPrices } from "./dex";
import type { DexQuote, Snapshot, StockRow } from "./types";

function toRow(token: CoinbaseToken, extras: Partial<StockRow> = {}): StockRow {
  return {
    symbol: token.symbol,
    name: token.name,
    contractAddress: token.contract_address,
    decimals: token.decimals,
    isin: token.isin,
    multiplier: token.multiplier,
    iconUrl: token.icon_url,
    totalSupply: token.total_supply,
    firstMintDate: token.first_mint_date,
    navPrice: token.nav_price,
    navUpdatedAt: token.nav_price_updated_at,
    feedState: "none",
    ...extras,
  };
}

export async function buildSnapshot(): Promise<Snapshot> {
  const warnings: string[] = [];
  const market = getMarketStatus();
  const tokens = await fetchAllTokenizedStocks();
  const withNav = tokens.filter((t) => typeof t.nav_price === "number");
  const minted = tokens.filter((t) => typeof t.total_supply === "number");

  const [onchainResult, screenResult] = await Promise.allSettled([
    fetchOnchainUsdcPrices(),
    fetchDexScreenerPrices(withNav.map((t) => t.contract_address)),
  ]);

  const onchain = onchainResult.status === "fulfilled" ? onchainResult.value : new Map<string, DexQuote>();
  const screened = screenResult.status === "fulfilled" ? screenResult.value : new Map<string, DexQuote>();

  if (onchainResult.status === "rejected") {
    warnings.push(
      `Onchain pool reads failed (${onchainResult.reason instanceof Error ? onchainResult.reason.message : "unknown"}). Using DexScreener prices.`,
    );
  }
  if (screenResult.status === "rejected") {
    warnings.push(
      `DexScreener lookup failed (${screenResult.reason instanceof Error ? screenResult.reason.message : "unknown"}).`,
    );
  }

  const rows: StockRow[] = withNav
    .map((token) => {
      const dexOnchain = onchain.get(token.symbol);
      const dexApi = screened.get(token.symbol);
      const dex = dexOnchain
        ? {
            ...dexOnchain,
            liquidityUsd: dexApi?.liquidityUsd,
            volume24hUsd: dexApi?.volume24hUsd,
          }
        : dexApi;
      const premiumPct =
        dex && token.nav_price
          ? ((dex.priceUsd - token.nav_price) / token.nav_price) * 100
          : undefined;
      const feed = classifyFeed(token.nav_price_updated_at, market);
      return toRow(token, {
        dex,
        premiumPct,
        feedState: feed.state,
        feedAgeMinutes: feed.ageMinutes,
      });
    })
    .sort((a, b) => Math.abs(b.premiumPct ?? -1) - Math.abs(a.premiumPct ?? -1));

  const navSymbols = new Set(withNav.map((t) => t.symbol));
  const otherMinted = minted
    .filter((t) => !navSymbols.has(t.symbol))
    .map((t) => {
      const feed = classifyFeed(t.nav_price_updated_at, market);
      return toRow(t, { feedState: feed.state, feedAgeMinutes: feed.ageMinutes });
    })
    .sort((a, b) => (b.totalSupply ?? 0) - (a.totalSupply ?? 0));

  for (const row of rows) {
    if (row.navPrice !== undefined && !row.dex) {
      warnings.push(`No DEX price found for ${row.symbol}.`);
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    market,
    navTokenCount: withNav.length,
    listedTokenCount: tokens.length,
    mintedTokenCount: minted.length,
    rows,
    otherMinted,
    warnings,
  };
}
