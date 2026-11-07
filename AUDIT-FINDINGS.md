# Voice-engine audit findings

Date: 2026-11-07

Documentation only. No application code, configuration, or fixes are included. Recommendations below are for review and testing.

## How this was inspected

Two different sources were read. They are not the same tree.

| Source | What it is | What it is not |
| --- | --- | --- |
| Profile repo `main` `867a8cb200d7e2e409c33aba6b5077ef3ccbdd7c` (“Publish site from 95a1535”) | Static site. Embeds the voice demo in an iframe. | Does not contain the voice engine. |
| Live page `https://olive-swan-965506.hostingersite.com/` | Served voice page. `Last-Modified: Fri, 06 Nov 2026 21:15:32 GMT`. Scripts: `ring/lab.js?v=20261106d`, `ring/ring.js?v=20261106u`, `ring/text.js?v=20261106v`, `ring/lab.css?v=20261106d`. | Not a git commit in this repository. Line numbers below are that served HTML and those served files. |

Validation was static. The microphone was not opened. No WebSocket was opened. `token.php`, `chat.php`, `stt.php`, `tts.php`, and `cache.php` were not called. No paid provider call was made. Threshold behavior in a real room was not measured. Anything that needs a live call is marked as a hypothesis or a proposed test.

There is no “responsibilities” section in either source. The profile page only mounts and unloads the demo. Detection, turn-taking, cancel, and playback live in the served voice page.

The voice engine is hosted separately from this repo. A fix to barge-in, the silence gap, or playback cancel has to be made in that Hostinger app (comment in `app.js` points at a `javed-app` tree that is not in `main`). Changing only this repository will not change those behaviors.

## Profile shell (this repo)

Evidence from `main` `867a8cb`:

- `app.js` lines 324–333. `ASK_BASE` is the Hostinger origin. The voice card sets the iframe to that origin. Closing the dialog sets the iframe to `about:blank`, which drops the microphone and audio by unloading the page.
- `index.html` lines 156–158. The iframe allows `microphone` and `autoplay`. The profile page passes no interrupt, gap, or gate settings.
- `app.js` lines 417–437. The local name `voice` is a one-at-a-time sound-effect buffer. It is not the assistant.

No voiceprint, barge-in, or speech-end logic exists in this repo.

## Prioritized bugs

Interruption findings 1–3 stay separate. They share `sampleMic` and `stopAll`, and they fail at different steps. A fourth symptom follows them and does not replace them.

### 1. Loudness-based detection can miss speech and mistake noise for speech

**Mechanism (served page, evidence).** The detector is a browser RMS test in `sampleMic` (inline script, about lines 765–800). Searches of the served HTML, `ring/lab.js`, `ring/ring.js`, and `ring/text.js` found no voiceprint, speaker id, or separate VAD library.

`getUserMedia` (about lines 917–918) always requests echo cancellation, noise suppression, and auto gain. The headphones checkbox does not turn those browser flags off.

The interrupt switch is on and hidden. `#loudbarge`, “Interrupt when I speak up”, is checked (about line 59). `#barge`, “Headphones (skip echo filter)”, is unchecked (about line 58). `#hold`, “Hold to talk”, is unchecked (about line 65). `ring/lab.css` line 2 hides every `[data-lab-only]` element unless `data-lab` is set. The settings block (about lines 55–69), including that switch, is `data-lab-only`. `ring/lab.js` turns lab mode on only for `?lab` or `localStorage` key `javed-lab`. The profile iframe does not pass `?lab`. The checked default still drives `sampleMic`. Visitors cannot see or change it.

Default speaker path (about lines 771–784):

- The loudness test runs only while `botBusy()` is true and `sources.length` is non-zero (`talking`).
- Desktop: level must stay at or above 3 times the learned echo floor, and at least 0.03 RMS, for 250 ms. Grace before this can fire is 800 ms.
- Phones and tablets (`pointer: coarse`): 5 times, 400 ms, grace 1500 ms.
- A frame that passes the interrupt line does not change `echoFloor`. A frame that fails sets `bargeSince` to 0 and then updates `echoFloor`. The branch structure for a multi-second attempt is traced in the symptom subsection after finding 3.

While the assistant turn is busy and headphones mode is off, about line 786 discards any recording that overlaps playback. Speech during thinking, or in a gap between audio chunks, is not on the loudness path (`talking` is false because `sources` is empty) and is discarded because the turn is still busy. The opening grace does not interrupt. It updates the echo floor, so speech at the start of a reply can raise the floor the rest of the reply must beat.

