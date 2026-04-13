# KKME Tooling Playbook

Installed tools, usage rules, adoption protocol.

## Purpose

This playbook tracks installed tools, documents when to use each, and sets the rules for adopting new ones. Every installed tool has an ADR entry in docs/principles/decisions.md. Update this doc when tools are added, removed, or re-evaluated.

## Installed tools

| Tool | Purpose | When to use | Install location | ADR |
|------|---------|-------------|------------------|-----|
| Superpowers (obra/superpowers) | Agentic workflow framework: brainstorm, plan, TDD, verify, subagent dispatch | Complex features, new signal authoring, multi-file refactors, sessions over 60 min | Claude Code CLI global install (~/.claude/plugins/) | ADR-006 |
| Anthropic frontend-design skill | Design intelligence for UI tasks | Automatically when building web components or UI | Pre-installed in Claude Code /mnt/skills/public/ | N/A (Anthropic default) |
| chrome-devtools MCP | Visual verification via DOM inspection and screenshots | Phase 2B+ polish sessions requiring visual checks | Configured in .mcp.json | N/A (already in use) |

### Tool notes

**Superpowers** is provisionally adopted as of 2026-04-13. It will be evaluated against the pause-point workflow during Phase 2B-1. If it proves net-negative after 2 real sessions, it gets uninstalled (see "Uninstalling Superpowers" below).

**Anthropic frontend-design skill** ships with Claude Code and activates automatically during UI work. It defers to existing design systems rather than imposing its own, which is why it fits KKME where UI UX Pro Max does not.

**chrome-devtools MCP** is configured in .mcp.json at the repo root. It provides DOM inspection, screenshot capture, and console access for visual verification during polish sessions.

## Evaluated and rejected

| Tool | Reason rejected | Re-evaluate when | ADR |
|------|----------------|------------------|-----|
| GSD (gsd-build/get-shit-done) | Workflow overlap with handover + pause-points pattern | 2026-10-13 or if workflow gaps emerge | ADR-006 |
| UI UX Pro Max (nextlevelbuilder/ui-ux-pro-max-skill) | Conflicts with ADR-005 design system (three-font rule, CSS variables, halftone map identity) | If KKME design opinions change or for greenfield projects | ADR-006 |
| Obsidian Claude skill | Repo docs/ folder serves same purpose as a knowledge vault | If separate personal/strategic notes vault emerges outside KKME | ADR-006 |
| Awesome Claude Code (hesreallyhim/awesome-claude-code) | Not a tool — a GitHub directory of resources. Bookmark only, never installed | N/A | ADR-006 |

### Rejection rationale (short form)

**GSD** — The core problem GSD solves (session discipline, planning, progress tracking) is already solved by the handover.md + session-start playbook + pause-point playbook pattern developed during Phase 2A. Two session-start hooks running simultaneously would create friction, not clarity.

**UI UX Pro Max** — KKME has strong, documented design opinions (ADR-005). UI UX Pro Max is designed for projects that need design opinions imposed. These are fundamentally incompatible. The Anthropic frontend-design skill handles the "design intelligence" need without fighting the existing system.

**Obsidian Claude skill** — Would only add value if KKME knowledge lived outside the repo. Currently everything lives in docs/. If a personal/strategic notes vault emerges (e.g., for investor relations, market thesis notes), revisit.

**Awesome Claude Code** — Useful as a browsing resource. Bookmark: https://github.com/hesreallyhim/awesome-claude-code

## Rules for tool adoption

- Every new tool requires an ADR entry BEFORE install
- Test: "does this solve a specific problem existing tools don't solve" — not "is it popular" or "is it recommended"
- Prefer global Claude Code plugins over per-project installs to avoid repo pollution
- Don't stack tools that do the same thing (lesson from the 28-config-dirs cleanup during Phase 1 audit)
- When two tools conflict, one must be uninstalled — not "configured around"
- Re-evaluate rejected tools every 6 months if needs have changed
- If an installed tool proves net-negative after 2 real sessions, uninstall and write an ADR documenting why

### Evaluation checklist for new tools

Before installing any new tool, answer these questions:

1. What specific problem does it solve that current tools don't?
2. Does it conflict with any existing tool or workflow? (Check session-start hooks, planning systems, design opinions)
3. Is it a global plugin or per-project install? (Prefer global)
4. What's the rollback plan if it doesn't work out?
5. Write the ADR entry before running the install command.

## Using Superpowers

### When to invoke

- Complex features spanning multiple files
- New signal authoring end-to-end (worker endpoint + card + governance docs)
- Refactors touching multiple components
- Sessions where upfront brainstorming would reduce scope drift
- Any session expected to take 60+ minutes

### When NOT to invoke

- Small fixes or single-file edits
- Phase 2B polish work (already planned with pause points)
- Sessions under 20 minutes
- Tasks where the existing pause-point playbook is sufficient

### Interaction notes

- If Superpowers' brainstorming skill asks questions already answered in docs/handover.md, point it at the handover rather than re-answering. This saves context and keeps answers consistent.
- Superpowers' TDD skill is less relevant for KKME since most of the frontend is presentational React, not business logic. Apply judgment — use TDD for worker endpoint logic or data transforms, skip it for component styling.
- Superpowers' session-start hook adds prompting on every Claude Code session. Sessions will start slightly differently until you opt out of specific hooks. Be aware of this and don't be confused by the changed startup flow.
- When Superpowers skills conflict with our pause-point pattern, our pattern wins — we built it for KKME specifically. Superpowers is a guest in our workflow, not the host.
- After every session using Superpowers, add a note to the session log in docs/handover.md about whether it helped. Format: "Superpowers: [helped/neutral/hindered] — [one line why]". This is the data for the keep/uninstall decision.

### Superpowers skills reference

Key skills to be aware of (not exhaustive):

- **brainstorming** — upfront problem decomposition. Most useful for new features.
- **writing-plans** — structured plan before execution. Overlaps slightly with our phase prompt pattern.
- **verification-before-completion** — checks work before declaring done. Complements our verification playbook.
- **subagent-driven-development** — dispatches subtasks to parallel agents. Useful for multi-file refactors.
- **using-git-worktrees** — isolates experimental work. Good for risky changes.
- **requesting-code-review** — self-review before commit. Lightweight quality gate.
- **test-driven-development** — write tests first. Apply selectively (see interaction notes).

## Uninstalling Superpowers

Command:

```
/plugin uninstall superpowers
```

If net-negative after 2 real sessions, uninstall, then write a new ADR documenting what failed. Update this playbook to move Superpowers from "installed" to "evaluated and rejected."

### What "net-negative" means

Superpowers is net-negative if it consistently does any of these:

- Adds more than 5 minutes of overhead per session without corresponding value
- Conflicts with pause-point workflow in ways that require manual intervention
- Causes context bloat that leads to dropped instructions or hallucinations
- Makes sessions harder to debug when things go wrong

Two sessions is the minimum trial. One bad session could be a fluke or a learning curve issue.
