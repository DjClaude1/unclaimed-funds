import { ema, rsi, atr, macd } from '../src/strategy.js';

function signalAt(rows) {
  const closes = rows.map(r => r.close), volumes = rows.map(r => r.volume || 0), price = closes.at(-1);
  const e20=ema(closes,20), e50=ema(closes,50), e200=ema(closes,200), r=rsi(closes), m=macd(closes), a=atr(rows);
  const recent=volumes.slice(-20), avg=recent.reduce((x,y)=>x+y,0)/Math.max(1,recent.length);
  let score=0;
  if(e20&&e50) score += e20>e50?20:-20;
  if(e50&&e200) score += e50>e200?20:-20;
  score += r>=50&&r<=70?20:r>70?-5:-10;
  score += m.histogram>0?15:-15;
  if(avg&&volumes.at(-1)>=avg) score+=15;
  const confidence=Math.min(100,Math.max(0,50+score/2));
  const stop=a?price-2*a:price*.97, target=a?price+3*a:price*1.05;
  return {action:confidence>=65?'BUY':confidence<=35?'SELL':'HOLD',confidence,price,stop,target};
}

export function backtest(rows, options={}) {
  const initialCash=Number(options.initialCash??10000), riskPct=Number(options.riskPct??1), commissionBps=Number(options.commissionBps??5), slippageBps=Number(options.slippageBps??5), maxHoldBars=Number(options.maxHoldBars??30);
  let cash=initialCash, position=null, peak=initialCash, maxDrawdown=0;
  const trades=[], equityCurve=[];
  for(let i=200;i<rows.length;i++){
    const window=rows.slice(0,i+1), bar=rows[i];
    if(position){let exit=null, exitPrice=bar.close;
      if(bar.low<=position.stop){exit='STOP';exitPrice=position.stop;} else if(bar.high>=position.target){exit='TARGET';exitPrice=position.target;} else if(i-position.entryIndex>=maxHoldBars){exit='TIME';}
      if(exit){exitPrice*=1-slippageBps/10000;const gross=(exitPrice-position.entryPrice)*position.qty;const fees=(position.entryPrice*position.qty+exitPrice*position.qty)*commissionBps/10000;cash+=position.entryPrice*position.qty+gross-fees;trades.push({entryDate:rows[position.entryIndex].date,exitDate:bar.date,qty:position.qty,entry:position.entryPrice,exit:exitPrice,pnl:gross-fees,reason:exit});position=null;}
    }
    if(!position){const sig=signalAt(window);if(sig.action==='BUY'){const riskCash=cash*riskPct/100, perShareRisk=Math.max(.01,sig.price-sig.stop), qty=Math.floor(riskCash/perShareRisk);if(qty>0&&qty*sig.price<=cash){const entry=sig.price*(1+slippageBps/10000),fees=entry*qty*commissionBps/10000;cash-=entry*qty+fees;position={qty,entryPrice:entry,stop:sig.stop,target:sig.target,entryIndex:i};}}}
    const marked=cash+(position?position.qty*bar.close:0);peak=Math.max(peak,marked);const dd=peak?(peak-marked)/peak:0;maxDrawdown=Math.max(maxDrawdown,dd);equityCurve.push({date:bar.date,equity:marked,drawdown:dd});
  }
  if(position){const bar=rows.at(-1),exitPrice=bar.close*(1-slippageBps/10000),gross=(exitPrice-position.entryPrice)*position.qty,fees=(position.entryPrice*position.qty+exitPrice*position.qty)*commissionBps/10000;cash+=position.entryPrice*position.qty+gross-fees;trades.push({entryDate:rows[position.entryIndex].date,exitDate:bar.date,qty:position.qty,entry:position.entryPrice,exit:exitPrice,pnl:gross-fees,reason:'END'});}
  const wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<=0),returns=equityCurve.map((x,i)=>i?x.equity/equityCurve[i-1].equity-1:0).filter(Number.isFinite),mean=returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:0,variance=returns.length?returns.reduce((a,b)=>a+(b-mean)**2,0)/returns.length:0,stdev=Math.sqrt(variance),grossProfit=wins.reduce((a,t)=>a+t.pnl,0),grossLoss=Math.abs(losses.reduce((a,t)=>a+t.pnl,0));
  return {initialCash,finalEquity:cash,totalReturnPct:(cash/initialCash-1)*100,maxDrawdownPct:maxDrawdown*100,sharpe:stdev?(mean/stdev)*Math.sqrt(252):0,trades:trades.length,wins:wins.length,losses:losses.length,winRatePct:trades.length?wins.length/trades.length*100:0,profitFactor:grossLoss?grossProfit/grossLoss:grossProfit>0?Infinity:0,equityCurve,tradeLog:trades};
}
