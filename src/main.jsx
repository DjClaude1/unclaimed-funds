import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA'];

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
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

function atr(rows, period = 14) {
  if (rows.length < period + 1) return 0;
  const trs = rows.slice(1).map((x, i) => {
    const prev = rows[i].close;
    return Math.max(x.high - x.low, Math.abs(x.high - prev), Math.abs(x.low - prev));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function macd(values) {
  const fast = ema(values, 12), slow = ema(values, 26);
  if (fast == null || slow == null) return { line: 0, signal: 0, histogram: 0 };
  return { line: fast - slow, signal: 0, histogram: fast - slow };
}

function scoreSignal(rows) {
  const closes = rows.map(x => x.close);
  const volumes = rows.map(x => x.volume || 0);
  const price = closes.at(-1);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const r = rsi(closes);
  const m = macd(closes);
  const a = atr(rows);
  const avgVol = volumes.slice(-20).reduce((x, y) => x + y, 0) / Math.max(1, Math.min(20, volumes.length));
  const volConfirm = avgVol ? volumes.at(-1) >= avgVol : false;

  let score = 0;
  const reasons = [];
  if (e20 && e50 && e20 > e50) { score += 20; reasons.push('EMA20 above EMA50'); } else { score -= 20; reasons.push('EMA20 below EMA50'); }
  if (e50 && e200 && e50 > e200) { score += 20; reasons.push('EMA50 above EMA200'); } else if (e200) { score -= 20; reasons.push('EMA50 below EMA200'); }
  if (r >= 50 && r <= 70) { score += 20; reasons.push(`RSI ${r.toFixed(1)} supports momentum`); }
  else if (r > 70) { score -= 5; reasons.push(`RSI ${r.toFixed(1)} is overbought`); }
  else { score -= 10; reasons.push(`RSI ${r.toFixed(1)} is weak`); }
  if (m.histogram > 0) { score += 15; reasons.push('MACD momentum positive'); } else { score -= 15; reasons.push('MACD momentum negative'); }
  if (volConfirm) { score += 15; reasons.push('Volume confirms move'); }
  const confidence = Math.min(100, Math.max(0, 50 + score / 2));
  const signal = confidence >= 65 ? 'BUY' : confidence <= 35 ? 'SELL' : 'HOLD';
  const stop = a ? price - 2 * a : price * 0.97;
  const target = a ? price + 3 * a : price * 1.05;
  return { signal, confidence, price, ema20: e20, ema50: e50, ema200: e200, rsi: r, macd: m.histogram, atr: a, stop, target, reasons };
}

async function api(path, options) {
  const res = await fetch(`/api${path}`, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function App() {
  const [symbol, setSymbol] = useState('AAPL');
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [market, setMarket] = useState({});
  const [signals, setSignals] = useState({});
  const [status, setStatus] = useState('Connecting to local market-data service…');
  const [paper, setPaper] = useState(() => JSON.parse(localStorage.getItem('tradepilot-paper') || 'null') || { cash: 10000, positions: [], trades: [] });
  const [risk, setRisk] = useState(1);

  async function loadSymbol(ticker) {
    try {
      const data = await api(`/quote?symbol=${encodeURIComponent(ticker)}`);
      setMarket(x => ({ ...x, [ticker]: data }));
      const s = scoreSignal(data.candles);
      setSignals(x => ({ ...x, [ticker]: s }));
      setStatus(`Live data loaded locally • ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      setStatus(`Data error: ${e.message}`);
    }
  }

  useEffect(() => { watchlist.forEach(loadSymbol); }, []);
  useEffect(() => { localStorage.setItem('tradepilot-paper', JSON.stringify(paper)); }, [paper]);

  const selected = market[symbol];
  const selectedSignal = signals[symbol];
  const totalValue = paper.cash + paper.positions.reduce((sum, p) => sum + p.qty * (market[p.symbol]?.price || p.entry), 0);
  const pnl = totalValue - 10000;

  function paperBuy() {
    if (!selectedSignal || selectedSignal.signal !== 'BUY') return;
    const riskCash = totalValue * (risk / 100);
    const perShareRisk = Math.max(0.01, selectedSignal.price - selectedSignal.stop);
    const qty = Math.max(1, Math.floor(riskCash / perShareRisk));
    const cost = qty * selectedSignal.price;
    if (cost > paper.cash) return;
    setPaper(p => ({ ...p, cash: p.cash - cost, positions: [...p.positions, { symbol, qty, entry: selectedSignal.price, stop: selectedSignal.stop, target: selectedSignal.target }], trades: [{ side: 'BUY', symbol, qty, price: selectedSignal.price, time: new Date().toISOString() }, ...p.trades] }));
  }

  function closePosition(p) {
    const price = market[p.symbol]?.price || p.entry;
    setPaper(x => ({ ...x, cash: x.cash + p.qty * price, positions: x.positions.filter(q => q !== p), trades: [{ side: 'SELL', symbol: p.symbol, qty: p.qty, price, time: new Date().toISOString() }, ...x.trades] }));
  }

  return <div className="app">
    <header><div><div className="eyebrow">ALGORITHMIC TRADING LAB</div><h1>TradePilot <span>AI</span></h1><p>Local-first market scanner, signal engine and paper broker.</p></div><div className="mode">PAPER MODE <b>ON</b></div></header>
    <div className="notice">⚠️ Experimental software. Signals are algorithmic, not guaranteed. Real-money trading is disabled in this MVP.</div>
    <main>
      <section className="grid metrics">
        <div className="card"><small>Paper equity</small><strong>${totalValue.toFixed(2)}</strong><em className={pnl >= 0 ? 'up' : 'down'}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</em></div>
        <div className="card"><small>Cash</small><strong>${paper.cash.toFixed(2)}</strong><em>Available</em></div>
        <div className="card"><small>Open positions</small><strong>{paper.positions.length}</strong><em>Risk: {risk}% / trade</em></div>
        <div className="card"><small>Engine</small><strong>READY</strong><em>{status}</em></div>
      </section>

      <section className="layout">
        <aside className="card watch"><div className="section-head"><h2>Scanner</h2><button onClick={() => watchlist.forEach(loadSymbol)}>SCAN</button></div>{watchlist.map(t => { const s = signals[t]; const q = market[t]; return <button className={`ticker ${symbol === t ? 'selected' : ''}`} key={t} onClick={() => { setSymbol(t); loadSymbol(t); }}><span>{t}<small>{q?.name || 'Loading…'}</small></span><b>{q ? `$${q.price.toFixed(2)}` : '—'}</b><i className={s?.signal?.toLowerCase() || ''}>{s?.signal || '…'}</i></button> })}</aside>
        <section className="card detail"><div className="section-head"><div><h2>{symbol}</h2><small>{selected?.name || 'Market data'}</small></div>{selectedSignal && <span className={`signal ${selectedSignal.signal.toLowerCase()}`}>{selectedSignal.signal} · {selectedSignal.confidence.toFixed(0)}%</span>}</div>
          <div className="price">{selected ? `$${selected.price.toFixed(2)}` : '—'} <small>{selected?.changePct != null ? `${selected.changePct >= 0 ? '+' : ''}${selected.changePct.toFixed(2)}%` : ''}</small></div>
          {selectedSignal && <div className="indicators">{[['EMA20', selectedSignal.ema20],['EMA50', selectedSignal.ema50],['EMA200', selectedSignal.ema200],['RSI', selectedSignal.rsi],['ATR', selectedSignal.atr]].map(([k,v]) => <div key={k}><small>{k}</small><b>{v == null ? '—' : Number(v).toFixed(2)}</b></div>)}</div>}
          <div className="chart"><div className="chart-line">{selected?.candles?.slice(-60).map((c,i) => <span key={i} style={{height: `${Math.max(5, Math.min(95, ((c.close - Math.min(...selected.candles.slice(-60).map(x=>x.close))) / Math.max(0.01, Math.max(...selected.candles.slice(-60).map(x=>x.close))-Math.min(...selected.candles.slice(-60).map(x=>x.close))))*90+5))}%`}} />)}</div></div>
          {selectedSignal && <><div className="trade-box"><div><small>Entry</small><b>${selectedSignal.price.toFixed(2)}</b></div><div><small>Stop loss</small><b>${selectedSignal.stop.toFixed(2)}</b></div><div><small>Take profit</small><b>${selectedSignal.target.toFixed(2)}</b></div><button disabled={selectedSignal.signal !== 'BUY'} onClick={paperBuy}>PAPER BUY</button></div><div className="reasons"><h3>Signal rationale</h3>{selectedSignal.reasons.map(r => <span key={r}>✓ {r}</span>)}</div></>}
        </section>
      </section>

      <section className="grid lower"><div className="card"><div className="section-head"><h2>Open positions</h2></div>{paper.positions.length === 0 ? <p className="muted">No paper positions. The engine will never place a real order.</p> : paper.positions.map(p => <div className="position" key={`${p.symbol}-${p.entry}`}><b>{p.symbol}</b><span>{p.qty} shares @ ${p.entry.toFixed(2)}</span><button onClick={() => closePosition(p)}>CLOSE</button></div>)}</div><div className="card"><div className="section-head"><h2>Trade journal</h2></div>{paper.trades.slice(0,8).map((t,i)=><div className="journal" key={i}><b className={t.side === 'BUY' ? 'up' : 'down'}>{t.side}</b><span>{t.qty} {t.symbol}</span><span>${t.price.toFixed(2)}</span><small>{new Date(t.time).toLocaleString()}</small></div>)}</div></section>
    </main>
    <footer>Local engine • No vendor trading credits • Live data requires the configured market-data source • Real broker integration intentionally locked.</footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
