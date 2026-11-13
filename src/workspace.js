// Capture state is derived from connected live tracks, never from a checkbox alone.
export function captureState({ session, paused, modelReady, microphoneConnected, microphoneMuted, microphoneMessage = '', sharing, appAudioConnected, shareMessage = '', screenshotMode, ocrEnabled }) {
  const recording = Boolean(session) && !paused;
  const hasAudio = (microphoneConnected && !microphoneMuted) || appAudioConnected;
  return {
    transcription: session ? (paused ? 'Paused' : hasAudio ? 'Transcribing' : 'Recording — no included audio') : modelReady ? 'Ready to transcribe' : 'Preparing transcription',
    microphone: microphoneConnected ? (microphoneMuted ? 'Connected · Excluded from transcript' : recording ? 'Connected · Included in transcript' : 'Connected · Ready') : (/permission.*blocked/i.test(microphoneMessage) ? 'Permission blocked' : /unavailable/i.test(microphoneMessage) ? 'Audio unavailable — check microphone settings' : 'Disconnected'),
    appAudio: appAudioConnected ? (recording ? 'Connected · Included in transcript' : 'Connected · Ready') : sharing ? 'Screen shared — no app audio received' : shareMessage && !/off|No screen/i.test(shareMessage) ? shareMessage : 'Not connected',
    screenshots: !sharing || screenshotMode === 'audio' ? 'Off' : `${({ manual: 'Manual', periodic: 'Every interval', changes: 'When screen changes' })[screenshotMode]}${session ? paused ? ' · Paused' : '' : ' · Ready'}${ocrEnabled ? ' · Text recognition on' : ''}`,
    hasAudio,
  };
}

function details(id, title, ...children) {
  const element = document.createElement('details');
  element.id = id;
  element.className = 'workspace-details';
  const summary = document.createElement('summary');
  summary.textContent = title;
  element.append(summary, ...children);
  return element;
}

export function buildWorkspace({ ui, transcriptPanel, sessionActions, onShare }) {
  const capture = document.querySelector('.session-toolbar');
  capture.id = 'capture-panel';
  capture.setAttribute('aria-labelledby', 'session-heading');
  capture.tabIndex = -1;
  document.getElementById('session-heading').textContent = 'Capture and controls';
  document.querySelector('main > header h1')?.remove();
  // Keep a genuine page heading in addition to the two workspace headings.
  const pageHeading = document.createElement('h1');
  pageHeading.className = 'sr-only';
  pageHeading.textContent = 'CallScribe';
  document.querySelector('main > header').prepend(pageHeading);
  transcriptPanel.setAttribute('aria-labelledby', 'transcript-heading');
  transcriptPanel.tabIndex = -1;
  document.querySelector('.transcript-header').before(document.getElementById('transcript-heading'));

  const summary = document.createElement('div');
  summary.className = 'capture-summary';
  summary.innerHTML = '<p id="capture-state" class="capture-state"></p><p id="capture-elapsed" hidden></p><dl><div><dt>Microphone</dt><dd id="capture-microphone"></dd></div><div><dt>App audio</dt><dd id="capture-app-audio"></dd></div><div><dt>Screenshots</dt><dd id="capture-screenshots"></dd></div></dl><p id="capture-announcement" class="sr-only" role="status" aria-atomic="true"></p>';
  capture.querySelector('h2').after(summary, sessionActions, ui['app-status'], ui['session-status']);
  ui['app-status'].classList.remove('sr-only');
  const micHelp = document.createElement('p');
  micHelp.className = 'capture-help';
  micHelp.id = 'microphone-exclusion-help';
  micHelp.textContent = 'Excluding the microphone affects this transcript only. It does not mute you in your meeting app.';
  sessionActions.after(micHelp);
  sessionActions.querySelector('[data-transcript-mic-mute]').setAttribute('aria-describedby', micHelp.id);
  sessionActions.setAttribute('role', 'group');
  sessionActions.setAttribute('aria-label', 'Transcription controls');
  ui['start-session'].classList.add('primary-action');
  // The original controls remain the only controls, retaining their event handlers.
  ui['new-session'].classList.add('secondary-action');
  ui['pause-session'].setAttribute('aria-keyshortcuts', 'Space');
  ui['pause-session'].setAttribute('aria-label', 'Pause transcription. Shortcut: Space');
  ui['new-session'].querySelector('.button-label').textContent = 'New transcript';
  sessionActions.append(ui['new-session']);

  const modelPicker = document.querySelector('.model-picker');
  const language = document.getElementById('language-control');
  const modelDetails = document.getElementById('model-settings-section');
  const recognition = details('recognition-settings', 'Recognition model and downloads', modelPicker, modelDetails);
  capture.append(language, recognition);
  // Progress stays visible alongside Record even when advanced settings are closed.
  ui['app-status'].after(ui['model-download-status']);
  const speakerToggle = ui['enable-speaker-separation'].closest('label');
  const processing = document.getElementById('voice-settings-section');
  processing.querySelector('summary').textContent = 'Voice processing and speaker separation';
  processing.querySelector('summary').after(speakerToggle, ui['speaker-model-status']);
  const micLabel = ui['enable-microphone'].closest('label');
  micLabel.querySelector('.toggle-text').textContent = 'Connect mic';
  ui['enable-microphone'].setAttribute('aria-label', 'Connect microphone');
  ui['microphone-status'].classList.remove('sr-only');

  const screenSettings = document.querySelector('.screen-capture-settings');
  screenSettings.querySelector('legend').textContent = 'Screen and app audio';
  screenSettings.querySelector('.screen-audio-note').textContent = 'Choose a tab, window or screen in the browser dialog. Select its audio when available to transcribe other participants.';
  ui['share-system-audio'].closest('label').hidden = true;
  const shareButton = document.createElement('button');
  shareButton.id = 'connect-app-audio';
  shareButton.type = 'button';
  shareButton.textContent = 'Share screen and audio';
  shareButton.addEventListener('click', onShare);
  ui['share-system-audio'].closest('label').after(shareButton);
  ui['system-audio-status'].classList.remove('sr-only');
  const fields = document.querySelector('.screen-capture-fields');
  const screenshotSettings = details('screenshot-settings', 'Screenshot settings', fields, ui['ocr-status'], document.getElementById('ocr-download-status'), ui['screenshot-warning']);
  const preview = details('screen-preview', 'Shared screen preview');
  const previewContent = document.createElement('div');
  previewContent.id = 'screen-preview-content';
  preview.append(previewContent);
  screenSettings.append(screenshotSettings, preview);
  capture.insertBefore(document.querySelector('.top-sources'), language);
  capture.insertBefore(screenSettings, language);
  // No duplicate action row below the transcript or inside sharing settings.
  document.getElementById('transcript-session-actions').remove();
  document.getElementById('screen-capture-manual-actions').remove();

  const notes = document.getElementById('meeting-notes-panel');
  const notesDetails = details('meeting-notes-disclosure', 'Meeting notes');
  notes.before(notesDetails);
  notesDetails.append(notes);
  const notesHeading = document.getElementById('meeting-notes-heading');
  const h3 = document.createElement('h3');
  h3.id = notesHeading.id;
  h3.textContent = notesHeading.textContent;
  notesHeading.replaceWith(h3);
  transcriptPanel.append(notesDetails);

  const workspace = document.createElement('div');
  workspace.className = 'capture-workspace';
  capture.before(workspace);
  workspace.append(capture, transcriptPanel);
  const shortcuts = document.querySelector('.skip-link');
  shortcuts.textContent = 'Skip to capture controls';
  shortcuts.href = '#capture-panel';
  const transcriptLink = shortcuts.cloneNode(true);
  transcriptLink.textContent = 'Skip to transcript';
  transcriptLink.href = '#transcript-panel';
  shortcuts.after(transcriptLink);
  const jumpLinks = document.createElement('nav');
  jumpLinks.className = 'workspace-navigation';
  jumpLinks.setAttribute('aria-label', 'Workspace');
  jumpLinks.innerHTML = '<a href="#capture-panel">Capture controls</a><a href="#transcript-panel">Transcript</a>';
  workspace.before(jumpLinks);
  // Native anchors plus an explicit focus target work for keyboard and AT navigation.
  document.querySelectorAll('a[href="#capture-panel"], a[href="#transcript-panel"]').forEach((link) => link.addEventListener('click', () => document.querySelector(link.getAttribute('href')).focus()));
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element && element.textContent !== value) element.textContent = value;
}

