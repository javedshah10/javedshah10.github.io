# Session-scoped visitor speaker recognition

**Status: proposed, incomplete, and not production-ready.** Nothing in this document is implemented. The fenced PHP and JavaScript are starter illustrations for a developer. They are not a deployable app, not wired to a model, and not a promise that a visitor will be recognized correctly.

Date: 2026-11-07

This design is for one visit only. A visitor consents, speaks a first clean utterance, and the session keeps a short-lived speaker embedding. Later utterances in that same visit may interrupt the assistant only when they match that embedding. Other speakers should not interrupt for the rest of that visit. When the visit ends, the embedding is deleted. This is not recognition of the site owner, not a permanent biometric file, and not a login.

## What was inspected

Two sources were read earlier. They were not executed again for this document. No microphone was opened, no audio was uploaded, and no model or paid endpoint was called.

| Source | Commit or stamp | What it shows |
| --- | --- | --- |
| Profile repo `main` | `867a8cb200d7e2e409c33aba6b5077ef3ccbdd7c` | Static site. No speaker enrollment. |
| Doc branch at the time of the audit note | `af680f8682b1ba01085d0397b9ecf7aae8dab2e7` | Same site code. Adds `AUDIT-FINDINGS.md` only. |
| Live voice page | `Last-Modified: Fri, 06 Nov 2026 21:15:32 GMT` | Browser app served by Hostinger. Line numbers below are that page. |

Profile evidence: `app.js` lines 324–333 set an iframe to the Hostinger origin. `index.html` lines 156–158 allow `microphone` and `autoplay` in that frame. This repo does not contain the voice engine. A comment in `app.js` names a separate `javed-app` tree that is not in `main`.

Served-page evidence, browser only:

- `helloLevel` (about lines 738, 745, 853–854, 905, and 957) stores the peak loudness of the first accepted sentence and uses it as a volume gate. It is cleared when a call starts. It is not a speaker embedding and it is not saved.
- `transcribe` (about lines 836–859) posts the audio blob and `min_confidence` to `stt.php`. The label at about line 64 calls that value an approximate Whisper token score. The client reads transcript text and language. It does not read a speaker score.
- Interruption today is the RMS test in `sampleMic` (about lines 765–800), then `stopAll` (about lines 607–623). That path does not ask who is speaking.
- `ring/lab.js` stores only a display flag, `javed-lab`, in `localStorage`. No IndexedDB voice profile was present.
- `cfg.voice_id` (about line 262) is the assistant’s text-to-speech voice. It is not a recording of the visitor.

`stt.php`, `chat.php`, `token.php`, `tts.php`, `cache.php`, and `diag.php` were not in the profile repo and were not opened. This document does not claim those scripts contain no speaker logic. It claims the inspected browser and `main` do not enroll a visitor or match identity.

## Ownership

| Piece | Where a change would live |
| --- | --- |
| Iframe shell | This GitHub repo. |
| Microphone, playback cancel, pre-roll | Hostinger voice page (browser JavaScript). |
| Embedding, compare, session TTL | Hostinger PHP or a store that PHP calls. Not this repo today. |

Shipping this design means editing the external voice app. Adding only this markdown file does not change runtime behavior.

## Requirement

1. The visitor sees a plain notice and must opt in before any enrollment audio is kept, even briefly.
2. The browser records. PHP only receives an upload. PHP cannot open the microphone.
3. Enrollment runs on an explicit “ready” action after consent, and only on audio that passes quality gates. The first sound on the page is not automatically the visitor.
4. A speaker embedding is inferred from that audio. A hash of the file, the transcript, the accent label, or a loudness number is not a voiceprint.
5. The embedding lives in a session-scoped store with a short TTL. The cookie holds an opaque id, not the vector.
6. A later utterance is embedded and compared with cosine similarity. A match may interrupt. A non-match must not stop playback. An uncertain score must not pretend to be sure.
7. On a match, the browser cancels generation and clears playback, and it keeps a short pre-roll so the start of the sentence is not cut off. PHP returns the decision. PHP does not stop the audio nodes.
8. Ending the visit deletes the embedding. Idle TTL and absolute TTL delete it even if the browser never calls back.

