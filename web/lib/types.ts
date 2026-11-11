export type FeedState = "live" | "aging" | "holding" | "stale" | "none";

export type MarketStatus = {
  open: boolean;
  label: string;
  reason: string;
  nowEt: string;
  nowWat: string;
  sessionDateEt: string;
};

export type DexQuote = {
  priceUsd: number;
  source: "onchain" | "dexscreener";
  dex?: string;
  pool?: string;
  quoteToken?: string;
  liquidityUsd?: number;
  volume24hUsd?: number;
};

export type StockRow = {
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  isin?: string;
  multiplier: number;
  iconUrl?: string;
  totalSupply?: number;
  firstMintDate?: string;
  navPrice?: number;
  navUpdatedAt?: string;
  dex?: DexQuote;
  premiumPct?: number;
  feedState: FeedState;
  feedAgeMinutes?: number;
};

export type Snapshot = {
  fetchedAt: string;
  market: MarketStatus;
  navTokenCount: number;
  listedTokenCount: number;
  mintedTokenCount: number;
  rows: StockRow[];
  otherMinted: StockRow[];
  warnings: string[];
};
