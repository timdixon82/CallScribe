import './style.css';
import './tabs.css';
import './layout.css';
import './compact.css';
import { MODELS, findModel } from './models.js';
import { AudioPipeline } from './audio.js';
import { deleteSegments, getModel, getSegments, getSetting, putModel, putSegment, putSession, putSetting, removeModel } from './store.js';

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(['app-status', 'active-model', 'model-list', 'download-announcements', 'microphone-select', 'enable-microphone', 'microphone-status', 'share-system-audio', 'system-audio-status', 'start-session', 'pause-session', 'stop-session', 'new-session', 'session-status', 'transcript-list', 'empty-transcript', 'transcript-search', 'announce-mode', 'transcript-announcements', 'clear-transcript', 'delete-dialog', 'delete-message', 'confirm-delete', 'diagnostics'].map((id) => [id, $(id)]));
const worker = new Worker(new URL('./transcriber.worker.js', import.meta.url), { type: 'module' });
let selectedModel; let activeModel; let downloadTarget; let pendingDelete; let session; let segments = []; let paused = false; let downloadState; let downloadAttempt = 0;
const pipelines = new Map(); const downloadFiles = new Map();
const DEFAULT_VOICE = { highPass: 90, lowPass: 7600, threshold: -30, ratio: 4 };
let voiceProcessing = { ...DEFAULT_VOICE };

function setStatus(message) { ui['app-status'].textContent = message; }
function setSessionStatus(message) { ui['session-status'].textContent = message; }
function bytes(value = 0) { return `${(value / 1024 / 1024).toFixed(value > 100 * 1024 * 1024 ? 0 : 1)} MB`; }
function formatTime(time) { return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function safeText(value) { return String(value ?? ''); }

async function initialise() {
  const theme = localStorage.getItem('localBrowserTranscriberTheme') || 'system';
  $('theme-select').value = theme;
  applyTheme(theme);
  voiceProcessing = { ...DEFAULT_VOICE, ...JSON.parse(localStorage.getItem('localBrowserTranscriberVoiceProcessing') || '{}') };
  updateVoiceControls();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
  selectedModel = await getSetting('selectedModel') || 'moonshine-base';
  await populateMicrophones(); await requestMicrophoneOnLaunch(); await renderModels(); await refreshDiagnostics();
  const model = findModel(selectedModel) || findModel('moonshine-base');
  const record = await getModel(model.id);
  if (record?.ready) loadModel(model, true); else if (model.default && !navigator.onLine) failDownload('Moonshine Base is not downloaded and the browser is offline. Connect to the internet and select Retry download.'); else loadModel(model, false);
}

async function requestMicrophoneOnLaunch() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const permission = await navigator.permissions?.query?.({ name: 'microphone' });
    if (permission?.state === 'denied') { ui['microphone-status'].textContent = 'Microphone permission is blocked. Use the browser site controls to allow it, then select Enable microphone.'; return; }
    await enableMic();
  } catch { ui['microphone-status'].textContent = 'Select Enable microphone to grant microphone permission.'; }
}

function applyTheme(theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
}
$('theme-select').addEventListener('change', ({ target }) => {
  localStorage.setItem('localBrowserTranscriberTheme', target.value);
  applyTheme(target.value);
});

const tabs = [...document.querySelectorAll('[role="tab"]')];
function activateTab(tab, focus = false) {
  tabs.forEach((item) => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; $(item.getAttribute('aria-controls')).hidden = !selected; });
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', (event) => { const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']; if (!keys.includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length; activateTab(tabs[next], true); });
});

function updateVoiceControls() {
  for (const [key, value] of Object.entries(voiceProcessing)) { const id = key === 'threshold' ? 'compressor-threshold' : key === 'ratio' ? 'compressor-ratio' : key; $(id).value = value; $(`${id}-value`).textContent = key === 'ratio' ? `${value}:1` : `${value} ${key === 'threshold' ? 'dB' : 'Hz'}`; }
}
for (const [key, id] of Object.entries({ highPass: 'high-pass', lowPass: 'low-pass', threshold: 'compressor-threshold', ratio: 'compressor-ratio' })) $(id).addEventListener('input', ({ target }) => { voiceProcessing[key] = Number(target.value); localStorage.setItem('localBrowserTranscriberVoiceProcessing', JSON.stringify(voiceProcessing)); updateVoiceControls(); pipelines.get('microphone')?.setVoiceProcessing(voiceProcessing); });
$('reset-voice-processing').addEventListener('click', () => { voiceProcessing = { ...DEFAULT_VOICE }; localStorage.setItem('localBrowserTranscriberVoiceProcessing', JSON.stringify(voiceProcessing)); updateVoiceControls(); pipelines.get('microphone')?.setVoiceProcessing(voiceProcessing); });

