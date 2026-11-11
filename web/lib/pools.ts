/** Deepest Aerodrome USDC pools observed on Base, 11 Nov 2026. token0 is USDC in every case checked. */
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export type KnownPool = {
  symbol: string;
  token: `0x${string}`;
  pool: `0x${string}`;
  dex: string;
};

export const KNOWN_USDC_POOLS: KnownPool[] = [
  { symbol: "AAPLc", token: "0xb200000000000000000000C2e324d24d7eEcd1fb", pool: "0xF5FCB9CDAFcE67d50AfEf298F88E709d2B946BA6", dex: "aerodrome-slipstream" },
  { symbol: "AMZNc", token: "0xb200000000000000000000d9192b6B456483C2E8", pool: "0x532e0F46d1e528507FC9454d5847C231f23bDDf6", dex: "aerodrome-slipstream" },
  { symbol: "CRCLc", token: "0xB20000000000000000000019f6E7C675b73C2e4D", pool: "0x294666AD6a415E8C33Af801225c04079BB4f1133", dex: "aerodrome-slipstream" },
  { symbol: "GOOGLc", token: "0xb2000000000000000000002D0BA3164cc74f58B7", pool: "0x16c70F04C3080a127486Cdf5a4C33c066bBF47C3", dex: "aerodrome-slipstream" },
  { symbol: "INTCc", token: "0xB2000000000000000000004AFF16039bA04bdFBc", pool: "0x3D384288fA79B51De882B06B617aB7989CcAd4f3", dex: "aerodrome-slipstream" },
  { symbol: "METAc", token: "0xb2000000000000000000008bC8786B856E61707C", pool: "0xd072410fa13D242e1d53721Bcf7AF02e3455DC96", dex: "aerodrome-slipstream" },
  { symbol: "MSFTc", token: "0xB200000000000000000000Ab99cFa739E253872B", pool: "0x2740C0faAb738F6e346e545fDE02aEF9B1A01ee7", dex: "aerodrome-slipstream" },
  { symbol: "MSTRc", token: "0xb2000000000000000000004884b426556b92883d", pool: "0x66DCd42E6314B287110922AE36cB2a8bdEECc153", dex: "aerodrome-slipstream" },
  { symbol: "NVDAc", token: "0xb20000000000000000000078ee7ce2fE4908108C", pool: "0xF668e21993f0ACd7ab00BB1cFbAeD0df28A3C8EC", dex: "aerodrome-slipstream" },
  { symbol: "SNDKc", token: "0xb200000000000000000000397293Cb8cda9a10c5", pool: "0x2836e062a3fe75943a7F4A552E2365b98E414E75", dex: "aerodrome-slipstream" },
  { symbol: "SPCXc", token: "0xb2000000000000000000007b9fcbd005511aCBd5", pool: "0x880dB7Dda4407D99508574E680d067D1164B3cFE", dex: "aerodrome-slipstream" },
  { symbol: "TSLAc", token: "0xb2000000000000000000001e800a7f5189430cD0", pool: "0x7A33000372f3F028f074182CCb9d16cBEEfBF920", dex: "aerodrome-slipstream" },
];

export const PUBLIC_BASE_RPCS = [
  "https://mainnet.base.org",
  "https://base.publicnode.com",
  "https://1rpc.io/base",
] as const;
