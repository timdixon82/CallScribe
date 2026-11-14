import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function harness() {
  const source = (await readFile(new URL('../src/minutes.webllm.worker.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const messages = []; const self = {}; let release;
  const engine = { chat: { completions: { create: () => new Promise(resolve => { release = resolve; }) } }, interruptGenerate() {} };
  const make = new Function('CreateMLCEngine', 'chunkEvidence', 'consolidateExtractions', 'conservativeRecovery', 'validateExtraction', 'postMessage', 'self', source);
  make(async () => engine, () => [{ entries: [{ id: 's1', text: 'Synthetic release planning.', speaker: [] }], screenshots: [] }], () => ({ discussion: [] }), () => ({}), value => value, message => messages.push(message), self);
  await self.onmessage({ data: { type: 'load', model: { webllmModel: 'test' } } });
  return { messages, send: data => self.onmessage({ data }), release: () => release({ choices: [{ message: { content: 'Synthetic release planning.' } }] }) };
}

test('stopping during the final chunk does not publish a completed summary', async () => {
  const worker = await harness();
  const run = worker.send({ type: 'generate', evidence: {}, model: { id: 'qwen3-0.6b' }, settings: {} });
  await worker.send({ type: 'cancel' }); worker.release(); await run;
  assert.equal(worker.messages.some(message => message.type === 'complete'), false);
  assert.equal(worker.messages.at(-1).type, 'cancelled');
  assert.deepEqual(worker.messages.at(-1).extractions, []);
});

test('compatible completed chunks are reused when restarting summary generation', async () => {
  const worker = await harness();
  await worker.send({ type: 'generate', evidence: {}, extractions: [{ discussion: [] }], model: { id: 'qwen3-0.6b' }, settings: {} });
  assert.equal(worker.messages.at(-1).type, 'complete');
  assert.equal(worker.messages.at(-1).chunkMs.length, 0);
});