export function updateWorkspace(state, { session, ui, screenshotMode, ocrEnabled, sharing }) {
  if (!document.getElementById('capture-state')) return;
  setText('capture-state', state.transcription);
  setText('capture-microphone', state.microphone);
  setText('capture-app-audio', state.appAudio);
  setText('capture-screenshots', state.screenshots);
  // Elapsed time is visible but excluded from live announcements.
  const elapsed = document.getElementById('capture-elapsed');
  elapsed.hidden = !session;
  if (session) { const seconds = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)); setText('capture-elapsed', `Elapsed ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`); }
  setText('capture-announcement', `${state.transcription}. Microphone: ${state.microphone}. App audio: ${state.appAudio}. Screenshots: ${state.screenshots}.`);
  const shareButton = document.getElementById('connect-app-audio');
  shareButton.disabled = ui['share-system-audio'].disabled;
  setText('connect-app-audio', sharing ? 'Stop sharing screen and audio' : 'Share screen and audio');
  document.getElementById('screenshot-settings').hidden = !sharing;
  document.getElementById('screen-preview').hidden = !sharing;
  ui['screenshot-interval'].parentElement.hidden = !['periodic', 'changes'].includes(screenshotMode);
  ui['toggle-ocr'].closest('label').hidden = screenshotMode === 'audio';
  document.getElementById('ocr-processing-detail').parentElement.hidden = screenshotMode === 'audio' || !ocrEnabled;
  const mute = document.querySelector('[data-transcript-mic-mute]');
  const previewTrack = document.querySelector('#screen-preview video');
  const source = previewTrack?.srcObject?.getVideoTracks()[0]?.label;
  const previewLabel = source ? `Shared screen preview: ${source}` : 'Shared screen preview';
  const previewSummary = document.querySelector('#screen-preview > summary');
  if (previewSummary.textContent !== previewLabel) previewSummary.textContent = previewLabel;
  if (mute) mute.disabled = !ui['enable-microphone'].checked;
}
