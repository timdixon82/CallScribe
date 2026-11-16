import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { ALLOWED_HOSTS } from '../scripts/check-pins.mjs';

// Adding a host is a deliberate act. To add one: update EXPECTED_HOSTS below, the hosts note
// (.claude/work/2026-11-14-full-review/hosts.md), and the privacy page (public/docs/privacy.html).
const EXPECTED_HOSTS = ['callscribe.timdixon.net', 'github.com', 'huggingface.co', 'raw.githubusercontent.com', 'timdixon.net'];
// Hosts the content security policy lets the app download from. "*.hf.co" covers Hugging Face file redirects.
const EXPECTED_CONNECT = ['https://*.hf.co', 'https://huggingface.co', 'https://raw.githubusercontent.com'];
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const connectHosts = (html) => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? '';
  const directive = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src')) ?? '';
  return directive.split(/\s+/).filter((token) => token.startsWith('http')).sort();
};

test('ALLOWED_HOSTS lists exactly the documented hosts', () => {
  assert.deepEqual([...ALLOWED_HOSTS].sort(), EXPECTED_HOSTS);
});

test('the policy connect-src lists exactly the documented download hosts, on every page', async () => {
  const pages = ['../index.html', ...(await readdir(new URL('../public/docs/', import.meta.url))).filter((name) => name.endsWith('.html')).map((name) => `../public/docs/${name}`)];
  for (const page of pages) assert.deepEqual(connectHosts(await read(page)), EXPECTED_CONNECT, page);
});

test('every download host is named in the privacy page and the hosts note, and the policy hosts are allowed', async () => {
  const [privacy, note] = await Promise.all([read('../public/docs/privacy.html'), read('../.claude/work/2026-11-14-full-review/hosts.md')]);
  for (const entry of EXPECTED_CONNECT) {
    const host = new URL(entry.replace('*.', '')).hostname;
    assert.ok(privacy.includes(entry.replace('https://', '')), `privacy page names ${entry}`);
    assert.ok(note.includes(entry.replace('https://', '').replace('*.', '*.')) || note.includes(host), `hosts note names ${entry}`);
    if (!entry.includes('*')) assert.ok(ALLOWED_HOSTS.has(host), `${host} is in ALLOWED_HOSTS`);
  }
});
