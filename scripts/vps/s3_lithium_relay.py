#!/usr/bin/env python3
"""
KKME — lithium-scrape relay for S3.

Phase 51 / B-072. `tradingeconomics.com` answers a Cloudflare Worker with a
20-second hang and nothing else — no status, no headers, no body. Measured
2026-08-04 with a controlled three-network probe, the same URL and the same three
headers the worker sends:

    laptop (residential)          HTTP 200  ttfb 0.14s  408,928 B
    this host (Hetzner)           HTTP 200  ttfb 0.10s  408,914 B
    Cloudflare Worker             hangs 20s -> AbortError

So it is not the upstream, not the headers, and not datacenter IPs in general.
tradingeconomics.com is fronted by CloudFront (`x-amz-cf-pop: WAW51-P6`). Whether
that is a WAF rule against Cloudflare egress or something in the path between
them is **not established, and routing around it does not require establishing
it** — the same call 36.C made when the edge could not handshake with BTD's
origin, which is why `cert_watch.py` lives on this host too.

**This script sends BYTES AND NOTHING ELSE.** It does not parse, interpret,
validate or summarise the page. `parseLithiumPrice` stays in the worker, under
the worker's tests, as the single implementation of that quantity (discipline
rule #4). A relay that parsed would be a second implementation in a second
language living outside the repo that tests it — which is the defect, not the
fix.

The worker refuses a body under 10 KB and refuses to write a page it cannot
parse (HTTP 422, KV untouched), so a truncated or broken fetch here degrades to
"no update" rather than overwriting a good lithium price with an error envelope.

Exit codes: 0 wrote · 1 fatal (no secret, no page) · 2 relayed but not written
(the worker parsed nothing — the page shape probably changed).

Install:
    30 */4 * * * . /opt/kkme/config/.env ; export UPDATE_SECRET KKME_API && cd /opt/kkme/app && /opt/kkme/venv/bin/python3 sync/s3_lithium_relay.py >> /opt/kkme/logs/s3_relay.log 2>&1
"""

import os
import sys
from datetime import datetime, timezone

import requests

TE_URL = "https://tradingeconomics.com/commodity/lithium"

# Verbatim the headers the worker sent, so this relay reproduces the request the
# worker was making rather than a different one that happens to work. If TE ever
# starts refusing THESE, that is a fact about the headers and worth knowing.
TE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

WORKER_URL = os.environ.get("KKME_API", "https://kkme-fetch-s1.kastis-kemezys.workers.dev")
UPDATE_SECRET = os.environ.get("UPDATE_SECRET")

# The worker's floor, mirrored here so a short page is reported as such by the
# side that can see WHY it was short, instead of arriving as an opaque 400.
MIN_HTML_BYTES = 10 * 1024


def log(msg):
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}", flush=True)


def main():
    if not UPDATE_SECRET:
        log("FATAL: UPDATE_SECRET not in environment")
        sys.exit(1)

    fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        res = requests.get(TE_URL, headers=TE_HEADERS, timeout=30, allow_redirects=True)
    except Exception as e:
        log(f"FATAL: fetch failed — {type(e).__name__}: {e}")
        sys.exit(1)

    if res.status_code != 200:
        log(f"FATAL: TE returned HTTP {res.status_code} ({len(res.text)}B)")
        sys.exit(1)

    html = res.text
    if len(html) < MIN_HTML_BYTES:
        # Refuse locally rather than relaying a page the worker will reject: the
        # log line that names the size is the diagnosis, and it belongs on the
        # side that made the request.
        log(f"FATAL: TE returned {len(html)}B, under the {MIN_HTML_BYTES}B floor — not the page")
        sys.exit(1)

    log(f"fetched {len(html)}B in {res.elapsed.total_seconds():.2f}s — relaying")

    try:
        post = requests.post(
            f"{WORKER_URL}/s3/scrape",
            headers={"X-Update-Secret": UPDATE_SECRET, "Content-Type": "application/json"},
            json={"html": html, "fetched_at": fetched_at},
            timeout=60,
        )
    except Exception as e:
        log(f"FATAL: relay POST failed — {type(e).__name__}: {e}")
        sys.exit(1)

    try:
        body = post.json()
    except ValueError:
        body = {"raw": post.text[:200]}

    if post.status_code == 200 and body.get("wrote"):
        log(f"OK: lithium €{body.get('lithium_eur_t')}/t signal={body.get('signal')} "
            f"transport={body.get('transport')}")
        sys.exit(0)

    if post.status_code == 422:
        # Relayed fine; the worker could not parse it. That is a page-shape
        # change, not a transport failure, and the two must not share an exit
        # code — one needs a parser fix, the other needs a network look.
        log(f"NOT WRITTEN: worker parsed nothing from {len(html)}B — {body.get('reason')}. "
            f"KV left untouched, last good value preserved.")
        sys.exit(2)

    log(f"FATAL: worker returned HTTP {post.status_code} — {body}")
    sys.exit(1)


if __name__ == "__main__":
    main()