async function populateMicrophones() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  devices.filter((device) => device.kind === 'audioinput').forEach((device, index) => {
    const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `Microphone ${index + 1}`; ui['microphone-select'].append(option);
  });
}

async function renderModels() {
  ui['model-list'].replaceChildren();
  for (const model of MODELS) {
    const record = await getModel(model.id); const row = document.createElement('tr');
    const name = document.createElement('th'); name.scope = 'row'; name.textContent = `${model.name}${model.default ? ' (default)' : ''}`;
    const language = document.createElement('td'); language.textContent = model.language;
    const details = document.createElement('td'); details.textContent = downloadState?.modelId === model.id ? downloadState.detail : record?.ready ? `Ready${record.device ? ` (${record.device})` : ''}` : record?.failure ? `Failed: ${record.failure}` : 'Not downloaded';
    const actions = document.createElement('td');
    const button = document.createElement('button'); button.type = 'button'; button.textContent = record?.ready ? (activeModel === model.id ? 'Active model' : 'Select model') : record?.failure ? 'Retry download' : (model.default ? 'Download Moonshine Base' : 'Download model'); button.disabled = activeModel === model.id;
    button.addEventListener('click', () => loadModel(model, Boolean(record?.ready)));
    actions.append(button);
    if (downloadState?.modelId === model.id && downloadState.phase !== 'failed') { const progress = document.createElement('progress'); progress.setAttribute('aria-label', `${model.name} download progress`); if (downloadState.total) { progress.max = downloadState.total; progress.value = downloadState.loaded; } actions.append(progress); }
    if (record?.ready) { const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove model'; remove.addEventListener('click', () => requestDelete(model)); actions.append(remove); }
    row.append(name, language, details, actions); ui['model-list'].append(row);
  }
}

async function loadModel(model, localOnly, attempt = 0) {
  if (!localOnly && !navigator.onLine) return failDownload(`${model.name} is not downloaded and the browser is offline.`);
  downloadTarget = model; downloadAttempt = attempt; downloadFiles.clear(); downloadState = { modelId: model.id, phase: localOnly ? 'verifying' : 'downloading', detail: localOnly ? 'Verifying cached files' : attempt ? 'Retrying download' : 'Preparing download', loaded: 0, total: 0, localOnly }; await renderModels();
  setStatus(`${localOnly ? 'Verifying' : 'Downloading'} ${model.name}. Transcription controls are unavailable.`);
  const record = await getModel(model.id); worker.postMessage({ type: 'load', model, localOnly, preferredDevice: localOnly ? record?.device : undefined });
}

function updateDownload(data) {
  if (data.status === 'initiate') { downloadFiles.set(data.file, { loaded: 0, total: 0 }); }
  if (data.status === 'progress') downloadFiles.set(data.file, { loaded: data.loaded || 0, total: data.total || 0 });
  const values = [...downloadFiles.values()]; const known = values.every((item) => item.total > 0); const loaded = values.reduce((sum, item) => sum + item.loaded, 0); const total = values.reduce((sum, item) => sum + item.total, 0);
  if (known && total) { const percent = Math.min(100, Math.round(loaded / total * 100)); downloadState = { ...downloadState, loaded, total, detail: `Downloading ${percent}% (${bytes(loaded)} of ${bytes(total)})` }; if (percent % 10 === 0) ui['download-announcements'].textContent = `${downloadTarget.name} download ${percent}% complete.`; }
  else downloadState = { ...downloadState, loaded, total: 0, detail: `Downloading ${bytes(loaded)}; total is not reported yet` };
  renderModels();
}

worker.onmessage = async ({ data }) => {
  if (data.type === 'progress') return updateDownload(data.data);
  if (data.type === 'model-status') { downloadState = { ...downloadState, detail: data.status }; renderModels(); return; }
  if (data.type === 'model-ready') {
    activeModel = data.modelId; await putModel({ id: activeModel, ready: true, device: data.device, verifiedAt: Date.now() }); await putSetting('selectedModel', activeModel); selectedModel = activeModel;
    downloadState = undefined; ui['active-model'].textContent = `Selected model: ${findModel(activeModel).name}, ready using ${data.device}.`; ui['download-announcements'].textContent = `${findModel(activeModel).name} is ready for transcription.`; setStatus(`${findModel(activeModel).name} is ready. All transcription remains local.`); ui['start-session'].disabled = false; await renderModels(); refreshDiagnostics(); return;
  }
  if (data.type === 'segment') return addSegment(data);
  if (data.type === 'error') return failDownload(data.message);
};

async function failDownload(message) { if (downloadTarget && !downloadState?.localOnly && downloadAttempt === 0) return loadModel(downloadTarget, false, 1); if (downloadTarget) await putModel({ id: downloadTarget.id, ready: false, failure: message, failedAt: Date.now() }); downloadState = downloadTarget ? { ...downloadState, phase: 'failed', detail: `Failed: ${message}` } : undefined; setStatus(`Model failed: ${message}`); ui['download-announcements'].textContent = `Model download failed. Use the Retry download button in the model row.`; ui['start-session'].disabled = !activeModel; renderModels(); }

async function enableMic() {
  try { const id = ui['microphone-select'].value; const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false }); await addPipeline('microphone', stream); ui['microphone-status'].textContent = 'Microphone enabled with browser noise suppression, echo cancellation, automatic gain, and local voice filtering.'; }
  catch (error) { ui['microphone-status'].textContent = `Microphone unavailable: ${error.message}`; }
}
async function shareSystemAudio() {
  try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { suppressLocalAudioPlayback: false }, systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include' }); const audioTracks = stream.getAudioTracks(); stream.getVideoTracks().forEach((track) => track.stop()); if (!audioTracks.length) { stream.getTracks().forEach((track) => track.stop()); throw new Error('The browser did not supply an audio track. Try a different share surface and enable its audio option, or continue with the microphone.'); } await addPipeline('system', new MediaStream(audioTracks)); ui['system-audio-status'].textContent = 'Computer audio enabled. The browser supplied an audio track.'; }
  catch (error) { ui['system-audio-status'].textContent = `Computer audio unavailable: ${error.message}`; }
}
async function addPipeline(source, stream) { pipelines.get(source)?.stop(); const pipeline = new AudioPipeline({ source, stream, voiceProcessing: source === 'microphone' ? voiceProcessing : undefined, onChunk: transcribe, onStopped: (name) => { pipelines.delete(name); $(name === 'system' ? 'system-audio-status' : 'microphone-status').textContent = `${name === 'system' ? 'Computer audio' : 'Microphone'} capture stopped.`; } }); await pipeline.start(); pipelines.set(source, pipeline); refreshDiagnostics(); }
function transcribe(chunk) { if (!session || paused || !activeModel) return; if (worker.busy) return; worker.busy = true; worker.postMessage({ type: 'transcribe', requestId: crypto.randomUUID(), ...chunk }, [chunk.audio.buffer]); }
async function addSegment(result) { worker.busy = false; if (!result.text || !session) return; const segment = { id: crypto.randomUUID(), sessionId: session.id, sessionStartedAt: session.startedAt, source: result.source, start: result.capturedAt, end: result.capturedAt + result.durationMs, text: result.text, modelId: result.modelId, final: true }; segments.push(segment); segments.sort((a, b) => a.start - b.start); await putSegment(segment); renderTranscript(); const mode = ui['announce-mode'].value; ui['transcript-announcements'].textContent = mode === 'complete' ? `${segment.source === 'system' ? 'Computer audio' : 'Microphone'}: ${segment.text}` : mode === 'notice' ? 'New completed transcript text is available.' : ''; }

