// Detects drift in download pins and hosts.
//   node scripts/check-pins.mjs --offline   static checks only (used by npm test)
//   node scripts/check-pins.mjs             also asks Hugging Face and GitHub (scheduled CI)
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIARIZER, HF_REVISIONS, WEBLLM_LIBS, WEBLLM_MODELS, webllmLibUrl } from '../src/model-manifest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMIT = /^[0-9a-f]{40}$/;
// Every external host the app may contact. Keep in step with .claude/work/2026-11-14-full-review/hosts.md.
export const ALLOWED_HOSTS = new Set(['huggingface.co', 'raw.githubusercontent.com', 'github.com', 'timdixon.net', 'callscribe.timdixon.net']);

/** Static checks: pin shape, and no unexpected host or unpinned URL in src. Returns a list of problems. */
export function staticProblems() {
  const problems = [];
  const commits = { ...HF_REVISIONS, diarizer: DIARIZER.commit, webllmLibs: WEBLLM_LIBS.commit };
  for (const [id, model] of Object.entries(WEBLLM_MODELS)) commits[id] = model.commit;
  for (const [name, commit] of Object.entries(commits)) if (!COMMIT.test(commit)) problems.push(`Pin for ${name} is not a 40-character commit.`);
  for (const [file, hash] of Object.entries(DIARIZER.files)) if (!/^[0-9a-f]{64}$/.test(hash)) problems.push(`Diarizer hash for ${file} is not SHA-256.`);
  const dir = join(root, 'src');
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.js'))) {
    const text = readFileSync(join(dir, name), 'utf8');
    for (const match of text.matchAll(/https?:\/\/([a-z0-9.-]+)([^\s'"`)]*)/gi)) {
      const [url, host] = [match[0], match[1].toLowerCase()];
      if (host === 'localhost' || host === 'www.w3.org') continue;
      if (!ALLOWED_HOSTS.has(host) && !host.startsWith('$')) problems.push(`src/${name}: host ${host} is not in the allowed list.`);
      if (/\/resolve\/main\b|\/main\/web-llm/.test(url)) problems.push(`src/${name}: unpinned URL ${url}`);
    }
  }
  return problems;
}

async function json(url) { const response = await fetch(url, { headers: { 'user-agent': 'pin-drift-check' } }); if (!response.ok) throw new Error(`${response.status} for ${url}`); return response.json(); }

/** Network checks: each pinned commit still exists, the diarizer hashes still match, and the library files still resolve. */
export async function liveProblems() {
  const problems = []; const notes = [];
  const attempt = async (label, action) => { try { await action(); } catch (error) { problems.push(`${label}: ${error.message}`); } };
  const repos = [...Object.entries(HF_REVISIONS), ...Object.entries(WEBLLM_MODELS).map(([id, model]) => [`mlc-ai/${id}`, model.commit])];
  for (const [repo, commit] of repos) await attempt(`Hugging Face ${repo}`, async () => {
    const info = await json(`https://huggingface.co/api/models/${repo}`);
    if (info.sha !== commit) notes.push(`${repo}: upstream is now ${info.sha}; pinned ${commit} (informational).`);
    await json(`https://huggingface.co/api/models/${repo}/revision/${commit}`);
  });
  await attempt('Diarizer hashes', async () => {
    const info = await json(`https://huggingface.co/api/models/${DIARIZER.repo}/revision/${DIARIZER.commit}?blobs=true`);
    for (const [file, hash] of Object.entries(DIARIZER.files)) {
      const sibling = info.siblings.find((item) => item.rfilename === file);
      if (sibling?.lfs?.sha256 !== hash) problems.push(`Diarizer ${file}: published hash differs from the pinned hash.`);
    }
  });
  for (const model of Object.values(WEBLLM_MODELS)) await attempt(`WebLLM library ${model.lib}`, async () => {
    const response = await fetch(webllmLibUrl(model.lib), { method: 'HEAD' });
    if (!response.ok) throw new Error(`status ${response.status}`);
  });
  return { problems, notes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = staticProblems(); let notes = [];
  if (!process.argv.includes('--offline')) { const live = await liveProblems(); problems.push(...live.problems); notes = live.notes; }
  for (const note of notes) console.log(`NOTE: ${note}`);
  for (const problem of problems) console.log(`FLAG: ${problem}`);
  console.log(problems.length ? `${problems.length} pin problem(s).` : 'All pins and hosts match.');
  process.exit(problems.length ? 1 : 0);
}
