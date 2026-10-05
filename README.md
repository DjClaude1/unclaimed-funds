# TradePilot AI — no-credit / self-hosted MVP

TradePilot is a local-first algorithmic trading lab. The MVP is **paper trading only** and does not depend on Lovable/Replit workspace credits.

## Current build

- Local React/Vite dashboard
- Local Node/Express market-data gateway
- Historical daily candles and current quotes through the configured Yahoo Finance data adapter
- Multi-factor deterministic signal engine: EMA 20/50/200, RSI, MACD momentum, ATR and volume confirmation
- BUY / SELL / HOLD with confidence and rationale
- ATR-based stop-loss and take-profit
- Risk-based paper position sizing
- Browser-persisted paper portfolio and trade journal
- Historical backtesting API
- Backtest metrics: total return, max drawdown, Sharpe, win rate and profit factor
- Commission and slippage assumptions in backtests
- Conservative same-candle stop/target handling
- Hard risk-control module for kill switch, daily loss, position-size and per-trade-risk limits
- Smoke test for the backtesting engine
- Real-money broker execution intentionally disabled

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm test
npm run dev
```

Open `http://localhost:5173`.

The Vite development server proxies `/api/*` to the local market gateway on port 8787.

## Backtesting API

Run a five-year-style daily backtest (subject to the data provider's available history):

```text
GET /api/backtest?symbol=AAPL&days=1825&initialCash=10000&riskPct=1
```

Optional assumptions include `commissionBps`, `slippageBps`, and `maxHoldBars`.

The engine is deterministic and uses only information available up to each historical bar; it does not use future candles to create signals. This is a research tool, not evidence of future profitability.

## Risk controls

`server/risk.js` provides reusable checks for:

- kill switch
- maximum daily loss
- maximum position size as a percentage of equity
- maximum risk per trade
- available cash

These controls must remain in front of any future broker adapter.

## Next build phases

1. Wire backtest results into the dashboard with equity/drawdown charts and parameter controls.
2. Add persistent PostgreSQL/Supabase schema and authentication.
3. Add scheduled scanner/worker and alerting.
4. Add a broker abstraction with paper-broker contract tests.
5. Add a supported paper brokerage adapter.
6. Add order state machine, idempotency keys, audit logs and reconciliation.
7. Only after extensive paper validation: explicitly opt-in live execution behind all hard risk controls.

## Safety

TradePilot does not guarantee profits and is not financial advice. Backtests can suffer from data quality, survivorship bias, slippage assumptions, fees, market-regime changes and other limitations. Live execution remains disabled until separately implemented and explicitly enabled.
