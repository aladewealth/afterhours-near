import { Attribution } from "ox/erc8021";
import type { Hex } from "viem";

/**
 * Agent Builder Code registered at https://api.base.dev/v1/agents/builder-codes
 * for the AfterHours agent wallet 0x0441Fe250E71fDdC650976Dd13b041fD7abE2cc9.
 * This is a public identifier, not a secret.
 */
export const DEFAULT_AGENT_BUILDER_CODE = "bc_tdrm1ha8";

/** Codes look like bc_b7k3p9da. See https://docs.base.org/specifications/builder-codes/overview */
const CODE_RE = /^[a-z0-9_]{1,32}$/;

function normalizeCode(value: string | undefined): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v || v.startsWith("your-") || v === "placeholder") return undefined;
  if (!CODE_RE.test(v)) return undefined;
  return v;
}

/** App project code from Base Dashboard, plus the agent code. Deduped, order preserved. */
export function builderCodes(): string[] {
  const app = normalizeCode(process.env.NEXT_PUBLIC_BASE_BUILDER_CODE);
  const agent =
    normalizeCode(process.env.NEXT_PUBLIC_AGENT_BUILDER_CODE) ??
    normalizeCode(process.env.AGENT_BUILDER_CODE) ??
    DEFAULT_AGENT_BUILDER_CODE;
  return [...new Set([app, agent].filter((c): c is string => Boolean(c)))];
}

/**
 * ERC-8021 data suffix appended to calldata. Contracts ignore it; Base indexers attribute the tx.
 * Undefined only if every code is unset or invalid (should not happen with the agent default).
 */
export function builderDataSuffix(): Hex | undefined {
  const codes = builderCodes();
  if (codes.length === 0) return undefined;
  return Attribution.toDataSuffix({ codes }) as Hex;
}

export const DATA_SUFFIX = builderDataSuffix();
