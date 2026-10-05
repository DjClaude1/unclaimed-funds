import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';
import { backtest } from './backtest.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'paper', service: 'TradePilot local market gateway', backtesting: true }));

async function getHistory(symbol, days = 365) {
  const chart = await yahooFinance.chart(symbol, { period1: new Date(Date.now() - days * 86400000), period2: new Date(), interval: '1d' });
  return (chart.quotes || []).filter(x => x.close != null).map(x => ({ date: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume || 0 }));
}

app.get('/api/quote', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return res.status(400).send('Invalid symbol');
  try {
    const [quote, candles] = await Promise.all([yahooFinance.quote(symbol), getHistory(symbol, 365)]);
    if (!candles.length) throw new Error('No market history returned');
    res.json({ symbol, name: quote.longName || quote.shortName || symbol, price: Number(quote.regularMarketPrice || candles.at(-1).close), changePct: Number(quote.regularMarketChangePercent || 0), candles });
  } catch (err) { res.status(502).send(`Market data unavailable for ${symbol}: ${err.message}`); }
});

app.get('/api/backtest', async (req, res) => {
  const symbol = String(req.query.symbol || 'AAPL').trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return res.status(400).send('Invalid symbol');
  const days = Math.min(3650, Math.max(365, Number(req.query.days || 1825)));
  try {
    const candles = await getHistory(symbol, days);
    if (candles.length < 250) return res.status(422).send('Not enough historical candles; at least 250 are required.');
    const result = backtest(candles, { initialCash: Number(req.query.initialCash || 10000), riskPct: Number(req.query.riskPct || 1), commissionBps: Number(req.query.commissionBps || 5), slippageBps: Number(req.query.slippageBps || 5), maxHoldBars: Number(req.query.maxHoldBars || 30) });
    res.json({ symbol, candles: candles.length, ...result });
  } catch (err) { res.status(502).send(`Backtest unavailable for ${symbol}: ${err.message}`); }
});

app.post('/api/backtest/custom', (req, res) => {
  const candles = Array.isArray(req.body?.candles) ? req.body.candles : [];
  if (candles.length < 250) return res.status(422).send('At least 250 candles are required.');
  try { res.json(backtest(candles, req.body.options || {})); }
  catch (err) { res.status(400).send(`Invalid backtest data: ${err.message}`); }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`TradePilot market gateway listening on http://localhost:${port}`));
