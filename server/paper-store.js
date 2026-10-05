import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');
const stateFile = path.join(dataDir, 'paper-account.json');

export const DEFAULT_STATE = {
  cash: 10000,
  positions: [],
  trades: [],
  config: { maxPositionPct: 20, maxDailyLossPct: 3, maxRiskPct: 1, killSwitch: false },
  autoTrader: { enabled: false, intervalSeconds: 300, watchlist: ['AAPL','MSFT','NVDA','AMZN','META','TSLA'], lastRun: null, lastError: null }
};

export async function loadPaperState() {
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await savePaperState(DEFAULT_STATE);
    return structuredClone(DEFAULT_STATE);
  }
}

export async function savePaperState(state) {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = `${stateFile}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(temp, stateFile);
  return state;
}

export async function resetPaperState() {
  return savePaperState(structuredClone(DEFAULT_STATE));
}
