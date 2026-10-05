import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';
import { backtest } from './backtest.js';
import { scoreSignal } from '../src/strategy.js';
import { validateOrder } from './risk.js';
import { PaperBroker } from './paper-broker.js';
import { loadPaperState, resetPaperState, savePaperState } from './paper-store.js';

const app=express();app.use(cors());app.use(express.json({limit:'2mb'}));
let paperState=await loadPaperState();
let broker=new PaperBroker(paperState);

app.get('/api/health',(_req,res)=>res.json({ok:true,mode:'paper',service:'TradePilot local market gateway',backtesting:true,scanner:true,liveTrading:false,persistence:true}));
async function getHistory(symbol,days=365){const chart=await yahooFinance.chart(symbol,{period1:new Date(Date.now()-days*86400000),period2:new Date(),interval:'1d'});return(chart.quotes||[]).filter(x=>x.close!=null).map(x=>({date:x.date,open:x.open,high:x.high,low:x.low,close:x.close,volume:x.volume||0}));}
async function getQuote(symbol){const [quote,candles]=await Promise.all([yahooFinance.quote(symbol),getHistory(symbol,365)]);if(!candles.length)throw new Error('No market history returned');return{symbol,name:quote.longName||quote.shortName||symbol,price:Number(quote.regularMarketPrice||candles.at(-1).close),changePct:Number(quote.regularMarketChangePercent||0),candles};}
async function syncState(){paperState={...paperState,cash:broker.cash,positions:broker.positions,trades:broker.trades,config:broker.config};await savePaperState(paperState);}
function todayPnl(){const day=new Date().toISOString().slice(0,10);return broker.trades.filter(t=>t.side==='SELL'&&t.time?.slice(0,10)===day).reduce((s,t)=>s+Number(t.pnl||0),0);}
async function pricesForPositions(){const prices={};for(const p of broker.positions){try{prices[p.symbol]=(await getQuote(p.symbol)).price}catch{}}return prices;}

app.get('/api/quote',async(req,res)=>{const symbol=String(req.query.symbol||'').trim().toUpperCase();if(!/^[A-Z.\-]{1,10}$/.test(symbol))return res.status(400).send('Invalid symbol');try{res.json(await getQuote(symbol));}catch(err){res.status(502).send(`Market data unavailable for ${symbol}: ${err.message}`);}});
app.get('/api/scan',async(req,res)=>{const raw=String(req.query.symbols||'AAPL,MSFT,NVDA,AMZN,META,TSLA');const symbols=[...new Set(raw.split(',').map(s=>s.trim().toUpperCase()).filter(s=>/^[A-Z.\-]{1,10}$/.test(s)))].slice(0,20);const results=[];for(const symbol of symbols){try{const q=await getQuote(symbol);const signal=scoreSignal(q.candles);results.push({...q,signal});}catch(error){results.push({symbol,error:error.message});}}results.sort((a,b)=>(b.signal?.confidence||0)-(a.signal?.confidence||0));res.json({count:results.length,results,generatedAt:new Date().toISOString()});});
app.get('/api/backtest',async(req,res)=>{const symbol=String(req.query.symbol||'AAPL').trim().toUpperCase();if(!/^[A-Z.\-]{1,10}$/.test(symbol))return res.status(400).send('Invalid symbol');const days=Math.min(3650,Math.max(365,Number(req.query.days||1825)));try{const candles=await getHistory(symbol,days);if(candles.length<250)return res.status(422).send('Not enough historical candles; at least 250 are required.');const result=backtest(candles,{initialCash:Number(req.query.initialCash||10000),riskPct:Number(req.query.riskPct||1),commissionBps:Number(req.query.commissionBps||5),slippageBps:Number(req.query.slippageBps||5),maxHoldBars:Number(req.query.maxHoldBars||30)});res.json({symbol,candles:candles.length,...result});}catch(err){res.status(502).send(`Backtest unavailable for ${symbol}: ${err.message}`);}});
app.post('/api/backtest/custom',(req,res)=>{const candles=Array.isArray(req.body?.candles)?req.body.candles:[];if(candles.length<250)return res.status(422).send('At least 250 candles are required.');try{res.json(backtest(candles,req.body.options||{}));}catch(err){res.status(400).send(`Invalid backtest data: ${err.message}`);}});
app.post('/api/risk/check',(req,res)=>{try{res.json(validateOrder(req.body||{}));}catch(err){res.status(400).send(`Risk check failed: ${err.message}`);}});

app.get('/api/paper/account',async(_req,res)=>{try{const prices=await pricesForPositions();res.json({mode:'paper',cash:broker.cash,equity:broker.equity(prices),positions:broker.positions,trades:broker.trades.slice(0,100),config:broker.config,persistent:true});}catch(err){res.status(500).send(err.message);}});
app.post('/api/paper/order',async(req,res)=>{try{const {symbol,price,qty,stop,target,idempotencyKey}=req.body||{};const result=broker.buy({symbol:String(symbol||'').toUpperCase(),price:Number(price),qty:Number(qty),stop:Number(stop),target:Number(target),dailyPnl:todayPnl(),idempotencyKey});if(result.ok&&!result.duplicate)await syncState();res.status(result.ok?200:422).json(result);}catch(err){res.status(400).send(err.message);}});
app.post('/api/paper/close',async(req,res)=>{try{const {symbol,price,reason='MANUAL',idempotencyKey}=req.body||{};const result=broker.sell({symbol:String(symbol||'').toUpperCase(),price:Number(price),reason,idempotencyKey});if(result.ok&&!result.duplicate)await syncState();res.status(result.ok?200:422).json(result);}catch(err){res.status(400).send(err.message);}});
app.post('/api/paper/mark',async(_req,res)=>{try{const prices=await pricesForPositions();const result=broker.mark(prices);if(result.exits.length)await syncState();res.json({...result,prices});}catch(err){res.status(500).send(err.message);}});
app.post('/api/paper/reset',async(_req,res)=>{paperState=await resetPaperState();broker=new PaperBroker(paperState);res.json({ok:true,mode:'paper',cash:broker.cash,positions:broker.positions,trades:broker.trades});});
app.post('/api/paper/kill-switch',async(req,res)=>{paperState.config={...paperState.config,killSwitch:req.body?.enabled!==false};broker.config=paperState.config;await syncState();res.json({ok:true,killSwitch:broker.config.killSwitch});});

const port=Number(process.env.PORT||8787);app.listen(port,()=>console.log(`TradePilot market gateway listening on http://localhost:${port}`));