## Limitations the design has to say out loud

The first person who enrolls is not an authenticated, intended visitor. A television, the assistant’s own echo, or a nearby person can be enrolled if the “ready” clip is dirty. Consent plus a quality gate reduces that. It does not remove it.

One noisy non-match must not blacklist a person for good. The default is to score every new attempt on its own. A session deny cache is optional, off unless the visitor accepts it, and limited to this visit.

Speaker match is not identity security and not replay authentication. A recording of the enrolled person can still score as a match. Embeddings can confuse relatives, children, similar voices, and noisy phones.

Detection takes time. Waiting for enough clean speech makes barge-in slower. Cutting that wait raises false accepts and false rejects. This document sets no target latency and no accuracy rate.

Closing a tab is not a reliable delete. `pagehide` and `sendBeacon` are best effort. Server TTL and an explicit end call are mandatory. Garbage collection and `unlink` are best effort, not forensic erasure.

If speech-to-text or text-to-speech providers handle the same audio, their retention is their policy. This design cannot promise that no audio is stored anywhere on that path.

Voiceprints are sensitive biometric data. Saudi PDPL needs a legal review before any build. This document is not legal advice and not a compliance claim.

The owner’s voice is not a special case in this proposal. A permanent owner exception would be a different product: separate consent, separate authorization, and durable storage. Default answer to “should the owner be enrolled forever?” is no. That question stays open at the end.

## Pipeline

```
consent + explicit ready
  -> browser records (pre-roll ring already running)
  -> activity segmentation and echo suppression
  -> candidate speech, or reject as not enrollable
  -> embedding adapter
  -> session store (memory, TTL, opaque id)
later utterance
  -> same front end
  -> cosine against the session vector
  -> match: browser cancels generation, clears playback, keeps the utterance
  -> non-match: browser leaves playback running
  -> uncertain: do not interrupt; offer clarify or hold-to-talk
visit end, idle TTL, or absolute TTL
  -> delete vector, nonce, and buffers
```

Browser work stays in the voice page: voice-activity segmentation, echo suppression, a small pre-roll (a few hundred milliseconds is a placeholder, not a tuned value), and the actual `stopAll` of generation and playback. Overlapping talk is not auto-enrolled. Mixed voices fail the quality gate.

Server work: authorize the request, limit size and type and duration, call an extractor, store or compare, return a decision, delete on end or TTL.

## Illustrative PHP

The blocks below are **proposed, incomplete, and not production-ready**. They do not connect to a vendor, do not contain credentials, and must not be copied in as a working service. Thresholds are uncalibrated placeholders.

### Opaque id and store

PHP’s default `$_SESSION` files are on disk. This design does not put the embedding there, and it does not call that storage “memory only.” The cookie value is a random id. The vector lives behind an adapter the host still has to supply. A process-local PHP array dies at the end of a typical PHP-FPM request, so the class below is only the shape of the API.

