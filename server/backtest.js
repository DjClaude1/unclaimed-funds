// Deterministic historical backtester for TradePilot.
// Long-only by default. Uses the same indicator family as the UI and includes
// commission/slippage, position sizing, stop/target exits, equity and drawdown.

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(d, 0); loss += Math.max(-d, 0);
  }
  let ag = gain / period, al = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function atr(rows, period = 14) {
  if (rows.length < period + 1) return 0;
  const trs = rows.slice(1).map((x, i) => {
    const prev = rows[i].close;
    return Math.max(x.high - x.low, Math.abs(x.high - prev), Math.abs(x.low - prev));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function macdHistogram(values) {
  if (values.length < 35) return 0;
  const lineSeries = [];
  for (let i = 26; i <= values.length; i++) {
    const slice = values.slice(0, i);
    const f = ema(slice, 12), s = ema(slice, 26);
    if (f != null && s != null) lineSeries.push(f - s);
  }
  const line = lineSeries.at(-1) || 0;
  const signal = ema(lineSeries, 9) || 0;
  return line - signal;
}

function signalAt(rows) {
  const closes = rows.map(r => r.close);
  const volumes = rows.map(r => r.volume || 0);
  const price = closes.at(-1);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const r = rsi(closes), m = macdHistogram(closes), a = atr(rows);
  const avgVol = volumes.slice(-20).reduce((x, y) => x + y, 0) / Math.max(1, Math.min(20, volumes.length));
  let score = 0;
  if (e20 && e50 && e20 > e50) score += 20; else score -= 20;
  if (e50 && e200 && e50 > e200) score += 20; else if (e200) score -= 20;
  if (r >= 50 && r <= 70) score += 20; else if (r > 70) score -= 5; else score -= 10;
  if (m > 0) score += 15; else score -= 15;
  if (avgVol && volumes.at(-1) >= avgVol) score += 15;
  const confidence = Math.min(100, Math.max(0, 50 + score / 2));
  const stop = a ? price - 2 * a : price * 0.97;
  const target = a ? price + 3 * a : price * 1.05;
  return { action: confidence >= 65 ? 'BUY' : confidence <= 35 ? 'SELL' : 'HOLD', confidence, price, stop, target };
}

export function backtest(rows, options = {}) {
  const initialCash = Number(options.initialCash ?? 10000);
  const riskPct = Number(options.riskPct ?? 1);
  const commissionBps = Number(options.commissionBps ?? 5);
  const slippageBps = Number(options.slippageBps ?? 5);
  const maxHoldBars = Number(options.maxHoldBars ?? 30);
  let cash = initialCash;
  let position = null;
  const trades = [];
  const equityCurve = [];
  let peak = initialCash;
  let maxDrawdown = 0;

  for (let i = 200; i < rows.length; i++) {
    const window = rows.slice(0, i + 1);
    const bar = rows[i];
    if (position) {
      let exit = null;
      let exitPrice = bar.close;
      // Conservative ordering: if both levels are touched in one candle, stop wins.
      if (bar.low <= position.stop) { exit = 'STOP'; exitPrice = position.stop; }
      else if (bar.high >= position.target) { exit = 'TARGET'; exitPrice = position.target; }
      else if (i - position.entryIndex >= maxHoldBars) { exit = 'TIME'; exitPrice = bar.close; }
      if (exit) {
        exitPrice *= 1 - slippageBps / 10000;
        const gross = (exitPrice - position.entryPrice) * position.qty;
        const fees = (position.entryPrice * position.qty + exitPrice * position.qty) * commissionBps / 10000;
        cash += position.entryPrice * position.qty + gross - fees;
        trades.push({ entryDate: rows[position.entryIndex].date, exitDate: bar.date, qty: position.qty, entry: position.entryPrice, exit: exitPrice, pnl: gross - fees, reason: exit });
        position = null;
      }
    }

    if (!position) {
      const sig = signalAt(window);
      if (sig.action === 'BUY') {
        const riskCash = cash * (riskPct / 100);
        const perShareRisk = Math.max(0.01, sig.price - sig.stop);
        const qty = Math.floor(riskCash / perShareRisk);
        if (qty > 0 && qty * sig.price <= cash) {
          const entry = sig.price * (1 + slippageBps / 10000);
          const fees = entry * qty * commissionBps / 10000;
          cash -= entry * qty + fees;
          position = { qty, entryPrice: entry, stop: sig.stop, target: sig.target, entryIndex: i };
        }
      }
    }

    const marked = cash + (position ? position.qty * bar.close : 0);
    peak = Math.max(peak, marked);
    const dd = peak ? (peak - marked) / peak : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);
    equityCurve.push({ date: bar.date, equity: marked, drawdown: dd });
  }

  if (position) {
    const bar = rows.at(-1);
    const exitPrice = bar.close * (1 - slippageBps / 10000);
    const gross = (exitPrice - position.entryPrice) * position.qty;
    const fees = (position.entryPrice * position.qty + exitPrice * position.qty) * commissionBps / 10000;
    cash += position.entryPrice * position.qty + gross - fees;
    trades.push({ entryDate: rows[position.entryIndex].date, exitDate: bar.date, qty: position.qty, entry: position.entryPrice, exit: exitPrice, pnl: gross - fees, reason: 'END' });
  }

  const finalEquity = cash;
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const returns = equityCurve.map((x, i) => i ? (x.equity / equityCurve[i - 1].equity) - 1 : 0).filter(Number.isFinite);
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length : 0;
  const stdev = Math.sqrt(variance);
  const sharpe = stdev ? (mean / stdev) * Math.sqrt(252) : 0;
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

  return {
    initialCash, finalEquity,
    totalReturnPct: ((finalEquity / initialCash) - 1) * 100,
    maxDrawdownPct: maxDrawdown * 100,
    sharpe,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: trades.length ? wins.length / trades.length * 100 : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    equityCurve,
    tradeLog: trades
  };
}
