import { parseAbi } from "viem";

/** AfterHoursBoard on Base Sepolia (84532). Deployed 11 Nov 2026, verified on Sourcify + Blockscout. */
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const AFTERHOURS_BOARD: Partial<Record<number, `0x${string}`>> = {
  [BASE_SEPOLIA_CHAIN_ID]: "0xAda77BA7C7CF22e60426D117C053C075cA18D431",
};

/** Block the board was deployed in. Log scans start here. */
export const BOARD_DEPLOY_BLOCK = BigInt(57451128);
export const BOARD_DEPLOY_TX = "0xa8a4b4cd7ebe8b2339a20d81b209d646391f9e56ed813004c4aedcc945cb23fc";

export const BOARD_ADDRESS = AFTERHOURS_BOARD[BASE_SEPOLIA_CHAIN_ID];

export const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
/** publicnode allows 50k-block getLogs windows; sepolia.base.org allows only 200. */
export const BASE_SEPOLIA_LOGS_RPC = process.env.BASE_SEPOLIA_LOGS_RPC || "https://base-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://sepolia.basescan.org";
export const BLOCKSCOUT = "https://base-sepolia.blockscout.com";

export const BOARD_ABI = parseAbi([
  "function subscribe(string ticker)",
  "function postCall(string ticker, int8 direction, string note)",
  "function nextCallId() view returns (uint256)",
  "function isSubscribed(address user, bytes32 tickerHash) view returns (bool)",
  "event Subscribed(address indexed user, bytes32 indexed tickerHash, string ticker)",
  "event CallPosted(uint256 indexed callId, address indexed user, bytes32 indexed tickerHash, string ticker, int8 direction, string note, uint256 postedAt)",
]);

/** Public address the AfterHours Agent posts from (the testnet deployer). Override with AGENT_ADDRESS. */
export const DEFAULT_AGENT_ADDRESS = "0x0441Fe250E71fDdC650976Dd13b041fD7abE2cc9";
