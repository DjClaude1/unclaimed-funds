import assert from 'node:assert/strict';
import { PaperBroker } from './paper-broker.js';

const broker = new PaperBroker({ cash: 10000, config: { maxRiskPct: 1, maxPositionPct: 20 } });
const blocked = broker.buy({ symbol: 'TEST', price: 100, qty: 100, stop: 90, target: 130, idempotencyKey: 'blocked' });
assert.equal(blocked.ok, false);
const opened = broker.buy({ symbol: 'TEST', price: 100, qty: 10, stop: 90, target: 130, idempotencyKey: 'open-1' });
assert.equal(opened.ok, true);
assert.equal(broker.positions.length, 1);
const duplicate = broker.buy({ symbol: 'TEST', price: 100, qty: 10, stop: 90, target: 130, idempotencyKey: 'open-1' });
assert.equal(duplicate.duplicate, true);
const marked = broker.mark({ TEST: 130 });
assert.equal(marked.exits.length, 1);
assert.equal(broker.positions.length, 0);
console.log('Paper broker smoke test passed');