```php
<?php
// PROPOSED / INCOMPLETE / NOT PRODUCTION-READY.
// No real store, model, or credential is connected.

declare(strict_types=1);

final class EmbeddingRecord
{
    public function __construct(
        public string $sessionId,
        public int $epoch,
        public string $state, // 'pending' or 'ready'
        public ?array $vector,
        public int $bornAt,
        public int $touchedAt,
        public int $absoluteDeadline,
        public int $idleSeconds,
        public string $nonce,
    ) {}

    public function deadAt(int $now): bool
    {
        if ($now >= $this->absoluteDeadline) {
            return true;
        }
        return ($now - $this->touchedAt) >= $this->idleSeconds;
    }
}

interface EphemeralEmbeddingStore
{
    /** Host supplies a memory-only store. This repo does not. */
    public function lock(string $sessionId): void;
    public function unlock(string $sessionId): void;
    public function get(string $sessionId): ?EmbeddingRecord;
    /**
     * Insert or replace only when the row is still the same epoch.
     * Returning false means the caller must drop the new vector.
     */
    public function saveIfEpoch(EmbeddingRecord $next, int $expectedEpoch): bool;
    public function delete(string $sessionId): void;
}

/**
 * API stand-in. Not a cross-request store.
 * A real adapter must refuse snapshots, persistence, and access logs of vectors.
 * RAM can still be swapped or dumped. That is a host caveat, not "secure erase."
 */
final class PlaceholderMemoryStore implements EphemeralEmbeddingStore
{
    public function lock(string $sessionId): void {}
    public function unlock(string $sessionId): void {}
    public function get(string $sessionId): ?EmbeddingRecord
    {
        throw new RuntimeException('in-memory adapter is not wired');
    }
    public function saveIfEpoch(EmbeddingRecord $next, int $expectedEpoch): bool
    {
        throw new RuntimeException('in-memory adapter is not wired');
    }
    public function delete(string $sessionId): void
    {
        throw new RuntimeException('in-memory adapter is not wired');
    }
}
```

Cookie illustration, issued at consent, not on first paint:

```php
<?php
// PROPOSED / INCOMPLETE / NOT PRODUCTION-READY.

function issue_opaque_cookie(string $sessionId, int $absoluteTtl): void
{
    setcookie('vp_sid', $sessionId, [
        'expires' => time() + $absoluteTtl,
        'path' => '/voice-session',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    // The value is the id only. Never write the embedding into the cookie.
}
```

Placeholder limits, not measured budgets:

```php
<?php
// PROPOSED / INCOMPLETE / NOT PRODUCTION-READY.
// UNCALIBRATED. Replace after native tests. Do not treat as acceptance numbers.

const PLACEHOLDER_MAX_BYTES = 2_097_152;
const PLACEHOLDER_MIN_VOICED_MS = 1_200;
const PLACEHOLDER_MAX_AUDIO_MS = 20_000;
const PLACEHOLDER_IDLE_SECONDS = 900;
const PLACEHOLDER_ABSOLUTE_SECONDS = 7_200;
const PLACEHOLDER_MATCH_COSINE = 0.80;     // not calibrated
const PLACEHOLDER_LOW_COSINE = 0.65;       // below this: non-match; between: uncertain
const PLACEHOLDER_ALLOWED_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4'];
```

### Guards, temp audio, and the extractor

The browser recorded the clip. This handler only accepts a POST. Duration comes from a parser placeholder, not from a client-supplied number.

```php
<?php
// PROPOSED / INCOMPLETE / NOT PRODUCTION-READY.

function assert_browser_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        throw new RuntimeException('POST required');
    }
    // Placeholders. Wire these to the real session nonce and site origin.
    $csrf = $_SERVER['HTTP_X_CSRF'] ?? '';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($csrf === '' || $origin === '') {
        throw new RuntimeException('csrf or origin placeholder rejected the request');
    }
    // expected_csrf($sessionId) and allowed_origin($origin) are not implemented here.
}

function read_upload_bytes(array $file): string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('upload missing');
    }
    $size = (int) ($file['size'] ?? 0);
    if ($size < 1 || $size > PLACEHOLDER_MAX_BYTES) {
        throw new RuntimeException('size limit');
    }
    $type = (string) ($file['type'] ?? '');
    if (!in_array($type, PLACEHOLDER_ALLOWED_TYPES, true)) {
        throw new RuntimeException('type limit');
    }
    $tmp = (string) ($file['tmp_name'] ?? '');
    // $_FILES may already have written upload_tmp_dir before this runs.
    // Streaming php://input with no temp file is stricter and is not shown here.
    try {
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new RuntimeException('temp upload missing');
        }
        $bytes = file_get_contents($tmp);
        if ($bytes === false) {
            throw new RuntimeException('temp read failed');
        }
        $voicedMs = probe_voiced_ms_placeholder($bytes);
        if ($voicedMs < PLACEHOLDER_MIN_VOICED_MS || $voicedMs > PLACEHOLDER_MAX_AUDIO_MS) {
            throw new RuntimeException('duration limit');
        }
        return $bytes;
    } finally {
        if ($tmp !== '' && is_uploaded_file($tmp)) {
            unlink($tmp); // best effort; not a secure wipe
        }
    }
}

function probe_voiced_ms_placeholder(string $bytes): int
{
    throw new RuntimeException('audio parser not configured');
}

/** Speaker embedding. Not a hash, transcript, accent label, or loudness. */
function embed_utterance_placeholder(string $audioBytes): array
{
    if ($audioBytes === '') {
        throw new RuntimeException('empty audio');
    }
    // Adapter shape only. No URL, key, or vendor call belongs here.
    throw new RuntimeException('embedding extractor not configured');
}
```