Headphones mode (about lines 786–791) is a different rule and is off in the public demo: one frame at or above `gate()` stops speech. `gate()` (about line 745) is 0.01 RMS until the first accepted sentence, then 20% of 70% of that sentence’s peak (about lines 853–854). The 20% control is `#gate` (about line 63).

**Hypothesis, not measured.** Which miss shows up depends on the room and on how hard the browser echo canceller works. Conversational speech with syllable dips matches missed interrupts, because the timer resets every quiet frame and the floor can rise during the grace. A steady non-speech sound that holds 3× (or 5×) for the hold time matches a false “speech” decision. This audit did not record a call, so it does not claim which regime a given device is in.

**Proposed tests.** Desktop speaker, lab mode on so the controls are visible. Speak a normal sentence over a reply and record whether the 250 ms timer resets on dips. Hold a steady non-speech sound above the floor for more than 250 ms and record whether the detector treats it as speech. Repeat on a phone speaker and confirm the 5× / 400 ms / 1500 ms rule. During the first 800 ms of a reply (1500 ms on a phone), speak and confirm the floor rises and the reply continues. Speak during thinking, before the first audio node, and during a gap between chunks, and confirm that audio is discarded. Uncheck “Interrupt when I speak up” in lab mode and confirm this detector no longer fires. Reload the public iframe without `?lab` and confirm the control is hidden while the checked default still applies.

### 2. Noise stops playback before transcription confirms it

**Mechanism (served page, evidence).** When the loudness test in subsection 1 holds long enough, `sampleMic` (about lines 778–779) calls `stopAll()` immediately, then starts a new recording. `stopAll` (about lines 607–623) aborts the chat fetch, aborts Arabic TTS, sends Cartesia `{ context_id, cancel: true }`, stops scheduled buffers, and clears `sources` and `nextTime`. `transcribe` (about lines 836–866) runs only after `MediaRecorder` stops. The flush does not wait for `stt.php` or for the two-word check. `softFail` (about lines 185–190) can let audio that already arrived finish after a provider hiccup. This barge path does not use `softFail`.

**Hypothesis, not measured.** A noise spike that satisfies subsection 1 will cut the reply off before anyone knows whether the clip was speech. That ordering is in the source. It was not played back in a live call.

**Proposed tests.** Trip the loudness rule with a non-speech sound. Confirm playback and generation stop in the same turn as the detector, and that the transcript request is still in flight or has not started. Confirm a later transcript rejection does not undo that stop (subsection 3).

### 3. Rejected recordings do not resume the reply

**Mechanism (served page, evidence).** After the stop in subsection 2, `transcribe` can still reject the clip. A clip under 120 ms of voiced audio is dropped in `recorder.onstop` (about line 818). A transcript under two words is dropped (about line 851). Both paths return without restoring `sources`, `nextTime`, or the Cartesia context. No resume function exists. The reply that `stopAll` cleared stays cleared.

**Hypothesis, not measured.** False stops that transcription would have discarded still leave the assistant silent. That follows from the two return paths. It was not observed in a live call.

**Proposed tests.** Force a barge with a short noise burst under 120 ms of voiced audio, and another that transcribes to fewer than two words. Confirm both rejections leave the interrupted reply stopped, with no replay of the cleared buffers.

### No interruption despite more than three seconds of speech

**Symptom.** The visitor spoke for more than three seconds in order to interrupt, and the assistant did not stop. This was not reproduced in a traced call. No level log, device log, or checkbox state from that attempt was available. The incident’s root cause is unconfirmed. The served source does confirm several paths on which more than three seconds of speech never calls `stopAll`.

**Where the code lives.** `main` `867a8cb` and this branch do not contain `sampleMic`. Both only open the Hostinger iframe (`app.js` lines 324–333, `index.html` lines 156–158). The trace is the served voice page, `Last-Modified: Fri, 06 Nov 2026 21:15:32 GMT`, inline `sampleMic` (about lines 765–801), `playBuffer` (about lines 430–451), `botBusy` (about line 744), and `getUserMedia` (about lines 917–922).

**Two different gates.** `echoFloor` is the speaker-barge gate. `helloLevel` is not. `helloLevel` (about lines 853–854) is peak RMS of the first accepted sentence times 0.7, and `gate()` (about line 745) is 20% of that, or 0.01 before any sentence. That gate only starts a normal recording in the branch that runs when the assistant is not blocking the mic (about lines 788–791). While a voice reply is active, headphones are off, and hold-to-talk is off, `blocked` is true (about line 786) and `discardRecording()` runs (about line 787). Overlapping audio is thrown away and never becomes an interrupt by the `helloLevel` rule. The only default interrupt is the `echoFloor` test below.

