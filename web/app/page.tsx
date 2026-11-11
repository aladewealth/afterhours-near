import { Dashboard } from "@/components/Dashboard";
import { buildSnapshot } from "@/lib/snapshot";
import { analyzeSnapshot, maybeEnhanceWithLlm, type AgentReport } from "@/lib/agent";
import { readNearBoard } from "@/lib/near";

export const dynamic = "force-dynamic";

export default async function Home() {
  let snapshot;
  let error: string | undefined;
  try {
    snapshot = await buildSnapshot();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load market data.";
  }

  let report: AgentReport | undefined;
  if (snapshot) {
    try {
      report = await maybeEnhanceWithLlm(analyzeSnapshot(snapshot));
    } catch {
      report = undefined;
    }
  }

  const board = await readNearBoard();

  if (!snapshot) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--amber)]">AfterHours on NEAR</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Market data is unavailable right now.</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
        <p className="mt-6 text-xs leading-5 text-[var(--muted)]">
          Informational only. Not investment advice, not a trading venue.
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <Dashboard snapshot={snapshot} report={report} board={board} />
    </main>
  );
}
