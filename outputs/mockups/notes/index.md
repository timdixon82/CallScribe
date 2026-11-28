# Notes mockups

Static HTML, open offline. Shared behaviour in all three: Alt+Shift+N adds or focuses the note box, Alt+Shift+S is Screenshot with note, Control or Command plus Enter adds, an empty note is refused with a spoken message, and a polite status region says "Note added at 00:24" (plus "with screenshot"). The shortcut works from Settings too.

Visual language follows `outputs/mockups/quick-start/option-2.html` (navy `#0c3b64` headings and buttons, 44px targets, 3px focus ring, icons always with visible text). `docs/brand.md` does not exist in this clone, so no brand-document citations were possible.

## Note in the transcript

An article labelled "Note at 00:24", with a solid navy badge reading "Note", a time element, the text, and an optional screenshot below. Meaning is in words, not colour alone. In exports each note is a line such as "[00:24] Note: text".

## Option 1: Notes card in Controls

Notes card under Quick start. Focus stays in the box after adding, which is cleared, for rapid notes. Trade-off: hidden when on Settings (shortcut switches back), and the box is far from the transcript.

## Option 2: Note bar under the transcript

Always-visible bar beneath the transcript, independent of the right tab. Focus stays in the box after adding. Trade-off: uses vertical space on the left, which Piece A just freed for the preview.

## Option 3: Popover

Modal dialog from an Add note button or the shortcut. After adding, it closes and focus returns to where the user was. Trade-off: hides the transcript while open, and a modal is heavier for fast notes.

## Option 4: Add note button under the preview, expanding in place

File: `option-4.html`. Tim's direction after rejecting options 1 to 3.

Layout, left column, top to bottom: Transcript heading, Shared screen preview card, a row with two buttons (Add note, Screenshot with note), the transcript entries. The right pane is unchanged.

Add note is a disclosure button: `aria-expanded` false or true, `aria-controls` pointing at the form. Activating it reveals a form directly below the button row and moves focus into the labelled "Note text" box. The form holds Add note (submit), Cancel, a thumbnail area (only when a screenshot exists), and a "Keep open for more notes" checkbox. Each control is at least 44px.

After Add: the note appears in the transcript at the current time as "Note", the form collapses, and focus returns to the Add note button. Reason: focus must never land on a hidden element, and a collapsed form with focus back on its trigger is the predictable disclosure pattern. For rapid notes, tick Keep open (off by default): the box clears and keeps focus, and the form stays open. Escape or Cancel discards the text, collapses, and returns focus to Add note. Empty notes are refused with a spoken message and focus stays in the box.

Screenshot with note (revised after Tim's feedback): the button exists only in the row under the preview, not inside the form. Pressing it captures the screenshot at once, opens the form if closed, shows a small thumbnail inside the form (under the Note text box) and moves focus to the Note text box. The thumbnail has alt text such as "Screenshot 1 of the shared screen, captured at 00:12" and its own "Remove screenshot 1" button. Polite announcement: "Screenshot captured. Add a note, or press Add note to save it without text." The user types a caption and presses Add note; the note is saved to the transcript with the thumbnail. A screenshot with an empty note is allowed (shown as "(No text)"); an empty note with no screenshot is still refused. Pressing the button again while the form is open adds another thumbnail (chosen over replacing, so nothing is lost silently); each has its own Remove button, and Remove returns focus to the Note text box. Cancel, Escape, or pressing the Add note button under the preview to close the form discards any screenshots and says "Note cancelled. Screenshot discarded. Focus is on Add note." With no screen shared the button uses `aria-disabled="true"` (stays focusable, dashed outline, grey) and is described by visible text: "Screenshot with note is unavailable because no screen is being shared. Share a screen to turn it on." Activating it speaks the same reason.

Polite status messages (`role="status"`): form open, note added at time (with screenshot), form closed, note cancelled, empty note, screen sharing started or stopped.

Shortcuts, work from anywhere including Settings: Alt+Shift+N opens the form and focuses the box (or focuses the box if already open). Alt+Shift+S: same as pressing Screenshot with note, so it captures at once, opens the form if needed, and focuses the Note text box. Both are declared with `aria-keyshortcuts`. The handler uses the physical key code because Option+Shift+N types a character on Mac.

Preview hidden because Settings is open: the preview card is removed, the button row moves up to sit directly under the Transcript heading, so Add note is always in the same place relative to the heading. Screenshot with note keeps working if a screen is shared, because it captures the stream, not the preview. The mockup has two checkboxes in the top bar to simulate screen sharing and the hidden preview; they are not part of the design.

Trade-off: the form pushes the transcript down while open, and Add note moves when the preview appears or disappears.

## Recommendation

Option 2. Shortcuts: Alt+Shift+N, Alt+Shift+S. Avoids Space, VoiceOver (Control+Option), JAWS (Insert or Caps Lock) and common browser keys. Verify on Mac Option+Shift+N, which types a character, so the handler uses the physical key code and prevents default.
