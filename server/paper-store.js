// Vercel functions have ephemeral filesystems, so paper state is kept in-memory for the MVP.
// The UI should not treat this as durable brokerage storage. A persistent database can be
// added later without changing the broker interface.

export const DEFAULT_STATE = {
  cash: 10000,
  positions: [],
  trades: [],
  config: { maxPositionPct: 20, maxDailyLossPct: 3, maxRiskPct: 1, killSwitch: false },
  autoTrader: { enabled: false, intervalSeconds: 300, watchlist: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA'], lastRun: null, lastError: null }
};

let state = structuredClone(DEFAULT_STATE);

export async function loadPaperState() {
  return structuredClone(state);
}

export async function savePaperState(nextState) {
  state = structuredClone(nextState);
  return structuredClone(state);
}

export async function resetPaperState() {
  state = structuredClone(DEFAULT_STATE);
  return structuredClone(state);
}