`read_upload_bytes` holds audio in a string only for the rest of that request. The `finally` unlink runs on parser and size failures too. Disk may already have held the temp file. That is not the same as a pure memory stream.

### Enroll, compare, and the decision

Do not keep PHP’s session lock, or the store lock, across `embed_utterance_placeholder`. Two tabs must not write each other’s vectors. A result that returns after delete, reset, or a newer epoch is dropped and must not recreate the row (no TTL resurrection).

```php
<?php
// PROPOSED / INCOMPLETE / NOT PRODUCTION-READY.

function cosine_placeholder(array $a, array $b): float
{
    $dot = 0.0;
    $na = 0.0;
    $nb = 0.0;
    $n = min(count($a), count($b));
    if ($n < 1) {
        throw new RuntimeException('empty embedding');
    }
    for ($i = 0; $i < $n; $i++) {
        $dot += $a[$i] * $b[$i];
        $na += $a[$i] * $a[$i];
        $nb += $b[$i] * $b[$i];
    }
    if ($na <= 0.0 || $nb <= 0.0) {
        throw new RuntimeException('zero embedding');
    }
    return $dot / (sqrt($na) * sqrt($nb));
}

function decide_placeholder(float $score): array
{
    // Bands are uncalibrated placeholders, not measured false-accept rates.
    if ($score >= PLACEHOLDER_MATCH_COSINE) {
        return ['decision' => 'match', 'action' => 'interrupt'];
    }
    if ($score < PLACEHOLDER_LOW_COSINE) {
        return ['decision' => 'nonmatch', 'action' => 'keep-playback'];
    }
    return ['decision' => 'uncertain', 'action' => 'hold'];
}

function enroll(EphemeralEmbeddingStore $store, string $sessionId, array $file, bool $consent, bool $explicitReady): array
{
    if (!$consent || !$explicitReady) {
        throw new RuntimeException('consent and explicit ready are required');
    }
    assert_browser_post();
    $now = time();

    $store->lock($sessionId);
    try {
        $cur = $store->get($sessionId);
        if ($cur !== null && !$cur->deadAt($now) && $cur->state === 'ready') {
            throw new RuntimeException('already enrolled this session; reset first');
        }
        if ($cur !== null && $cur->deadAt($now)) {
            $store->delete($sessionId);
            $cur = null;
        }
        $epoch = ($cur->epoch ?? 0) + 1;
        $nonce = $cur->nonce ?? bin2hex(random_bytes(16));
        $pending = new EmbeddingRecord(
            $sessionId,
            $epoch,
            'pending',
            null,
            $now,
            $now,
            $now + PLACEHOLDER_ABSOLUTE_SECONDS,
            PLACEHOLDER_IDLE_SECONDS,
            $nonce,
        );
        if (!$store->saveIfEpoch($pending, $cur->epoch ?? 0)) {
            throw new RuntimeException('enrollment race; retry');
        }
    } finally {
        $store->unlock($sessionId); // do not hold this across inference
    }

    $bytes = '';
    try {
        $bytes = read_upload_bytes($file);
        $vector = embed_utterance_placeholder($bytes);
    } finally {
        $bytes = ''; // drop the local copy; extractor must not keep a copy either
    }

    $store->lock($sessionId);
    try {
        $cur = $store->get($sessionId);
        // Missing, replaced, or expired: do not insert a fresh row from this late result.
        if ($cur === null || $cur->epoch !== $epoch || $cur->state !== 'pending' || $cur->deadAt(time())) {
            return ['ok' => false, 'reason' => 'stale-enrollment'];
        }
        $cur->state = 'ready';
        $cur->vector = $vector;
        $cur->touchedAt = time();
        if (!$store->saveIfEpoch($cur, $epoch)) {
            return ['ok' => false, 'reason' => 'stale-enrollment'];
        }
    } finally {
        $store->unlock($sessionId);
    }
    return ['ok' => true, 'state' => 'ready'];
}

function compare_utterance(EphemeralEmbeddingStore $store, string $sessionId, array $file): array
{
    assert_browser_post();
    $store->lock($sessionId);
    try {
        $cur = $store->get($sessionId);
        if ($cur === null || $cur->state !== 'ready' || $cur->vector === null || $cur->deadAt(time())) {
            if ($cur !== null && $cur->deadAt(time())) {
                $store->delete($sessionId);
            }
            return ['decision' => 'uncertain', 'action' => 'hold', 'reason' => 'no-live-reference'];
        }
        $epoch = $cur->epoch;
        $reference = $cur->vector;
    } finally {
        $store->unlock($sessionId);
    }

    $bytes = '';
    try {
        $bytes = read_upload_bytes($file);
        $candidate = embed_utterance_placeholder($bytes);
        $score = cosine_placeholder($reference, $candidate);
    } finally {
        $bytes = '';
    }

    $store->lock($sessionId);
    try {
        $cur = $store->get($sessionId);
        if ($cur === null || $cur->epoch !== $epoch || $cur->deadAt(time())) {
            return ['decision' => 'uncertain', 'action' => 'hold', 'reason' => 'session-changed'];
        }
        $cur->touchedAt = time();
        $store->saveIfEpoch($cur, $epoch);
    } finally {
        $store->unlock($sessionId);
    }

    // Default: no deny cache. A non-match does not stick to a person.
    return decide_placeholder($score);
}
```

