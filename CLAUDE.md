# KKME — Claude Session Guide

Baltic flexibility and storage market intelligence platform. kkme.eu.
Built by Kastytis Kemezys. Solo operator.

## Start here

1. Read `docs/handover.md` — canonical state, backlog, session log.
2. Check git state: `git status && git log --oneline -5`
3. Check production: `bash scripts/diagnose.sh`
4. Confirm understanding before starting work.

## Key references

- `docs/map.md` — concept-to-file lookup ("if you want X, go here")
- `docs/glossary.md` — energy market terms
- `docs/playbooks/` — session-start, verification, pause-points
- `docs/principles/` — design governance, data classification, model risk
- `docs/principles/decisions.md` — architectural decision log (why KV not D1, etc.)

## Rules that apply to every session

- Design tokens: always `var(--token-name)`, never raw rgba().
- Worker: never cat whole file (7740 lines). Use grep.
- Card anatomy: header → hero metric → status → interpretation → viz → impact line → source footer → drawer.
- Voice: terse, precise, numbers first, one interpretation line per card.
- Verify with actual output before committing. See `docs/playbooks/verification.md`.
- End of session: update handover.md session log + backlog.

## Current phase

Hero v3 polish. Phase 2B-1 queued (prompt at `docs/phases/phase2b-1-prompt.md`).
See `docs/handover.md` for full backlog.
