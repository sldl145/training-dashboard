# Tape measurements - `tape[]` and the Tape block

Status: **implemented 16/09/2026** (Pawel's call, same session as the block comparison).
Development track (branch + PR, Pawel merges). Adding rows afterwards is data track.

## Why this series exists

The SATS InBody broke in September 2026 with no repair date, which removed the only
instrument that could cross-check the Withings scale. That left every composition number on
the dashboard coming out of **one** method - bioelectrical impedance - whose systematic
error tracks hydration. Averaging more readings shrinks random scatter; it does nothing to a
systematic bias, so more Withings data cannot fix the problem that Withings might be wrong.

A tape measures a **length**. It does not care about extracellular water, and it fails in a
completely different way from BIA. When the tape and the scale agree, the agreement carries
information. When they disagree, that is a finding rather than a number.

It is the **only hand-typed series in the repo**, and deliberately so: there is no API for a
tape measure. That makes the validator the only guard there is (see below).

## The protocol is the measurement

An inconsistently taken tape measurement is worse than none - it adds noise while looking
like signal. The protocol is fixed and is reproduced in the page's own empty state so it
cannot be lost:

- **When:** the same morning slot as the weigh-in. Fasted, before drinking. Twice a week.
- **How:** standing relaxed, at the end of a normal exhale - not held, not sucked in.
  Tape snug but not compressing the skin, level all the way round.
- **Waist:** at the navel.
- **Hip:** at the widest point of the glutes.
- **Three passes each, record the median.** Not the best of three, not the first.

If a measurement was taken off-protocol (after eating, post-training, different time of
day), record it with a `note` saying so rather than discarding it.

## Row schema in `index.html`

`const tape = [...]`, immediately above `weighins[]`, chronologically sorted.

```json
{ "date": "2026-09-16", "waist": 94.5, "hip": 102.0, "note": null }
```

- `date` - ISO `YYYY-MM-DD`, **date only**. This is a weekly-cadence measurement; there is
  no meaningful time component. Not `weighins[]`'s `dt` (which carries a time), and not
  `scans[]`'s legacy `DD/MM/YYYY`.
- `waist` - cm, **required**, 1 dp.
- `hip` - cm, optional, 1 dp. `null` when not taken. WHR needs both.
- `note` - free text, same conventions as session notes (`**NOT trend-valid**` marker,
  correction annotations in `[...]`).

## WHR is not the InBody's WHR

`scans[].whr` is a **model output**: the InBody estimates waist-to-hip from impedance, it
does not measure it. `tape[]`'s WHR is waist divided by hip, both measured with a tape.
They are different instruments by the repo's existing rule, so:

**Never merge them, never calibrate one to the other, never plot them on one axis.** The
tape WHR is not a continuation of the `scans[].whr` numbers, it is a new series that
happens to answer the same question better.

## Ingestion (data track - straight to `main`)

Pawel says the numbers in a session, or pastes them. Then:

1. Dedup on `date` - identical, skip; different, flag to Pawel, never overwrite.
2. Append to `tape[]`, keep sorted.
3. `node scripts/validate.js` + `node scripts/smoke.js`.
4. Commit with the session's other data, push `main`.

No Notion write. The repo is the record for tape measurements, same as for weigh-ins.

**Never invent or interpolate a missed measurement.** A gap is a gap - the block comparison
counts readings per block and reports honestly when a block is too thin.

## Validator rules (`scripts/validate.js`)

Because nothing upstream checks this data, the validator is strict:

- `date` matches `YYYY-MM-DD`; array sorted ascending; no duplicate dates.
- `waist` present and numeric (error if missing - it is the point of the series).
- `waist` and `hip` inside 50-200 cm - an error, and the message asks whether inches got
  typed in.
- `hip` absent - warning, noting WHR cannot be computed for that row.
- `waist / hip > 1.3` - warning that the two may be swapped.
- Waist moving more than 5 cm between consecutive measurements - warning. A body does not
  do that; a typo or a protocol slip does.

## Rendering

Its own block (`#tape-block`) at the bottom of the Withings tab, below the segmental card,
with its own header and instrument note. It is on that tab because both are *home*
instruments read on a daily-to-weekly cadence, as against the InBody's monthly gym visit -
not because they are the same thing. If the series earns it, splitting it to its own tab is
a small follow-up.

- **Empty state** carries the full protocol (above). This is load-bearing: the protocol is
  the part that gets forgotten between weeks, and a page that only says "no data" teaches
  nothing.
- **Latest card**: waist, hip and WHR as KPI cards, each against the first measurement.
- **Charts**: waist and hip on one chart (both cm, same axis, genuinely comparable), WHR on
  its own. Both use a **linear** x scale over timestamps, not Chart.js's `time` scale - the
  page loads no date adapter and a `time` axis without one throws and leaves a dead canvas.
  (Caught by `scripts/smoke.js` while building this, 16/09/2026.)
- The tape metrics also appear in the **block comparison** card at the top of the tab once
  `tape[]` has data - see `docs/BLOCK_COMPARISON.md`.