`interrupt` means the browser may cancel. `keep-playback` means it must not. `hold` means wait, ask again, or switch to hold-to-talk. None of these update a permanent block list. Silent averaging of later samples is intentionally absent, so a second voice does not drift the reference. A future controlled update would be a separate, explicit action.

### End and TTL

```php
<?php
// PROPOSED / INCOMPLETE / NOT PRODUCTION-READY.

function end_session(EphemeralEmbeddingStore $store, string $sessionId): void
{
    assert_browser_post();
    $store->lock($sessionId);
    try {
        $store->delete($sessionId);
    } finally {
        $store->unlock($sessionId);
    }
    setcookie('vp_sid', '', [
        'expires' => time() - 3600,
        'path' => '/voice-session',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function sweep_expired(EphemeralEmbeddingStore $store, array $ids, int $now): void
{
    foreach ($ids as $sessionId) {
        $store->lock($sessionId);
        try {
            $cur = $store->get($sessionId);
            if ($cur !== null && $cur->deadAt($now)) {
                $store->delete($sessionId);
            }
        } finally {
            $store->unlock($sessionId);
        }
    }
}
```

Idle timeout and absolute deadline both count. A request after delete must not recreate the row from an in-flight embedding.

## What the browser still has to do

PHP cannot see the microphone and cannot clear Web Audio nodes. Illustrative client, same warning: proposed and incomplete.