async function startSession() { if (!activeModel) return; session = { id: crypto.randomUUID(), startedAt: Date.now(), modelId: activeModel, status: 'recording' }; segments = []; await putSession(session); paused = false; setSessionStatus('Recording and transcribing enabled audio sources.'); ui['start-session'].disabled = true; ui['pause-session'].disabled = false; ui['stop-session'].disabled = false; }
async function togglePause() { if (!session) return; paused = !paused; session.status = paused ? 'paused' : 'recording'; await putSession(session); ui['pause-session'].textContent = paused ? 'Resume transcription' : 'Pause transcription'; setSessionStatus(paused ? 'Transcription paused. Audio capture continues but is not queued.' : 'Transcription resumed.'); }
async function stopSession() { if (!session) return; pipelines.forEach((pipeline) => pipeline.stop()); session.status = 'stopped'; session.endedAt = Date.now(); await putSession(session); setSessionStatus('Session stopped. Audio tracks have been released.'); ui['start-session'].disabled = false; ui['pause-session'].disabled = true; ui['stop-session'].disabled = true; session = null; }
function renderTranscript() { const query = ui['transcript-search'].value.toLowerCase(); ui['transcript-list'].replaceChildren(); segments.filter((segment) => !query || segment.text.toLowerCase().includes(query)).forEach((segment) => { const item = document.createElement('li'); item.className = 'transcript-segment'; const label = document.createElement('span'); label.className = 'segment-label'; label.textContent = `${formatTime(segment.start)} | ${segment.source === 'system' ? 'Computer audio' : 'Microphone'}`; const text = document.createElement('span'); text.className = 'segment-text'; text.textContent = segment.text; const editButton = document.createElement('button'); editButton.type = 'button'; editButton.textContent = 'Edit'; const edit = document.createElement('textarea'); edit.hidden = true; edit.value = segment.text; edit.setAttribute('aria-label', `Transcript text from ${segment.source} at ${formatTime(segment.start)}`); editButton.addEventListener('click', () => { edit.hidden = !edit.hidden; if (!edit.hidden) edit.focus(); }); edit.addEventListener('change', async () => { segment.text = safeText(edit.value); text.textContent = segment.text; await putSegment(segment); }); item.append(label, text, editButton, edit); ui['transcript-list'].append(item); }); ui['empty-transcript'].hidden = Boolean(segments.length); }
ui['transcript-search'].addEventListener('input', renderTranscript);
ui['enable-microphone'].addEventListener('click', enableMic); ui['share-system-audio'].addEventListener('click', shareSystemAudio); ui['start-session'].addEventListener('click', startSession); ui['pause-session'].addEventListener('click', togglePause); ui['stop-session'].addEventListener('click', stopSession);
ui['new-session'].addEventListener('click', async () => { if (session) await stopSession(); segments = []; renderTranscript(); setSessionStatus('Ready for a new session.'); });
ui['clear-transcript'].addEventListener('click', async () => { if (session) await deleteSegments(session.id); segments = []; renderTranscript(); });
function requestDelete(model) { if (session?.modelId === model.id) return setStatus('Stop the active session before removing its model.'); pendingDelete = model; ui['delete-message'].textContent = `Remove ${model.name} from browser-managed model storage? Other models and transcript sessions will be kept.`; ui['delete-dialog'].showModal(); }
ui['delete-dialog'].addEventListener('close', async () => { if (ui['delete-dialog'].returnValue !== 'confirm' || !pendingDelete) return; const cache = await caches.open('transformers-cache'); const keys = await cache.keys(); await Promise.all(keys.filter((request) => request.url.includes(pendingDelete.repo)).map((request) => cache.delete(request))); await removeModel(pendingDelete.id); if (activeModel === pendingDelete.id) activeModel = null; pendingDelete = null; await renderModels(); refreshDiagnostics(); });

