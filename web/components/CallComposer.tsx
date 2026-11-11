"use client";

import { useState } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { baseSepolia } from "viem/chains";
import { DATA_SUFFIX } from "@/lib/attribution";
import { BOARD_ABI } from "@/lib/contracts";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

type Status = { kind: "idle" | "busy" | "ok" | "err"; text?: string; hash?: string };

export function CallComposer({ board, tickers }: { board: string; tickers: string[] }) {
  const [ticker, setTicker] = useState(tickers[0] ?? "AAPLc");
  const [direction, setDirection] = useState<-1 | 0 | 1>(1);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function send(action: "postCall" | "subscribe") {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth) {
      setStatus({ kind: "err", text: "No wallet found. Open this page in MetaMask or Coinbase Wallet's browser." });
      return;
    }
    try {
      setStatus({ kind: "busy", text: "Confirm in your wallet…" });
      const wallet = createWalletClient({ chain: baseSepolia, transport: custom(eth) });
      const [account] = await wallet.requestAddresses();
      try {
        await wallet.switchChain({ id: baseSepolia.id });
      } catch {
        await wallet.addChain({ chain: baseSepolia });
        await wallet.switchChain({ id: baseSepolia.id });
      }
      const suffix = DATA_SUFFIX ? { dataSuffix: DATA_SUFFIX } : {};
      const hash =
        action === "postCall"
          ? await wallet.writeContract({ account, address: board as `0x${string}`, abi: BOARD_ABI, functionName: "postCall", args: [ticker, direction, note.slice(0, 280)], ...suffix })
          : await wallet.writeContract({ account, address: board as `0x${string}`, abi: BOARD_ABI, functionName: "subscribe", args: [ticker], ...suffix });
      setStatus({ kind: "ok", text: action === "postCall" ? "Call posted. It shows in the feed after a refresh." : `Subscribed to ${ticker}.`, hash });
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : "Transaction failed";
      setStatus({ kind: "err", text: msg.includes("AlreadySubscribed") ? `Already subscribed to ${ticker}.` : msg });
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-row)] px-4 py-4">
      <h3 className="text-sm font-medium text-white">Take the other side of the agent</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Post your own gap call with any wallet on Base Sepolia. Free testnet gas, no money at stake.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={ticker} onChange={(e) => setTicker(e.target.value)} className="rounded-lg border border-[var(--line-strong)] bg-black/30 px-2 py-1.5 text-sm text-white">
          {tickers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {([1, 0, -1] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs ${direction === d ? "border-[var(--amber)] text-[var(--amber)]" : "border-[var(--line-strong)] text-[var(--muted)]"}`}
          >
            {d === 1 ? "Gap up" : d === -1 ? "Gap down" : "Flat"}
          </button>
        ))}
      </div>
      <input
        value={note}
        maxLength={280}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why? (optional, 280 chars)"
        className="mt-2 w-full rounded-lg border border-[var(--line-strong)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-[var(--muted)]"
      />
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={status.kind === "busy"} onClick={() => send("postCall")} className="rounded-lg bg-[var(--amber)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50">
          Post call
        </button>
        <button type="button" disabled={status.kind === "busy"} onClick={() => send("subscribe")} className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-sm text-white disabled:opacity-50">
          Watch {ticker}
        </button>
      </div>
      {status.kind !== "idle" && (
        <p className={`mt-2 text-xs ${status.kind === "err" ? "text-[var(--down)]" : status.kind === "ok" ? "text-[var(--up)]" : "text-[var(--muted)]"}`}>
          {status.text}{" "}
          {status.hash && (
            <a className="underline" href={`https://sepolia.basescan.org/tx/${status.hash}`} target="_blank" rel="noreferrer">
              View tx
            </a>
          )}
        </p>
      )}
    </div>
  );
}
