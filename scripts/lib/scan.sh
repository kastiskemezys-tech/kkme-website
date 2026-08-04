#!/bin/bash
# Shared scanning discipline for grep-based gates — playbook B15.
#
# `grep` has three exit codes and gates habitually read two:
#
#     0  found          1  not found          2  ERROR
#
# `if ! grep …`, `grep … || true`, and `! grep … | grep -v …` all collapse 2 into
# "clean". A scan that could not run then reports exactly what a scan that ran and
# found nothing reports. Phase 51 found this live: one untracked file carrying
# invalid UTF-8 made BSD grep abort under a UTF-8 locale, and the NDA gate's
# every needle scan would have returned clean.
#
# Two rules, and they are not optional:
#
#   1. **Byte semantics.** `LC_ALL=C` plus `grep -a`, so no input can abort a
#      scan and no content is skipped as "binary". A forbidden string inside a
#      binary blob is still a forbidden string.
#   2. **A positive control that must match.** A gate's NEGATIVE result is only
#      believable if the same mechanism can be shown to find something known to
#      be present, on the same run, against the same corpus.
#
# Usage:
#     . "$(dirname "$0")/lib/scan.sh"
#     scan_control_or_die <<< "$corpus"        # or: scan_control_file <file>
#     scan_grep -qE "pattern" <files...>       # 0 found / 1 clean / exits 2 on error
#
# `scan_grep` NEVER returns 2 to its caller: it exits the whole gate as
# UNRUNNABLE, because a caller that receives 2 is a caller that will mistake it
# for 1 eventually.
export LC_ALL=C
export LANG=C

SCAN_CONTROL_SENTINEL="__SCAN_GATE_POSITIVE_CONTROL__"

# scan_grep <grep-args...> — 0 found, 1 not found, exits 2 on grep error.
scan_grep() {
  grep -a "$@"
  local rc=$?
  case "$rc" in
    0|1) return "$rc";;
    *)
      echo "GATE UNRUNNABLE — grep exited $rc (an ERROR, not a result) while scanning." >&2
      echo "Refusing to report a pass from a check that did not execute (B14/B15)." >&2
      exit 2;;
  esac
}

# scan_control_file <file> [pattern-flavour]
# Appends the sentinel to a COPY of <file>, confirms the scan finds it, and dies
# if it cannot. Proves the mechanism works on this run, against this corpus.
scan_control_file() {
  local target="$1"
  local tmp
  tmp=$(mktemp "${TMPDIR:-/tmp}/scanctl.XXXXXXXX")
  cat "$target" > "$tmp" 2>/dev/null
  echo "$SCAN_CONTROL_SENTINEL" >> "$tmp"
  grep -a -qF -- "$SCAN_CONTROL_SENTINEL" "$tmp"
  local rc=$?
  rm -f "$tmp"
  case "$rc" in
    0) return 0;;
    1) echo "GATE INVALID — the positive control did not match its own corpus. The scan is not scanning." >&2; exit 2;;
    *) echo "GATE UNRUNNABLE — the positive control's grep exited $rc (an error, not a result)." >&2; exit 2;;
  esac
}

# scan_control_tree <grep-args...> — the control for gates that scan a TREE
# rather than one file: plant a sentinel file, confirm the gate's own search
# expression family finds it, remove it. Takes the directory to plant in.
scan_control_tree() {
  local dir="$1"; shift
  local probe="$dir/.__scan_control_probe"
  printf '%s\n' "$SCAN_CONTROL_SENTINEL" > "$probe" 2>/dev/null || {
    echo "GATE UNRUNNABLE — cannot write a control probe into $dir." >&2; exit 2; }
  grep -a -rqF -- "$SCAN_CONTROL_SENTINEL" "$dir"
  local rc=$?
  rm -f "$probe"
  case "$rc" in
    0) return 0;;
    1) echo "GATE INVALID — the positive control was not found in $dir. The scan is not scanning." >&2; exit 2;;
    *) echo "GATE UNRUNNABLE — the positive control's grep exited $rc (an error, not a result)." >&2; exit 2;;
  esac
}
