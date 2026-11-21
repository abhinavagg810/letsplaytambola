// node --require: puts the QA dataset into the memory store's process-global slot before Next starts.
const { build } = require('./seed-data.cjs');
const fs = require('fs');
const OUT = process.env.QA_OUT || __dirname + '/.out';
if (!globalThis.__lpt_memory_store_v2__ && process.env.QA_SEED === '1') {
  const now = Number(process.env.QA_NOW) || Date.now();
  const { data, meta } = build(now);
  globalThis.__lpt_memory_store_v2__ = data;
  const f = OUT + '/seed-meta-' + (process.env.PORT_TAG || 'x') + '.json';
  if (!fs.existsSync(f) || process.env.QA_SEED_WRITE === '1') fs.writeFileSync(f, JSON.stringify(meta));
  if (process.env.QA_FAIL_KEY) {
    globalThis.__qa_fail = true;
    const arr = data.insights.events; Object.defineProperty(data.insights, 'events', { get() { if (globalThis.__qa_fail) throw new Error('QA injected failure'); return arr; }, set() {} });
  }
}
