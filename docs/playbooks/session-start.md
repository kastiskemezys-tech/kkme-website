# Playbook: Session Start

Run this at the start of every session that involves code or infrastructure.

## Steps

1. **Read handover.** `docs/handover.md` — current state, backlog, session log.
2. **Check git state.** `git status`, `git log --oneline -10`, confirm which branch.
3. **Check production health.** Run `bash scripts/diagnose.sh` or manually:
   ```
   curl -s https://kkme-fetch-s1.kastis-kemezys.workers.dev/health | python3 -m json.tool
   curl -sI https://kkme.eu | head -5
   ```
4. **Confirm understanding.** State what you think the current state is and what you plan to do. Wait for approval before starting work.

## When to skip steps

- Pure planning/doc sessions: skip step 3 (production health).
- Continuation of an in-progress session: skip step 1 if handover was read earlier.
- Emergency bug fix: read handover quickly, then go — don't block on full ritual.

## After reading handover

Check if it's stale. Signs of staleness:
- Session log's last entry is >3 sessions old
- Backlog items are marked "scheduled" for a phase that's already shipped
- Architecture summary doesn't match what you see in the code

If stale, flag it before starting work. Updating handover is a prerequisite for everything else.
