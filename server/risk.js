// Hard risk controls shared by paper/live execution layers.
export function validateOrder({ equity, cash, price, qty, stop, dailyPnl = 0, config = {} }) {
  const maxPositionPct = Number(config.maxPositionPct ?? 20);
  const maxDailyLossPct = Number(config.maxDailyLossPct ?? 3);
  const maxRiskPct = Number(config.maxRiskPct ?? 1);
  const killSwitch = Boolean(config.killSwitch ?? false);
  const reasons = [];
  const notional = price * qty;
  const riskCash = Math.max(0, price - stop) * qty;
  if (killSwitch) reasons.push('Kill switch is enabled');
  if (notional > equity * maxPositionPct / 100) reasons.push(`Position exceeds ${maxPositionPct}% equity limit`);
  if (riskCash > equity * maxRiskPct / 100) reasons.push(`Trade risk exceeds ${maxRiskPct}% equity limit`);
  if (dailyPnl <= -(equity * maxDailyLossPct / 100)) reasons.push(`Daily loss limit of ${maxDailyLossPct}% reached`);
  if (notional > cash) reasons.push('Insufficient cash');
  return { allowed: reasons.length === 0, reasons, notional, riskCash };
}