function download(text, name, type) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function clock(ms) { const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function exportText() { return segments.map((segment) => `${formatTime(segment.start)} | ${segment.source === 'system' ? 'Computer audio' : 'Microphone'} | ${segment.text}`).join('\n'); }
$('export-txt').addEventListener('click', () => download(exportText(), 'transcript.txt', 'text/plain')); $('export-json').addEventListener('click', () => download(JSON.stringify(segments, null, 2), 'transcript.json', 'application/json'));
function subtitle(kind) { const header = kind === 'vtt' ? 'WEBVTT\n\n' : ''; return header + segments.map((s, index) => `${kind === 'srt' ? `${index + 1}\n` : ''}${clock(s.start - s.sessionStartedAt)} --> ${clock(s.end - s.sessionStartedAt)}\n[${s.source === 'system' ? 'Computer audio' : 'Microphone'}] ${s.text}\n`).join('\n'); }
$('export-srt').addEventListener('click', () => download(subtitle('srt'), 'transcript.srt', 'text/plain')); $('export-vtt').addEventListener('click', () => download(subtitle('vtt'), 'transcript.vtt', 'text/vtt'));
async function refreshDiagnostics() { const estimate = await navigator.storage?.estimate?.(); const values = [['Browser', navigator.userAgent], ['WebGPU', navigator.gpu ? 'Available' : 'Unavailable'], ['WebAssembly', typeof WebAssembly === 'object' ? 'Available' : 'Unavailable'], ['Active model', activeModel ? findModel(activeModel).name : 'None'], ['Audio pipelines', pipelines.size], ['Storage use', estimate?.usage ? bytes(estimate.usage) : 'Not reported'], ['Storage quota', estimate?.quota ? bytes(estimate.quota) : 'Not reported'], ['Last error', 'None']]; ui.diagnostics.replaceChildren(...values.flatMap(([term, description]) => { const dt = document.createElement('dt'); dt.textContent = term; const dd = document.createElement('dd'); dd.textContent = description; return [dt, dd]; })); }
$('export-diagnostics').addEventListener('click', () => download(ui.diagnostics.innerText, 'local-browser-transcriber-diagnostics.txt', 'text/plain'));
initialise().catch((error) => failDownload(`Initialisation failed: ${error.message}`));