```javascript
// PROPOSED / INCOMPLETE / NOT PRODUCTION-READY.
// The existing page would grow this. It is not in the repo today.

async function onCandidate(blob, mode) {
  const res = await fetch(mode === 'enroll' ? '/voice-session/enroll' : '/voice-session/compare', {
    method: 'POST',
    headers: { 'X-CSRF': csrfPlaceholder },
    body: formFrom(blob),
  });
  const decision = await res.json();
  if (decision.action === 'interrupt') {
    cancelGenerationAndClearPlayback(); // browser: abort chat, cancel TTS, stop sources
    submitFullUtteranceIncludingPreroll();
    return;
  }
  if (decision.action === 'keep-playback') {
    return; // non-match: do not call stopAll
  }
  offerClarifyOrPushToTalk(); // uncertain
}

function endVisitBestEffort() {
  // pagehide is unreliable. The server TTL still deletes the embedding.
  navigator.sendBeacon?.('/voice-session/end', new Blob(['{}'], { type: 'application/json' }));
  stopMicTracks();
  closeAudioContext();
  dropPrerollAndVectors();
}
```

Paths above are names in the proposal, not routes that exist today. `cancelGenerationAndClearPlayback` is the job already sketched by `stopAll` on the served page. A non-match must not call it.

On mic denial, skip enrollment and keep typed chat. On refresh, reconnect, or a new tab, treat the old embedding as gone unless that tab still holds a live unexpired nonce. Prefer one nonce per tab so two tabs do not share a speaker. Background tabs can stall timers. The server clock remains the TTL authority.

## Privacy

Notice, before the ready button: what is recorded, that a voice embedding is created, that it lasts only this visit, that other speakers should not interrupt, that match is imperfect, and that opting out leaves text and hold-to-talk.

No voiceprint in `localStorage`, IndexedDB, Cache Storage, or a file the site keeps. No vendor retention is added by this design. Existing STT and TTS calls, if they stay on the path, follow those providers’ own retention. Say that in the notice. Do not promise the audio never exists in a provider log.

Purpose is limited to “may this utterance interrupt this visit?” Deleting the session is the end of that purpose. A legal review under Saudi PDPL is required before build. This page does not provide that review.

## Tests that would be required later

Run these with real devices before any accuracy or latency claim. This list is not a result.

- Enrolled visitor interrupts, including a short onset that exists only in the pre-roll.
- A second person, a TV, music, and the assistant’s echo do not stop playback.
- Scores in the uncertain band do not stop playback and do not enroll over the first speaker.
- A noisy non-match does not block the enrolled person on the next try.
- Dirty first clip is rejected and does not become the reference.
- Reset and re-enroll replace the vector. A late response from the old clip does not restore it.
- End, idle TTL, and absolute TTL each leave a following compare with no reference.
- Two tabs and a refresh do not mix embeddings.
- Mic denial and backgrounding fail open to text or hold-to-talk.

False accept, false reject, and interrupt delay are measured in those scenes. No number is promised here.

## Open questions

- Overlap and double-talk: how much mix still passes the quality gate.
- Television, music, noise, accent, colds, phones, and children’s voices. No corpus was tested.
- How long the enrollment clip must be, and where the two cosine cutovers sit. The constants above are placeholders.
- Whether a session deny cache is ever worth the consent cost. Default in this proposal: off.
- Host budget, model location, GPU or CPU, and mobile cost. Unknown. No library is selected here, so none is vouched for.
- Browser WASM or WebGPU versus a server extractor. A browser model is a large download, a CPU and battery cost, a license question, and an XSS exposure if the page can read the vector. A server model keeps the vector off the page but handles audio the host must expire. Neither side is chosen as a benchmark winner.
- Owner permanent exception: **default no.** If it is ever requested, it is a separate persistent enrollment with its own authorization and consent, not a silent add-on to this visit-scoped promise.
