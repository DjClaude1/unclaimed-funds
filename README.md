# TradePilot AI — no-credit / self-hosted MVP

TradePilot is a local-first algorithmic trading lab. The current MVP is **paper trading only** and is designed to avoid SaaS builder credit limits.

## What is working

- Local React/Vite dashboard
- Local Node market-data gateway
- Live quote/history retrieval through Yahoo Finance's public market-data interface
- Multi-factor signal engine using EMA 20/50/200, RSI, MACD momentum, ATR and volume confirmation
- BUY / SELL / HOLD signal with confidence score and rationale
- ATR-based stop-loss and take-profit levels
- Risk-based paper position sizing
- Local paper portfolio and trade journal using browser storage
- Responsive dashboard
- Real-money broker execution intentionally disabled

## Run locally

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

The Vite development server proxies `/api/*` to the local market gateway on port 8787.

## Strategy

The initial deterministic strategy scores trend, momentum and volume:

- EMA20 > EMA50: positive trend component
- EMA50 > EMA200: primary trend component
- RSI 50–70: positive momentum component
- MACD histogram > 0: positive momentum component
- Above-average volume: confirmation component

A score is converted to BUY / HOLD / SELL. The algorithm is deliberately transparent so it can be backtested and changed without relying on an opaque AI decision.

## Next build phases

1. Add historical backtesting engine with equity curve, drawdown, Sharpe, win rate and profit factor.
2. Add persistent PostgreSQL/Supabase schema and authentication.
3. Add scheduled scanner/worker.
4. Add broker abstraction with a paper broker first.
5. Add an optional supported paper broker such as Alpaca.
6. Add hard risk controls: max daily loss, max open risk, max position size, duplicate-order guard and kill switch.
7. Only after paper validation: add explicitly opt-in live execution.

## Safety

This software does not guarantee profits and does not constitute financial advice. Market-data availability, execution quality, slippage, fees and model assumptions can materially affect results. Keep live execution disabled until extensive testing is complete.

## Self-hosting

The application is ordinary source code and can be run on your own machine/server. It does not depend on Lovable/Replit workspace credits. AI coding assistance can be supplied separately through a local/open-source builder such as Dyad or bolt.diy, while the resulting application remains portable.
