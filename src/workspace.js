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
  // Workspace actions always display their labels.
  ui['toggle-button-labels'].remove();
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
  summary.innerHTML = `<p id="capture-state" class="capture-state"></p><p id="capture-elapsed" hidden></p>
    <dl>
      <div><dt>Microphone</dt><dd><span id="capture-microphone"></span><label class="sr-only" for="quick-microphone-select">Select microphone</label><select id="quick-microphone-select" aria-label="Select microphone"></select><a class="capture-source-link" href="#microphone-select">Microphone settings</a></dd></div>
      <div><dt>App audio</dt><dd><span id="capture-app-audio"></span><button id="summary-share-screen" class="capture-source-action" type="button">Share screen and audio</button></dd></div>
      <div><dt>Screenshots</dt><dd><span id="capture-screenshots"></span><a id="summary-screenshot-settings" class="capture-source-link" href="#connect-app-audio">Set up screenshots</a></dd></div>
    </dl>
    <p id="capture-announcement" class="sr-only" role="status" aria-atomic="true"></p>`;
  capture.querySelector('h2').after(summary, sessionActions, ui['app-status'], ui['session-status']);
  capture.querySelector('h2').before(summary.querySelector('#capture-state'));
  document.getElementById('capture-state').hidden = true;
  const quickHeading = document.createElement('h3'); quickHeading.textContent = 'Quick start';
  summary.prepend(quickHeading);
  ui['app-status'].classList.remove('sr-only');
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
  const recognition = document.createElement('div');
  recognition.id = 'recognition-settings';
  recognition.append(modelPicker, language, modelDetails);
  capture.append(recognition);
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
  screenSettings.id = 'screen-audio-settings';
  screenSettings.querySelector('legend').textContent = 'Screen and app audio';
  screenSettings.querySelector('.screen-audio-note').textContent = 'Choose a tab, window or screen in the browser dialog. Select its audio when available to transcribe other participants. Share a screen first to enable screenshot settings.';
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
  const preview = document.createElement('div');
  preview.id = 'screen-preview';
  const previewHeading = document.createElement('h3');
  previewHeading.textContent = 'Shared screen preview';
  const previewContent = document.createElement('div');
  previewContent.id = 'screen-preview-content';
  preview.append(previewHeading, previewContent);
  screenSettings.append(screenshotSettings);
  capture.append(preview);
  function setupTabs() {
  const tabList = document.createElement('div');
  tabList.className = 'capture-tabs';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Capture workspace');
  const controlsPanel = document.createElement('div');
  controlsPanel.id = 'capture-controls-tabpanel';
  const settingsPanel = document.createElement('div');
  settingsPanel.id = 'capture-settings-tabpanel';
  const fixed = [document.getElementById('capture-state'), document.getElementById('session-heading')];
  controlsPanel.append(...[...capture.children].filter(node => !fixed.includes(node) && node !== settingsNavigation));
  settingsPanel.append(settingsNavigation);
  const tabs = [];
  function selectTab(index, focus = false) {
    tabs.forEach((tab, tabIndex) => {
      const selected = tabIndex === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tabs[index].focus();
  }
  for (const [index, [label, panel]] of [['Controls', controlsPanel], ['Settings', settingsPanel]].entries()) {
    const tab = document.createElement('button'); tab.type = 'button';
    tab.id = `capture-tab-${index}`; tab.textContent = label;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => selectTab(index));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1 - index : null;
      if (next !== null) { event.preventDefault(); selectTab(next, true); }
    });
    tabs.push(tab); tabList.append(tab);
  }
  capture.append(tabList, controlsPanel, settingsPanel);
  capture.addEventListener('recording-started', () => { selectTab(0); showPane(transcriptPanel, false); });
  selectTab(0);
  return selectTab;
  }
  // Summary shortcuts move real keyboard focus, rather than only scrolling the page.
  const quickMicrophone = summary.querySelector('#quick-microphone-select');
  quickMicrophone.addEventListener('change', () => { ui['microphone-select'].value = quickMicrophone.value; ui['microphone-select'].dispatchEvent(new Event('change', { bubbles: true })); if (!ui['enable-microphone'].checked) ui['enable-microphone'].click(); });
  const quickShare = document.getElementById('summary-share-screen');
  quickShare.addEventListener('click', () => {
    shareButton.click();
  });
  document.getElementById('summary-screenshot-settings').addEventListener('click', (event) => {
    event.preventDefault();
    showPane(captureSettings);
  });
  capture.insertBefore(document.querySelector('.top-sources'), recognition);
  capture.insertBefore(screenSettings, recognition);
  // No duplicate action row below the transcript or inside sharing settings.
  document.getElementById('transcript-session-actions').remove();
  document.getElementById('screen-capture-manual-actions').remove();

  const notes = document.getElementById('meeting-notes-panel');
  const notesHeading = document.getElementById('meeting-notes-heading');
  const h2 = document.createElement('h2');
  h2.id = notesHeading.id;
  h2.textContent = 'Summary';
  notesHeading.replaceWith(h2);
  const notesSettings = document.createElement('details');
  notesSettings.id = 'workspace-notes-settings';
  const notesSettingsHeading = document.createElement('summary'); notesSettingsHeading.textContent = 'Summary options';
  const options = [...notes.children].filter(node => node.matches('.meeting-notes-controls, #minutes-customisation'));
  notesSettings.append(notesSettingsHeading, ...options);
  notesSettings.open = true;
  h2.after(notesSettings);
  ui['generate-minutes'].textContent = 'Generate Summary';
  ui['cancel-minutes'].textContent = 'Stop generation';
  ui['regenerate-minutes'].textContent = 'Regenerate Summary';
  ui['save-minutes'].textContent = 'Save Summary';
  ui['export-minutes'].textContent = 'Export Summary';
  notes.querySelector('label[for="minutes-content"]').textContent = 'Summary';
  notes.querySelector('label[for="minutes-title"]').textContent = 'Summary title';
  notes.querySelector('label[for="minutes-export-format"]').textContent = 'Export Summary';
  document.getElementById('minutes-customisation').querySelector('summary').textContent = 'Advanced options';

  const workspace = document.createElement('div');
  workspace.className = 'capture-workspace';
  capture.before(workspace);
  const rightPane = document.createElement('div');
  rightPane.className = 'workspace-right-pane';
  const settings = document.createElement('section');
  settings.id = 'workspace-settings';
  const heading = document.createElement('h2');
  heading.textContent = 'Transcription settings';
  const settingsFields = document.createElement('fieldset');
  settingsFields.id = 'workspace-settings-fields';
  const legend = document.createElement('legend');
  legend.textContent = 'Recording configuration';
  settingsFields.append(legend, recognition, document.querySelector('.processing-controls'), processing);
  // One settings surface; only optional technical download details stay collapsed.
  const processingHeading = document.createElement('h3');
  processingHeading.textContent = 'Voice processing and speaker separation';
  processing.replaceWith(...[...processing.children].filter(node => node.tagName !== 'SUMMARY'));
  settingsFields.insertBefore(processingHeading, speakerToggle);
  const screenshotHeading = document.createElement('h3');
  screenshotHeading.textContent = 'Screenshots';
  settings.append(heading, settingsFields);
  const captureSettings = document.createElement('section');
  captureSettings.id = 'workspace-capture-settings';
  const captureHeading = document.createElement('h2'); captureHeading.textContent = 'Capture Settings';
  captureSettings.append(captureHeading, document.querySelector('.top-sources'), screenSettings);
  screenshotSettings.replaceWith(screenshotHeading, ...[...screenshotSettings.children].filter(node => node.tagName !== 'SUMMARY'));
  function expandPage(id, title) {
    const original = document.getElementById(id);
    const page = document.createElement('section'); page.id = id;
    const titleElement = document.createElement('h2'); titleElement.textContent = title;
    page.append(titleElement, ...[...original.children].filter(node => node.tagName !== 'SUMMARY'));
    original.replaceWith(page); return page;
  }
  const people = expandPage('people-section', 'People and Speaker Labels');
  const history = expandPage('history-section', 'Prior Sessions');
  const diagnostics = expandPage('diagnostics-panel', 'Diagnostics');
  const views = [transcriptPanel, settings, captureSettings, notes, people, history, diagnostics];
  rightPane.append(...views);
  workspace.append(capture, rightPane);
  const documentTabs = document.createElement('div');
  documentTabs.className = 'capture-tabs'; documentTabs.setAttribute('role', 'tablist');
  documentTabs.setAttribute('aria-label', 'Meeting documents');
  const documentButtons = [];
  for (const [index, [label, pane]] of [['Transcript', transcriptPanel], ['Summary', notes]].entries()) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.textContent = label;
    tab.id = `document-tab-${index}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', pane.id);
    pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => showPane(pane, false));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const available = documentButtons.filter(button => !button.hidden);
      const next = event.key === 'Home' ? available[0] : event.key === 'End' ? available.at(-1) : available[(available.indexOf(tab) + 1) % available.length];
      next.click(); next.focus();
    });
    documentButtons.push(tab); documentTabs.append(tab);
  }
  rightPane.prepend(documentTabs);
  function showPane(pane, focus = true) {
    for (const view of views) view.hidden = view !== pane;
    documentTabs.hidden = pane !== transcriptPanel && pane !== notes;
    documentButtons.forEach((tab, index) => { const selected = pane === (index === 0 ? transcriptPanel : notes); tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
    if (focus) { const title = pane.querySelector('h2'); title.tabIndex = -1; title.focus(); }
  }
  let wasGenerating = false;
  new MutationObserver(() => {
    const busy = notes.getAttribute('aria-busy') === 'true';
    if (busy) notesSettings.open = false;
    if (wasGenerating && !busy) {
      const stopped = /cancelled|failed|could not/i.test(ui['minutes-status'].textContent);
      if (stopped) notesSettings.open = true;
      else if (!ui['minutes-editor'].hidden) {
        showPane(notes, false);
        notesSettings.open = false;
        ui['minutes-editor'].scrollIntoView({ block: 'nearest' });
      } else notesSettings.open = true;
    }
    wasGenerating = busy;
  }).observe(notes, { attributes: true, attributeFilter: ['aria-busy'] });
  history.addEventListener('click', event => {
    if (event.target.closest('button')?.textContent === 'Open' && ui['stop-session'].disabled) showPane(transcriptPanel);
  });
  notes.addEventListener('click', event => {
    if (event.target.closest('#minutes-evidence button')) showPane(transcriptPanel, false);
  }, true);
  for (const pane of views.filter(view => view !== transcriptPanel && view !== notes)) {
    const back = document.createElement('button');
    back.type = 'button'; back.textContent = 'Back to transcript';
    back.addEventListener('click', () => showPane(transcriptPanel));
    pane.prepend(back);
  }
  const settingsButton = document.createElement('button');
  settingsButton.id = 'open-workspace-settings'; settingsButton.type = 'button';
  settingsButton.textContent = 'Transcription Settings';
  settingsButton.addEventListener('click', () => showPane(settings));
  const settingsNavigation = document.createElement('nav');
  settingsNavigation.className = 'settings-navigation'; settingsNavigation.setAttribute('aria-label', 'Settings and saved sessions');
  capture.append(settingsNavigation);
  settingsNavigation.append(settingsButton);
  const notesButton = document.createElement('button');
  notesButton.id = 'control-generate-minutes'; notesButton.type = 'button';
  notesButton.textContent = 'Generate Summary'; notesButton.disabled = true;
  notesButton.addEventListener('click', () => { showPane(notes); ui['generate-minutes'].click(); });
  sessionActions.append(notesButton);
  for (const [label, pane] of [['Capture Settings', captureSettings], ['People and Speaker Labels', people], ['Prior Sessions', history], ['Diagnostics', diagnostics]]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => showPane(pane)); settingsNavigation.append(button);
  }
  capture.append(preview);
  const selectTab = setupTabs();
  showPane(transcriptPanel, false);
  summary.querySelector('a[href="#microphone-select"]').addEventListener('click', (event) => { event.preventDefault(); showPane(captureSettings); focusCaptureControl(ui['microphone-select']); });
  const screenLink = document.createElement('a'); screenLink.href = '#screen-audio-settings'; screenLink.className = 'capture-source-link'; screenLink.textContent = 'Screen capture settings';
  screenLink.addEventListener('click', event => { event.preventDefault(); showPane(captureSettings); }); quickShare.after(screenLink);
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
  document.querySelectorAll('a[href="#capture-panel"], a[href="#transcript-panel"]').forEach((link) => link.addEventListener('click', () => { if (link.getAttribute('href') === '#transcript-panel') showPane(transcriptPanel, false); else selectTab(0); document.querySelector(link.getAttribute('href')).focus(); }));
}

function focusCaptureControl(control) {
  // Revealing ancestors keeps these shortcuts useful if settings gain more disclosures.
  for (let parent = control.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
  control.focus({ preventScroll: true });
  control.scrollIntoView({ block: 'center', behavior: 'auto' });
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element && element.textContent !== value) element.textContent = value;
}

export function updateWorkspace(state, { session, ui, screenshotMode, ocrEnabled, sharing, canGenerateNotes = false }) {
  if (!document.getElementById('capture-state')) return;
  const capture = document.getElementById('capture-panel');
  if (session && capture.dataset.recording !== 'true') capture.dispatchEvent(new Event('recording-started'));
  capture.dataset.recording = String(Boolean(session));
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
  document.getElementById('summary-share-screen').disabled = shareButton.disabled;
  setText('summary-share-screen', sharing ? 'Stop sharing screen and audio' : 'Share screen and audio');
  const quickMicrophone = document.getElementById('quick-microphone-select');
  const options = [...ui['microphone-select'].options];
  if (quickMicrophone.innerHTML !== ui['microphone-select'].innerHTML) quickMicrophone.replaceChildren(...options.map(option => option.cloneNode(true)));
  quickMicrophone.value = ui['microphone-select'].value;
  quickMicrophone.disabled = ui['microphone-select'].disabled;
  const screenshotLink = document.getElementById('summary-screenshot-settings');
  setText('summary-screenshot-settings', sharing ? 'Screenshot settings' : 'Set up screenshots');
  screenshotLink.href = sharing ? '#screenshot-mode' : '#connect-app-audio';
  setText('connect-app-audio', sharing ? 'Stop sharing screen and audio' : 'Share screen and audio');
  document.getElementById('screen-preview').hidden = !sharing;
  document.getElementById('workspace-settings-fields').disabled = Boolean(session);
  ui['generate-minutes'].disabled = !canGenerateNotes;
  ui['regenerate-minutes'].disabled = !canGenerateNotes;
  document.getElementById('control-generate-minutes').disabled = !canGenerateNotes;
  document.querySelectorAll('#workspace-notes-settings .meeting-notes-controls select, #minutes-customisation select, #minutes-customisation input, #minutes-customisation button').forEach(control => { control.disabled = Boolean(session); });
  ui['screenshot-interval'].parentElement.hidden = !['periodic', 'changes'].includes(screenshotMode);
  ui['toggle-ocr'].closest('label').hidden = screenshotMode === 'audio';
  document.getElementById('ocr-processing-detail').parentElement.hidden = screenshotMode === 'audio' || !ocrEnabled;
  const mute = document.querySelector('[data-transcript-mic-mute]');
  if (mute) mute.disabled = !ui['enable-microphone'].checked;
}
