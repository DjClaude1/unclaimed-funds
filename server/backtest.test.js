import assert from 'node:assert/strict';
import { backtest } from './backtest.js';

const rows = [];
let price = 100;
for (let i = 0; i < 500; i++) {
  price *= 1 + (i < 350 ? 0.0015 : -0.0005);
  rows.push({ date: new Date(Date.UTC(2020, 0, 1 + i)), open: price, high: price * 1.01, low: price * 0.99, close: price, volume: 100000 + (i % 20) * 1000 });
}
const result = backtest(rows, { initialCash: 10000, riskPct: 1 });
assert.equal(result.initialCash, 10000);
assert.ok(Number.isFinite(result.finalEquity));
assert.ok(result.maxDrawdownPct >= 0);
assert.ok(result.trades >= 0);
assert.ok(result.equityCurve.length > 0);
console.log('TradePilot backtest smoke test passed:', { trades: result.trades, finalEquity: result.finalEquity.toFixed(2), returnPct: result.totalReturnPct.toFixed(2) });