**What must stay true on one stretch of frames.** `stopAll` from this path runs only inside `sampleMic`, and only when all of the following hold on the frames being sampled:

- `talking` is true: `botBusy()` and `sources.length` are both true (about line 771). `botBusy` is an active voice turn that is not cancelled and not marked spoken. `sources` holds audio nodes already scheduled. Thinking before the first node, and any gap after `src.onended` removes a node (about line 448) and before the next `playBuffer` pushes one (about line 447), makes `talking` false.
- `#loudbarge` is checked, `#barge` (headphones) is not, and `holding` is false (about line 772). Shipped HTML defaults match that: loud barge checked (about line 59), headphones unchecked (about line 58), hold unchecked (about line 65). The public iframe hides those controls (`ring/lab.css` line 2) but still reads them. A lab session that changed them was not visible in this report.
- Grace has ended: `now - (turn.audioStart || now) > grace` (about line 776). Desktop grace is 800 ms. A coarse pointer (phone or tablet, about line 739) uses 1500 ms. `audioStart` is set when the first buffer is scheduled (about line 451), not when the speaker is first heard. If `audioStart` is missing, `now - now` is 0, the comparison fails, and this arm never passes.
- `echoFloor` is already non-zero, and `level >= Math.max(echoFloor * ratio, 0.03)`. Desktop ratio is 3. Phone ratio is 5. The 0.03 figure is an absolute RMS floor on the analyser, whose `fftSize` is 1024 (about line 922).
- Those passing frames are contiguous for more than `hold`: 250 ms desktop, 400 ms phone (about line 778, strict `>`).

**Three seconds is not that timer.** `sampleMic` schedules itself with `requestAnimationFrame` (about line 800). Each callback computes one RMS and then either keeps or zeros `bargeSince`. The first passing frame sets `bargeSince` to `now` (`bargeSince = bargeSince || now`, about line 777), so the hold is measured from that frame, not from the start of the utterance. The next failing frame takes the other branch and sets `bargeSince = 0` (about line 782). Nothing adds up voiced time across failures. A person can speak for more than three seconds, with dips, syllable gaps, or source gaps, and never collect more than 250 ms (desktop) or 400 ms (phone) of consecutive passing frames.

**Floor updates on the failing branch, not while the interrupt line is held.** About lines 776–784 are an if/else. The pass arm, the one that can reach `stopAll`, does not assign `echoFloor`. The else arm does, and it also clears `bargeSince`. In that else: a zero floor becomes the current `level`; if `level` is above the floor, the floor becomes `echoFloor * 0.7 + level * 0.3`; otherwise `echoFloor * 0.97 + level * 0.03`. Grace is inside that same else, because a young `audioStart` fails the `>` test. For the first 800 ms of a reply, or 1500 ms on a phone, the visitor’s own speech cannot start the hold timer, and if it is louder than the floor it pulls the floor up. After grace, sustained speech near that new floor still fails `echoFloor * 3` or `echoFloor * 5`, so every frame stays in the else, the timer stays at 0, and the floor keeps moving toward the speech. Speech that does jump over the line freezes the floor and starts the hold; the next frame under the line clears the hold and may move the floor again.

**Other code-confirmed ways the same three seconds never stop playback.** If `sources.length` is 0 while `botBusy()` is still true, the outer else (about line 785) zeros `bargeSince` and does not touch `echoFloor`. A gap between chunks restarts the hold even if the person never paused. `blocked` still discards any recorder overlap, so there is no second path through `helloLevel`. `getUserMedia` (about lines 917–918) requests echo cancellation, noise suppression, and auto gain before the analyser sees samples. Those browser processors can change `level`. Whether they did so on the reported attempt is not known. Headphones mode would use `gate()` instead, and it is off in the shipped checkbox.

**Not claimed.** No single path is identified as the cause of this visitor’s attempt. Device, speaker volume, phone versus desktop, and the hidden checkbox state are all able to choose among the paths above. There is no trace that shows which one happened.

**Instrumentation and test, not a fix.** In lab mode, log about ten times a second during playback: `level`, `echoFloor`, `Math.max(echoFloor * ratio, 0.03)`, milliseconds since `audioStart`, age of `bargeSince`, `sources.length`, `botBusy()`, `blocked`, the three checkboxes, and whether the pointer is coarse. Speak continuously for more than three seconds over a reply, on desktop and on a phone speaker. The log confirms a code path only if it shows the hold age never passing 250 ms or 400 ms, or `talking` false, or grace still open, or `level` under the line while the floor moves. Until that log exists, the incident root cause stays unconfirmed.

### 4. Hidden 1.5 second silence ends a pause

