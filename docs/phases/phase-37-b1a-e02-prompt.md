# 37.B.1a (schedule the runner) + 36.E0.2 (manifest single-writer) — one batch

**Branch:** `phase-37-b1a-runner-schedule` off latest main. **Autonomous. ~1.5 h.** No public number moves.
Read `docs/playbooks/failure-modes.md` first; four Pause-A questions in one paragraph.

---

## Part 0 — report on Sunday's scheduled refresh (5 min, evidence only)

The evidence-refresh workflow was due to fire **2026-08-02 03:00 UTC** — its first scheduled run. Report what happened: did it fire, did a PR open, did all eight sources serve from Actions runner IPs, and did the gates pass? This is E0.1's last open question (the `fetch-btd.yml` precedent is that BTD blocks Actions IPs). If it failed on reachability, file it with the per-source detail — do NOT fix it here.

## Part 1 — 37.B.1a: schedule the detector runner on the VPS

**Host is decided: the VPS.** `UPDATE_SECRET` already lives there, existing crons already source it, VERT and lv_press exist only as files on that box, and 37.B.1 already ran the POST from there via `--emit-payload`. No SSH-to-prod secret surface is added anywhere.

Pause A, verified not assumed:

1. Current VPS crontab in full (paste it) — what runs, when, and where each redirects. **The 36.C lesson is mandatory here:** cron opens its redirect BEFORE the command runs, so a missing log directory kills the job silently; assert the directory exists and grep for anything else depending on those paths before touching them.
2. **Cron's environment is not your shell's.** No nvm, minimal PATH. Establish the absolute node path and use it; if the existing crons already solve this, copy their pattern rather than inventing one.
3. Measure the runner's real wall-clock duration (the register pull is ~128 MB) so the schedule has margin.

Build:

4. Weekly cron landing **before Monday 07:30 UTC** with margin for a slow register pull, not colliding with the BTD cron.
5. **Verification must exercise the cron path, not your shell.** Run the exact command line cron will run, under a cron-like environment (`env -i` with only what cron provides). A command that works in your interactive shell and fails under cron is the single most common form of this bug.
6. **Runner-staleness alert, distinct from the digest's.** A dead runner must be visible without waiting for a digest to describe it — the digest currently measures itself, which is the gap this part closes. B8 answer in the commit message: how would we know if the runner silently stopped, or if it ran but posted nothing?

## Part 2 — 36.E0.2: manifest single-writer + provenance append-only

Scope is RESCOPED and smaller than it first looked — read queue §2.55 before starting. B-048 closed as not-a-defect (a plain branch switch, nothing lost), so:

7. **One canonical manifest writer.** `fetch-activation-prices.mjs:590` builds the manifest from scratch and bypasses `preserveAcquisitionMetadata()` (`refresh-mature-markets.mjs:224`). Route it through the same merge/preserve path. Grep-gate from-scratch construction so a third fetcher cannot reintroduce it.
8. **Append-only assert on provenance keys:** any write that REMOVES a provenance key fails the gate.
9. **Do NOT build provenance-absence-as-ERROR.** It would have false-alarmed on an artifact that was honest and self-consistent. If a check of that shape is added at all, it compares provenance against **what the data actually contains**, never against mere key presence. The rule-#2 line on the monitor's explanatory text also falls away — that text was accurate.

## Gates
`docs/_private/` never staged · `/revenue` 54/54 byte-identical (nothing here moves a public number) · suite green · eslint clean · no test deleted or weakened without calling it out · deploy only if the worker changes at all, and then per C8 (poll until two reads agree).

## Wrap
Origin-SHA · Sunday's refresh verdict · the crontab before/after + the `env -i` proof that the cron path works · runner-staleness surface demonstrated · the grep gate proving from-scratch manifest construction is now blocked · byte-identity result · PR URL.
