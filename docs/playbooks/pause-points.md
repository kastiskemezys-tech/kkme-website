# Playbook: Pause Points

The three-pause pattern for sessions with more than one deliverable or any risky changes.

## When to use

- Multi-workstream sessions (touching >1 section or >3 files)
- Any session that deploys to production
- Sessions where scope could drift (refactoring, debugging, design iteration)
- Any time you're uncertain about the right approach

## The three pauses

### Pause 1: After discovery

You've read the code, understood the problem, and have a plan. Report:
- What you found
- What you plan to do
- What files you'll touch
- Any risks or questions

Wait for explicit "proceed."

### Pause 2: After build, before deploy/commit

The code is written and tested locally. Report:
- What you changed (file list + summary)
- Verification results (curl output, build output, screenshots)
- Anything unexpected you found while building
- Any scope items you deferred

Wait for explicit "proceed" before committing or deploying.

### Pause 3: After verification, before final commit

Production is verified (if deployed) or the full build succeeds. Report:
- Final verification results
- Commit message(s) you plan to use
- Any follow-up items for the backlog

Wait for explicit "proceed" before creating the commit.

## Rules

- Don't infer approval. "Sounds good" is not "proceed."
- If context is getting tight, stop at the nearest clean pause point and report what's unfinished.
- If you realize mid-build that scope has changed, pause early — don't wait for the scheduled pause.
- The worst failure mode is claiming work is done when it isn't. Pausing early is always better than shipping bad work.
