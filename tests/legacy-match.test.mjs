import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnModelUrl, rulesForModel } from '../src/legacy-match.js';
import { HF_REVISIONS, WEBLLM_MODELS, webllmLibUrl, webllmModelUrl } from '../src/model-manifest.js';
import { MODELS } from '../src/models.js';
import { MINUTES_MODELS } from '../src/minutes.js';

const repo = 'onnx-community/whisper-tiny';
const rev = HF_REVISIONS[repo];
const pinned = `https://huggingface.co/${repo}/resolve/${rev}/onnx/encoder_model.onnx`;

test('every pinned Transformers.js and WebLLM URL is recognised', () => {
  for (const [name, revision] of Object.entries(HF_REVISIONS)) assert.ok(isOwnModelUrl(`https://huggingface.co/${name}/resolve/${revision}/config.json`), name);
  for (const [id, { lib }] of Object.entries(WEBLLM_MODELS)) {
    assert.ok(isOwnModelUrl(`${webllmModelUrl(id)}mlc-chat-config.json`), id);
    assert.ok(isOwnModelUrl(webllmLibUrl(lib)), lib);
  }
});

test('near-miss URLs are rejected', () => {
  const nearMisses = {
    'a longer repository name': `https://huggingface.co/${repo}-foo/resolve/${rev}/x`,
    'a different repository owner': `https://huggingface.co/other/whisper-tiny/resolve/${rev}/x`,
    'a different revision': `https://huggingface.co/${repo}/resolve/${rev.slice(0, -1)}0/x`,
    'the branch name instead of the revision': `https://huggingface.co/${repo}/resolve/main/x`,
    'no slash after the revision': `https://huggingface.co/${repo}/resolve/${rev}`,
    'text added to the revision': `https://huggingface.co/${repo}/resolve/${rev}extra/x`,
    'a different path word': `https://huggingface.co/${repo}/blob/${rev}/x`,
    'a different origin': `https://huggingface.co.evil.example/${repo}/resolve/${rev}/x`,
    'the short host': `https://hf.co/${repo}/resolve/${rev}/x`,
    'plain http': `http://huggingface.co/${repo}/resolve/${rev}/x`,
    'a query string': `${pinned}?download=true`,
    'a fragment': `${pinned}#x`,
    'a query that hides the pinned URL': `https://evil.example/?${pinned}`,
    'credentials in front of the host': `https://huggingface.co@evil.example/${repo}/resolve/${rev}/x`,
    'credentials with the real host': `https://user:secret@huggingface.co/${repo}/resolve/${rev}/x`,
    'dot segments that leave the folder': `https://huggingface.co/${repo}/resolve/${rev}/../../../other/m/resolve/${rev}/x`,
    'an empty string': '',
    'text that is not a URL': 'not a url',
  };
  for (const [label, url] of Object.entries(nearMisses)) assert.equal(isOwnModelUrl(url), false, label);
});

test('a WebLLM library file matches only at its exact pinned address', () => {
  const lib = webllmLibUrl(Object.values(WEBLLM_MODELS)[0].lib);
  assert.equal(isOwnModelUrl(`${lib}x`), false);
  assert.equal(isOwnModelUrl(`${lib}?x=1`), false);
  assert.equal(isOwnModelUrl(lib.replace(/\/[0-9a-f]{40}\//, `/${'0'.repeat(40)}/`)), false);
  assert.equal(isOwnModelUrl(lib.replace('raw.githubusercontent.com', 'github.com')), false);
});

test('rules for one model match only that model', () => {
  const tiny = MODELS.find((model) => model.id === 'whisper-tiny');
  const base = MODELS.find((model) => model.id === 'whisper-base');
  assert.equal(isOwnModelUrl(pinned, rulesForModel(tiny)), true);
  assert.equal(isOwnModelUrl(pinned, rulesForModel(base)), false);
  const four = MINUTES_MODELS.find((model) => model.id === 'qwen3-4b');
  const small = MINUTES_MODELS.find((model) => model.id === 'qwen3-0.6b');
  assert.equal(isOwnModelUrl(`${webllmModelUrl(four.webllmModel)}params.bin`, rulesForModel(four)), true);
  assert.equal(isOwnModelUrl(webllmLibUrl(WEBLLM_MODELS[four.webllmModel].lib), rulesForModel(four)), true);
  assert.equal(isOwnModelUrl(`${webllmModelUrl(four.webllmModel)}params.bin`, rulesForModel(small)), false);
  assert.equal(rulesForModel(small).length, 3, 'the small summary model has Transformers.js files, WebLLM files and a library');
  assert.deepEqual(rulesForModel({ id: 'unknown' }), []);
  assert.equal(isOwnModelUrl(pinned, []), false, 'an empty rule list matches nothing');
});
