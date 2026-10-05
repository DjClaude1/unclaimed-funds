import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'paper', service: 'TradePilot local market gateway' }));

app.get('/api/quote', async (req, res) => {
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return res.status(400).send('Invalid symbol');
  try {
    const quote = await yahooFinance.quote(symbol);
    const chart = await yahooFinance.chart(symbol, { period1: new Date(Date.now() - 365 * 86400000), period2: new Date(), interval: '1d' });
    const candles = (chart.quotes || []).filter(x => x.close != null).map(x => ({ date: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume || 0 }));
    if (!candles.length) throw new Error('No market history returned');
    res.json({ symbol, name: quote.longName || quote.shortName || symbol, price: Number(quote.regularMarketPrice || candles.at(-1).close), changePct: Number(quote.regularMarketChangePercent || 0), candles });
  } catch (err) {
    res.status(502).send(`Market data unavailable for ${symbol}: ${err.message}`);
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`TradePilot market gateway listening on http://localhost:${port}`));
