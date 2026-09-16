# Block comparison - reading the scale in fortnights

Status: **implemented 16/09/2026** (Pawel's call). Development track.
Renders as the `#withings-block-compare` card at the top of the Withings tab.

## The problem it solves

On 16/09/2026 the daily weigh-in showed 0.44 kg moving from the fat column to the fat-free
column overnight, at a flat body weight. No body does that in 24 hours. It was hydration
shifting, read through impedance.

Measured on Pawel's own series, the **per-reading noise is roughly the size of a
fortnight's real change**:

| Metric | Per-reading noise (SD) |
|---|---|
| Weight | 0.29 kg |
| Fat mass | 0.42 kg |
| Fat % | 0.51 |
| Muscle | 0.58 kg |

So a single reading, and any two readings compared directly, is mostly noise. A **block
mean** over n readings shrinks the random component by `sqrt(n)`, leaving the trend. The
smallest honest unit of change is one block against the block before it.

This is also why the monthly InBody was never a good change detector: to call a fat-mass
change real between two scans it needed to exceed ~2.8 kg.

## What it computes

For each metric, over rows in the trailing `BLOCK_DAYS` (14) and the 14 before that:

1. **Block means**, with the reading count shown for each - `n` is the whole point, so it
   is never hidden.
2. **Per-reading noise**, by the successive-difference (von Neumann) estimator: for a
   series carrying a trend, `SD(consecutive differences) ~ sigma * sqrt(2)`, so
   `sigma = SD(diffs) / sqrt(2)`. This is used rather than a plain SD **because it is
   trend-robust** - a plain SD of a trending series counts the trend as noise and inflates
   the threshold, hiding real change. Checked against the OLS residual SD of the same rows
   on 16/09/2026: agrees within ~20 %.
3. **Threshold** = `t(0.975, df) * sigma * sqrt(1/n_cur + 1/n_prev)`. The t multiplier, not
   a flat 1.96, because with ten-odd readings the noise estimate is itself uncertain and
   1.96 would call changes real that are not.
4. **Verdict**: `real change` when `|delta| > threshold`, otherwise `within noise`. The
   threshold is always displayed next to the verdict.

Nothing is hard-coded. Every threshold is derived from the series' own scatter and moves
as the data does.

## Rules it observes

- **Anchored on `TODAY`, not on the last reading.** If the weigh-ins stop, the latest block
  must empty out and say so. Anchoring on the last reading would compare two stale blocks
  and look healthy.
- **Algorithm runs.** Everything impedance-derived is restricted to the current
  `algo` run - a scale-side model update is a step in the instrument, not in Pawel.
  Weight comes off a load cell and is exempt, so it uses the whole series.
- **Minimum readings per block**: 4 for the scale (daily cadence), 3 for tape (weekly).
  Below that the row reports how thin the blocks are rather than producing a number.
- **When the series is too young**, the row shows the **date the first comparison becomes
  possible** (first reading + 28 days) instead of a generic "not enough data".
- **Colour follows good/bad, not up/down**: less fat is green, less muscle is red. A metric
  with no good direction (weight, hip) stays neutral.

## What it does NOT do

Averaging removes **random** noise only. Impedance readings also carry a **systematic**
component that tracks hydration, and hydration itself trends - creatine, carbohydrate
intake, season, illness, a week of bad sleep. No amount of averaging touches that.

So `real change` here means real **relative to scatter**, not independently verified. This
is precisely why `tape[]` exists (`docs/TAPE_SPEC.md`): an instrument that measures a
length fails differently from one that infers composition from impedance, and two
instruments agreeing is worth more than one instrument averaged harder.

The card says this in its own footnote. Do not remove that footnote to save space.

## Where the numbers live

`BLOCK_DAYS`, `BLOCK_MIN_N`, `blockSigma()`, `tCrit()`, `blockCompare()` and
`renderBlockCompare()` are in the inline script in `index.html`, immediately after
`renderWithings()`. Changing `BLOCK_DAYS` or the minimum counts changes how a number is
derived, so it is a **recalculation** - development track, ask first (`CLAUDE.md` ->
Two-track publishing).
