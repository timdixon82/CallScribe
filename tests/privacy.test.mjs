import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('privacy page names every host the Content Security Policy allows for downloads', async () => {
  const privacy = await read('../public/docs/privacy.html');
  const policy = (await read('../index.html')).match(/Content-Security-Policy" content="([^"]+)"/)[1];
  const hosts = policy.match(/connect-src[^;]*/)[0].match(/https:\/\/[^\s]+/g).map((host) => host.replace('https://', '').replace('*.', ''));
  assert.ok(hosts.length >= 3);
  for (const host of hosts) assert.ok(privacy.includes(host), `privacy page must mention ${host}`);
  assert.match(privacy, /jsDelivr is no longer used/);
  assert.match(privacy, /never leave your device/);
  for (const heading of ['Who is responsible for the data', 'Your rights', 'Recording other people']) assert.ok(privacy.includes(`<h2>${heading}</h2>`), heading);
});

test('every page carries the same policy, with no eval and no inline styles or scripts allowed', async () => {
  const pages = ['../index.html', ...['help', 'privacy', 'terms', 'accessibility', 'whats-new'].map((name) => `../public/docs/${name}.html`)];
  const policies = await Promise.all(pages.map(async (page) => (await read(page)).match(/Content-Security-Policy" content="([^"]+)"/)?.[1]));
  assert.ok(policies.every((policy) => policy && policy === policies[0]));
  assert.doesNotMatch(policies[0], /'unsafe-(eval|inline)'/);
});

test('the page policy allows frames only from its own site, with no blob or data frames', async () => {
  const policy = (await read('../index.html')).match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(policy, /(^|; )frame-src 'self'(;|$)/);
});

test('the privacy page says where models are stored, what delete-all cannot remove, and that the web address may be shared', async () => {
  const privacy = await read('../public/docs/privacy.html');
  assert.match(privacy, /Model files are now stored under names starting with callscribe-\. If you used an earlier version, some older model files may remain under the default names that other sites can also use\. Delete all my data removes the ones it can recognise as this app's\. These are public model files, not your recordings\. To remove the rest, clear this site's data in your browser settings, which also clears other pages on the same web address\./);
  assert.match(privacy, /scoped to this web address, which other pages on the same host may share/);
  assert.doesNotMatch(privacy, /scoped to this site/);
  assert.doesNotMatch(privacy, /a few (older )?(model )?files/i);
});
