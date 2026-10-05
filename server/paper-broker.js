import { validateOrder } from './risk.js';

export class PaperBroker {
  constructor({ cash = 10000, positions = [], trades = [], config = {} } = {}) {
    this.cash = Number(cash);
    this.positions = [...positions];
    this.trades = [...trades];
    this.config = { maxPositionPct: 20, maxDailyLossPct: 3, maxRiskPct: 1, killSwitch: false, ...config };
  }
  equity(prices = {}) { return this.cash + this.positions.reduce((sum, p) => sum + p.qty * Number(prices[p.symbol] ?? p.entry), 0); }
  buy({ symbol, price, qty, stop, target, dailyPnl = 0, idempotencyKey }) {
    if (!symbol || !Number.isFinite(price) || !Number.isInteger(qty) || qty <= 0) throw new Error('Invalid paper order');
    if (idempotencyKey && this.trades.some(t => t.idempotencyKey === idempotencyKey)) return { ok: true, duplicate: true, trade: this.trades.find(t => t.idempotencyKey === idempotencyKey) };
    const check = validateOrder({ equity: this.equity({ [symbol]: price }), cash: this.cash, price, qty, stop, dailyPnl, config: this.config });
    if (!check.allowed) return { ok: false, reasons: check.reasons };
    const trade = { id: `paper-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, side: 'BUY', symbol, qty, price, stop, target, time: new Date().toISOString(), idempotencyKey };
    this.cash -= price * qty;
    this.positions.push({ symbol, qty, entry: price, stop, target, openedAt: trade.time });
    this.trades.unshift(trade);
    return { ok: true, trade, cash: this.cash, positions: this.positions };
  }
  sell({ symbol, price, reason = 'MANUAL', idempotencyKey }) {
    if (idempotencyKey && this.trades.some(t => t.idempotencyKey === idempotencyKey)) return { ok: true, duplicate: true };
    const matches = this.positions.filter(p => p.symbol === symbol);
    if (!matches.length) return { ok: false, reasons: ['No open position'] };
    const qty = matches.reduce((sum, p) => sum + p.qty, 0);
    const entryValue = matches.reduce((sum, p) => sum + p.qty * p.entry, 0);
    const trade = { id: `paper-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, side: 'SELL', symbol, qty, price, pnl: price * qty - entryValue, reason, time: new Date().toISOString(), idempotencyKey };
    this.cash += price * qty;
    this.positions = this.positions.filter(p => p.symbol !== symbol);
    this.trades.unshift(trade);
    return { ok: true, trade, cash: this.cash, positions: this.positions };
  }
  mark(prices = {}) {
    const exits = [];
    for (const p of [...this.positions]) {
      const price = Number(prices[p.symbol]);
      if (!Number.isFinite(price)) continue;
      if (price <= p.stop) exits.push(this.sell({ symbol: p.symbol, price, reason: 'STOP_LOSS', idempotencyKey: `stop-${p.symbol}-${p.openedAt}` }));
      else if (price >= p.target) exits.push(this.sell({ symbol: p.symbol, price, reason: 'TAKE_PROFIT', idempotencyKey: `target-${p.symbol}-${p.openedAt}` }));
    }
    return { equity: this.equity(prices), exits, positions: this.positions };
  }
}
