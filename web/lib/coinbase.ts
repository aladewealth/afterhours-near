const API = "https://api.coinbase.com/v1/tokenized-stocks";

export type CoinbaseToken = {
  contract_address: string;
  symbol: string;
  name: string;
  decimals: number;
  icon_url?: string;
  isin?: string;
  adgm_isin?: string;
  multiplier: number;
  description?: string;
  total_supply?: number;
  first_mint_date?: string;
  nav_price?: number;
  nav_price_updated_at?: string;
  paused_features?: string[];
};

export type CoinbaseListResponse = {
  tokens: CoinbaseToken[];
  next_page_token?: string;
};

export async function fetchAllTokenizedStocks(): Promise<CoinbaseToken[]> {
  const tokens: CoinbaseToken[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    const url = new URL(API);
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Tokenized Stocks API HTTP ${res.status}`);
    }
    const body = (await res.json()) as CoinbaseListResponse;
    tokens.push(...(body.tokens ?? []));
    if (!body.next_page_token) break;
    pageToken = body.next_page_token;
  }
  return tokens;
}
