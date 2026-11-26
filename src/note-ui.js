import { elapsedLabel } from './notes.js';

const el = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };
const icon = (path) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'note-icon'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', path); svg.append(p); return svg; };

/**
 * Add note and Screenshot with note, under the screen preview (Option 4 mockup).
 * getState() returns { recording, sharing, startedAt }; captureFrame() returns a screen frame;
 * saveNote({ text, shots }) stores the note and resolves to its time label.
 * All user text is set with textContent, never innerHTML.
 */
export function createNoteUi({ mount, getState, captureFrame, saveNote, showTranscript = () => {}, now = () => Date.now() }) {
  const status = el('p', { id: 'note-status', className: 'sr-only' }); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const openButton = el('button', { id: 'note-open', type: 'button' }, icon('M5 4h14v12H9l-4 4zM12 7v6M9 10h6'), el('span', { textContent: 'Add note' }));
  openButton.setAttribute('aria-expanded', 'false'); openButton.setAttribute('aria-controls', 'note-form'); openButton.setAttribute('aria-keyshortcuts', 'Alt+Shift+N');
  const shotButton = el('button', { id: 'note-screenshot', type: 'button' }, icon('M4 8h4l2-3h4l2 3h4v11H4z'), el('span', { textContent: 'Screenshot with note' }));
  shotButton.setAttribute('aria-keyshortcuts', 'Alt+Shift+S');
  const why = el('p', { id: 'note-screenshot-why', className: 'note-hint', hidden: true });
  const heading = el('h3', { id: 'note-form-heading', textContent: 'New note' });
  const hint = el('p', { id: 'note-form-hint', className: 'note-hint', textContent: 'Added to the transcript at the time you press Add note. Control or Command plus Enter adds. Escape cancels.' });
  const text = el('textarea', { id: 'note-text' }); text.setAttribute('aria-describedby', 'note-form-hint');
  const textLabel = el('label', { htmlFor: 'note-text' }, el('strong', { textContent: 'Note text' }));
  const thumbsHeading = el('h4', { id: 'note-shots-heading', textContent: 'Screenshots to add' });
  const thumbs = el('ul', { id: 'note-thumbs', className: 'note-thumbs' }); thumbs.setAttribute('aria-labelledby', 'note-shots-heading');
  const shotsBox = el('div', { id: 'note-shots', hidden: true }, thumbsHeading, thumbs);
  const addButton = el('button', { id: 'note-add', type: 'submit', className: 'primary-action', textContent: 'Add note' });
  const cancelButton = el('button', { id: 'note-cancel', type: 'button', textContent: 'Cancel' });
  const keep = el('input', { id: 'note-keep', type: 'checkbox' });
  const keepLabel = el('label', { className: 'note-keep' }, keep, ' Keep open for more notes');
  const form = el('form', { id: 'note-form', className: 'note-form', hidden: true }, heading, hint, textLabel, text, shotsBox, el('div', { className: 'note-row' }, addButton, cancelButton, keepLabel));
  form.noValidate = true; form.setAttribute('aria-labelledby', 'note-form-heading');
  const area = el('div', { id: 'note-area', className: 'note-area' }, el('div', { className: 'note-row' }, openButton, shotButton), why, form);
  mount.after(area); document.body.append(status); // outside the pane so announcements still work when Settings is open

  let shots = []; let busy = false; let lastReason;
  const say = (message) => { status.textContent = ''; setTimeout(() => { status.textContent = message; }, 50); };
  const isOpen = () => openButton.getAttribute('aria-expanded') === 'true';
  const reason = () => { const state = getState(); return !state.sharing ? 'no screen is being shared. Share a screen to turn it on.' : !state.recording ? 'no transcript is recording. Start recording to turn it on.' : ''; };

  function refresh() {
    const current = reason();
    shotButton.setAttribute('aria-disabled', String(Boolean(current)));
    if (current) shotButton.setAttribute('aria-describedby', why.id); else shotButton.removeAttribute('aria-describedby');
    why.hidden = !current; why.textContent = current ? `Screenshot with note is unavailable because ${current}` : '';
    if (lastReason !== undefined && current !== lastReason) say(current ? `Screenshot with note is unavailable because ${current}` : 'Screenshot with note is now available.');
    lastReason = current;
  }
  function drawThumbs() {
    thumbs.replaceChildren(); shotsBox.hidden = !shots.length;
    shots.forEach((shot, index) => {
      const number = index + 1; const image = el('img', { className: 'note-thumb', src: shot.url, alt: `Screenshot ${number} of the shared screen, captured at ${shot.label}` });
      const remove = el('button', { type: 'button', textContent: `Remove screenshot ${number}` });
      remove.addEventListener('click', () => { URL.revokeObjectURL(shot.url); shots.splice(index, 1); drawThumbs(); text.focus(); say(`Screenshot ${number} removed. ${shots.length} attached. Focus is on Note text.`); });
      thumbs.append(el('li', {}, image, remove));
    });
  }
  function clearShots() { shots.forEach((shot) => URL.revokeObjectURL(shot.url)); shots = []; drawThumbs(); }
  function expand() { form.hidden = false; openButton.setAttribute('aria-expanded', 'true'); text.focus(); }
  function collapse(focusButton = true) { form.hidden = true; openButton.setAttribute('aria-expanded', 'false'); text.value = ''; clearShots(); if (focusButton) openButton.focus(); }
  function open() { showTranscript(); if (isOpen()) text.focus(); else { expand(); say('Note form open.'); } }
  function discard() { const count = shots.length; collapse(true); say(`Note cancelled.${count ? ' Screenshot discarded.' : ''} Focus is on Add note.`); }

  async function capture() {
    const current = reason();
    if (current) { say(`Screenshot with note is unavailable because ${current}`); return; }
    if (busy) return;
    showTranscript(); if (!isOpen()) expand();
    busy = true;
    try {
      const frame = await captureFrame(); const at = now();
      shots.push({ frame, at, url: URL.createObjectURL(frame.blob), label: elapsedLabel(at - (getState().startedAt || at)) });
      drawThumbs(); text.focus();
      say('Screenshot captured. Add a note, or press Add note to save it without text.');
    } catch (error) { say(`Screenshot could not be captured. ${error.message}`); text.focus(); } finally { busy = false; }
  }
  async function add() {
    const value = text.value.trim();
    if (!value && !shots.length) { say('Note is empty. Nothing added.'); text.focus(); return; }
    if (busy) return;
    busy = true; const count = shots.length;
    try {
      const label = await saveNote({ text: value, shots });
      const message = `Note added at ${label}${count ? ` with ${count} screenshot${count === 1 ? '' : 's'}` : ''}.`;
      if (keep.checked) { text.value = ''; clearShots(); text.focus(); say(`${message} Form kept open.`); }
      else { collapse(true); say(`${message} Form closed. Focus is on Add note.`); }
    } catch (error) { say(`Note was not added. ${error.message}`); text.focus(); } finally { busy = false; }
  }

  openButton.addEventListener('click', () => { if (isOpen()) discard(); else open(); });
  shotButton.addEventListener('click', capture);
  cancelButton.addEventListener('click', discard);
  form.addEventListener('submit', (event) => { event.preventDefault(); add(); });
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); discard(); }
    else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); add(); }
  });
  // The physical key code is used because Option+Shift+N types a character on a Mac.
  document.addEventListener('keydown', (event) => {
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;
    if (event.code === 'KeyN') { event.preventDefault(); open(); } else if (event.code === 'KeyS') { event.preventDefault(); capture(); }
  });
  refresh();
  return { refresh };
}
