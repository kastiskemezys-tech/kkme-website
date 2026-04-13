# Superpowers Install — Claude Code Session Prompt

Target duration: 15 minutes. Paste this as your first message in a fresh Claude Code session started in ~/kkme.

---

## Step 0: Context loading (before touching Superpowers)

Before installing anything, establish KKME context:

1. Run: `bash scripts/diagnose.sh`
2. Read `docs/handover.md` (full file)
3. Read `docs/playbooks/tooling.md` for usage rules

This ensures when Superpowers' session-start hook fires after install, the Claude Code instance already knows what KKME is and when to use Superpowers vs fall back to our pause-point workflow.

## Step 1: Install

Two commands in the Claude Code CLI:

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

Then quit Claude Code completely and restart. The plugin activation requires a fresh session.

## Step 2: Verify installation

After restart, run these verification checks:

1. `/help` — confirm new commands appear (/superpowers:brainstorm, /superpowers:write-plan, /superpowers:execute-plan, etc.)
2. Ask Claude: "List the Superpowers skills currently available to you"
3. Expected output: 20+ skills including brainstorming, writing-plans, test-driven-development, verification-before-completion, using-git-worktrees, subagent-driven-development, requesting-code-review

If /help doesn't show Superpowers commands, the install failed. Check: did you fully quit and restart, not just reload?

## Step 3: First real test

The first real session using Superpowers should be Phase 2B-1 (see docs/phases/phase2b-1-prompt.md). Phase 2B-1 has 4 workstreams and runs 75+ minutes — the right scope to test whether Superpowers' brainstorming and verification skills add value beyond the pause-point pattern.

What to watch for during Phase 2B-1:

- Does Superpowers' brainstorming skill surface anything the phase prompt didn't already cover?
- Does the verification-before-completion skill catch issues that our manual curl checks would have missed?
- Does the session-start hook add useful context or just noise on top of our handover-reading step?
- Does any Superpowers skill conflict with the pause-point gates between workstreams?

After Phase 2B-1 completes, update docs/handover.md session log with notes on how Superpowers interacted with the existing workflow. Format: "Superpowers: [helped/neutral/hindered] — [one line why]". This is the data for the "keep or uninstall" decision per ADR-006.

## Step 4: Rollback if needed

If Superpowers proves net-negative after 2 real sessions:

```
/plugin uninstall superpowers
```

Then update docs/principles/decisions.md with a new ADR documenting what failed and why. Update docs/playbooks/tooling.md to move Superpowers from "installed" to "evaluated and rejected."

## Hard rules

- Do not paste this prompt at the same time as other work — do the install as a clean dedicated session
- Do not skip Step 0 (context loading) — it matters for how Superpowers' first activation behaves
- Do not try to install Superpowers in Cowork — it's a Claude Code plugin only
- If the install commands fail or the plugin format has changed since 2026-01, check the Anthropic marketplace docs for updated syntax
- After install and verification, this prompt is done — start a new session for Phase 2B-1

## Reference

- ADR-006: docs/principles/decisions.md (evaluation rationale)
- Tooling playbook: docs/playbooks/tooling.md (usage rules, when to invoke, when not to)
- Phase 2B-1 prompt: docs/phases/phase2b-1-prompt.md (first real Superpowers test session)
- Uninstall procedure: docs/playbooks/tooling.md § "Uninstalling Superpowers"
