export function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export function emaSeries(values, period) {
  const out = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = e;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

export function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = ((avgGain * (period - 1)) + Math.max(d, 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

export function atr(rows, period = 14) {
  if (rows.length < period + 1) return 0;
  const trs = rows.slice(1).map((x, i) => {
    const prev = rows[i].close;
    return Math.max(x.high - x.low, Math.abs(x.high - prev), Math.abs(x.low - prev));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function macd(values) {
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const line = values.map((_, i) => fast[i] != null && slow[i] != null ? fast[i] - slow[i] : null);
  const valid = line.map(v => v == null ? 0 : v);
  const signalSeries = emaSeries(valid, 9);
  const lastLine = line.at(-1);
  const lastSignal = signalSeries.at(-1);
  if (lastLine == null || lastSignal == null) return { line: 0, signal: 0, histogram: 0 };
  return { line: lastLine, signal: lastSignal, histogram: lastLine - lastSignal };
}

export function scoreSignal(rows) {
  if (!rows?.length) return null;
  const closes = rows.map(x => x.close);
  const volumes = rows.map(x => x.volume || 0);
  const price = closes.at(-1);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const r = rsi(closes);
  const m = macd(closes);
  const a = atr(rows);
  const recentVolumes = volumes.slice(-20);
  const avgVol = recentVolumes.reduce((x, y) => x + y, 0) / Math.max(1, recentVolumes.length);
  const volConfirm = avgVol > 0 && volumes.at(-1) >= avgVol;

  let score = 0;
  const reasons = [];
  if (e20 && e50 && e20 > e50) { score += 20; reasons.push('EMA20 above EMA50'); }
  else if (e20 && e50) { score -= 20; reasons.push('EMA20 below EMA50'); }
  if (e50 && e200 && e50 > e200) { score += 20; reasons.push('EMA50 above EMA200'); }
  else if (e50 && e200) { score -= 20; reasons.push('EMA50 below EMA200'); }
  if (r >= 50 && r <= 70) { score += 20; reasons.push(`RSI ${r.toFixed(1)} supports momentum`); }
  else if (r > 70) { score -= 5; reasons.push(`RSI ${r.toFixed(1)} is overbought`); }
  else { score -= 10; reasons.push(`RSI ${r.toFixed(1)} is weak`); }
  if (m.histogram > 0) { score += 15; reasons.push('MACD momentum positive'); }
  else { score -= 15; reasons.push('MACD momentum negative'); }
  if (volConfirm) { score += 15; reasons.push('Volume confirms move'); }
  const confidence = Math.min(100, Math.max(0, 50 + score / 2));
  const signal = confidence >= 65 ? 'BUY' : confidence <= 35 ? 'SELL' : 'HOLD';
  const stop = a ? price - 2 * a : price * 0.97;
  const target = a ? price + 3 * a : price * 1.05;
  return { signal, confidence, price, ema20: e20, ema50: e50, ema200: e200, rsi: r, macd: m.histogram, macdLine: m.line, macdSignal: m.signal, atr: a, stop, target, reasons };
}
