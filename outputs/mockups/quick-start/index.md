# Quick start mockup options

Three static HTML prototypes. Open each in a browser; no network needed. They share the same page frame.

## Shared frame

- Left side, top to bottom: Transcript heading, Shared screen preview (moved up, directly under the heading), then transcript lines.
- Right side: a two-button tab list, Controls and Settings, then a pane heading and the pane content. Choosing a tab (or Left and Right arrow keys) swaps the pane and moves focus to the pane heading. There is no Back to transcript button.
- Every icon is decorative and paired with visible text. State is always written in words, never colour alone.
- Styling uses the colour variables in `src/style.css` (navy `#0c3b64` on white, about 11 to 1; muted text `#405166` on white, about 8.5 to 1). Targets are at least 44 by 44 pixels. Focus is a 3 pixel navy outline with a white halo. Note: `docs/brand.md` does not exist in this repository, so these follow the existing stylesheet.

## Option 1: Action toolbar

Inside the Quick start card, one wrapping row of four icon and text buttons: Record, Share screen and audio, Screenshot, New transcript. Below it, a labelled Microphone select and one status sentence.

## Option 2: Source rows

Record and New transcript sit in a row at the top. Below, three rows, each with a name, its state in words and its action: Microphone (select), App audio (Share screen and audio), Screenshots (Take screenshot, disabled until a screen is shared).

## Option 3: Record bar with sources disclosure

A large Record button and New transcript, then one status sentence. A "Sources and screenshots" disclosure holds the microphone select, Share screen and audio, and Take screenshot. Most compact when closed.
