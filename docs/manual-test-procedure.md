# Manual Test Procedure

## Secure local launch

Run `npm install`, then `npm run dev`. Open the localhost address printed by Vite in Chrome or Edge. Do not open `index.html` using a file URL because browser media APIs require localhost or HTTPS.

## Mac validation

1. Use VoiceOver with Control+Option+Right Arrow to move through headings, model controls, audio-source controls, session controls, transcript controls, and diagnostics. Confirm every control has a meaningful name.
2. On a fresh site-data profile, wait for the Moonshine Base progress control. Confirm it announces preparation, meaningful 10 percent milestones where a total is known, completion, or a failure and Retry control.
3. Enable the microphone and speak after starting a session. Confirm the browser permission result and whether final transcript text appears.
4. Activate Share computer audio. In the browser dialogue, choose an audio-capable share surface only if it is offered. Record whether an audio track was reported; if not, confirm microphone-only operation remains possible.
5. Disconnect the network after a model reports ready, reload, and select the cached model. Confirm no model download is attempted and transcription can start.

## Windows validation

Repeat the Mac procedure in current stable Chrome and Edge on Windows 11, then repeat it with NVDA and Windows Narrator. For each share attempt, record browser version, selected share surface, whether an audio option was offered, whether the returned stream included audio, and any error text. Do not infer system-audio support from the presence of a share dialogue.

## Privacy check

Use the browser Network panel during an offline transcription session. Confirm there are no requests containing audio, transcript text, or session metadata. Initial model downloads are expected only before the model is cached.
