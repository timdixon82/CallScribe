import { HF_REVISIONS, WEBLLM_MODELS, webllmLibUrl } from './model-manifest.js';

// Decides whether a cached URL is one of this app's pinned model files. It is the only way the app attributes an entry in a
// shared cache (the old default names) to itself, so it is strict: exact https origin, a path that starts with the pinned
// repository and full revision followed by a slash, and no query, fragment or credentials. It reads only src/model-manifest.js.
const HF = 'https://huggingface.co';
const folder = (origin, path) => ({ origin, path, exact: false });
const file = (url) => { const { origin, pathname } = new URL(url); return { origin, path: pathname, exact: true }; };

const huggingFaceRule = (repo, revision) => folder(HF, `/${repo}/resolve/${revision}/`);
const allRules = () => [
  ...Object.entries(HF_REVISIONS).map(([repo, revision]) => huggingFaceRule(repo, revision)),
  ...Object.entries(WEBLLM_MODELS).flatMap(([id, { commit, lib }]) => [huggingFaceRule(`mlc-ai/${id}`, commit), file(webllmLibUrl(lib))]),
];

/** The rules for one model from the catalogues in models.js and minutes.js: its Transformers.js files and its WebLLM files. */
export function rulesForModel(model) {
  const rules = [];
  if (model?.repo && HF_REVISIONS[model.repo]) rules.push(huggingFaceRule(model.repo, HF_REVISIONS[model.repo]));
  const web = WEBLLM_MODELS[model?.webllmModel];
  if (web) rules.push(huggingFaceRule(`mlc-ai/${model.webllmModel}`, web.commit), file(webllmLibUrl(web.lib)));
  return rules;
}

/** True when the URL is a pinned model file of this app (or, if rules are given, of just that model). */
export function isOwnModelUrl(url, rules = allRules()) {
  let parsed; try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return false;
  return rules.some((rule) => parsed.origin === rule.origin && (rule.exact ? parsed.pathname === rule.path : parsed.pathname.startsWith(rule.path)));
}