**Mechanism (evidence).** End-of-turn silence is `#gap`, default `1.5`, min 0.3, max 5 (about line 57). `sampleMic` (about line 797) ends the recording when `now - rec.lastVoice` reaches that many seconds, or at 60 seconds. `lastVoice` advances only while level stays at or above `gate()`. A thinking pause under the gate for 1.5 seconds sends the partial turn.

The control sits in the same `data-lab-only` settings block as the interrupt switch in subsection 1 (`ring/lab.css` line 2). The public iframe does not show it. The 1.5 second default still runs.

**Hypothesis.** Reports of “cut off when I pause” match this client timer. A separate 5 second `voiceWatch` (about lines 192–194) can mark TTS done if chunks stall. That watchdog is a different mechanism and was not observed in a live call.

**Proposed tests.** In a call, pause mid-sentence for just over 1.5 seconds and confirm the partial audio is sent. Pause for just under 1.5 seconds and confirm it stays one turn. In lab mode, raise `#gap` and confirm the wait follows the field. Reload without lab mode and confirm the field is hidden and 1.5 seconds is back.

### 5. Stale or delayed callbacks (potential, not proven at runtime)

**Evidence in the source.**

- `speakCartesia` (about lines 252–265). If the socket is not open, it reconnects and then calls `speakCartesia` again when `turn === me`. `stopAll` sets `turn.cancelled` but does not replace `turn`. The retry checks object identity, then `speakCartesia` sends. `speak()` checks `cancelled`; this retry path calls `speakCartesia` directly. A send after cancel is possible on that window. Not observed in a live session.
- `playBuffer` (about line 448). `src.onended` filters `sources` and calls `spokenCheck()` with no turn id. `stopAll` does set `cancelled` before `source.stop()`, and `spokenCheck` (about lines 626–637) requires `!turn.cancelled` and `!turn.spoken`. A late `ended` event after a newer turn has replaced `turn` is not bound to the old turn. Not observed in a live session.
- `onAudio` (about lines 408–409) drops chunks when the context id does not match or the turn is cancelled. Recorder `onstop` and `transcribe` check `callId` (about lines 818 and 847). Those guards are present. They do not cover the two callbacks above.

**Proposed tests.** Log `stopWhy`, context id, and turn id around cancel. Interrupt during a Cartesia reconnect and confirm no further `ws.send` for the cancelled context. Interrupt, start a new reply quickly, and confirm an old `onended` cannot mark the new turn spoken or clear its buffers. Treat a pass on one browser as incomplete until the same check is repeated on the browsers actually used for the demo.

## What this audit did not classify as bugs

Owner note on hosting: host-handled per owner, server controls not visible in this audit; verify with host if needed. This document does not confirm missing authentication or a missing rate limit, and it does not list either as a security bug. The client calls `token.php`, `chat.php`, `stt.php`, `tts.php`, and `cache.php` by path. Those server controls were not inspected. Do not treat the client fetch list as a finding that the host left them open.

No dependency manifest is in this repo or on the served voice page, so outdated packages cannot be assessed. That absence is not proof that packages are outdated. The served page pins a Cartesia client version string `2026-08-14` (about line 112). Currency of that API date was not checked against the vendor.

Sampled assets returned HTTP 200: `ring/media/orig/V3.mp4`, `ring/media/orig/V2.mp4`, `ring/media/R1-shared.webp`, `ring/ring.css?v=20261106s`, `ring/text.css?v=20261106w`, and `data/`. That is not a broken-link finding and not a guarantee that every link is valid.

`onSpoken` (about line 875) has a comment that runs to the end of the line and includes the statement that would set the lab-only Hero button’s disabled state. Noted as a lab-UI comment accident, not one of the findings above. Not executed.

## Fixes and tests to consider

Do not treat this section as implemented work.

1. Keep playback up until a short clip is accepted as speech. If transcription rejects it, resume the same buffers instead of leaving the stop in place.
2. Count voiced time without resetting the whole hold on one quiet frame. Do not let candidate speech raise the echo floor during the grace or during the hold.
3. Decide echo cancellation and the 3× / 5× test together. With browser echo cancellation on, “three times the residual” is a weak test of the speaker.
4. Show “Interrupt when I speak up” and the end-of-turn gap on the public page, or set those defaults in script so a hidden checkbox is not the production switch.
5. Allow speech during thinking and between audio chunks to count as an interrupt attempt instead of discarding it.
6. Bind `speakCartesia` retries and `src.onended` to a turn id, and have the retry obey `cancelled`.
7. Prove each change with the tests listed under findings 1–5. Server-side voice settings stay out of scope until the host code is in the review.
