#!/usr/bin/env python3
"""
KKME — upstream TLS-expiry tripwire.

Phase 36.C. The 2026-07-17 outage began as a lapsed Let's Encrypt certificate on
BTD's origin and ran twelve days before anyone noticed: every ingestion leg
failed quietly, and nothing watched certificates. One inspection per upstream
per day converts that class of event into a week's warning.

It runs here rather than in the worker for two reasons: Workers' fetch() exposes
no peer certificate, and the Cloudflare edge cannot complete a handshake with
BTD's origin at all (persistent 526). This host can.

Reports to POST /admin/cert-watch, which owns the Telegram alerting and fires
below 7 days remaining — or on an inspection that fails outright, since "the
origin returned no certificate" is exactly the 07-17 signature.

Install:
    0 5 * * * . /opt/kkme/config/.env ; export UPDATE_SECRET && cd /opt/kkme/app && /opt/kkme/venv/bin/python3 scripts/vps/cert_watch.py >> /opt/kkme/logs/cert_watch.log 2>&1
"""

import json
import os
import socket
import ssl
import sys
from datetime import datetime, timezone

import requests

WORKER_URL = os.environ.get("KKME_API", "https://kkme-fetch-s1.kastis-kemezys.workers.dev")
UPDATE_SECRET = os.environ.get("UPDATE_SECRET")

# Upstreams whose TLS expiry can silently stall the pipeline.
HOSTS = [
    "api-baltic.transparency-dashboard.eu",
    "baltic.transparency-dashboard.eu",
    "www.litgrid.eu",
    "dashboard.elering.ee",
]


def log(msg):
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}", flush=True)


def inspect(host, port=443, timeout=15):
    """Return {host, not_after, days_remaining} or {host, error}."""
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as tls:
                cert = tls.getpeercert()
    except Exception as e:
        # Includes the 07-17 failure mode: handshake closed with no certificate.
        return {"host": host, "error": f"{type(e).__name__}: {e}"}

    if not cert or "notAfter" not in cert:
        return {"host": host, "error": "no certificate returned"}

    not_after = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    days = (not_after - datetime.now(timezone.utc)).days
    return {
        "host": host,
        "not_after": not_after.isoformat(),
        "days_remaining": days,
        "issuer": dict(x[0] for x in cert.get("issuer", ())).get("organizationName"),
    }


def main():
    if not UPDATE_SECRET:
        log("FATAL: UPDATE_SECRET not in environment")
        sys.exit(1)

    checks = []
    for h in HOSTS:
        c = inspect(h)
        checks.append(c)
        if "error" in c:
            log(f"  ✗ {h}: {c['error']}")
        else:
            log(f"  ✓ {h}: {c['days_remaining']}d remaining (until {c['not_after']})")

    res = requests.post(
        f"{WORKER_URL}/admin/cert-watch",
        headers={"Content-Type": "application/json", "X-Update-Secret": UPDATE_SECRET},
        data=json.dumps({"checks": checks}),
        timeout=30,
    )
    log(f"report: {res.status_code} {res.text[:200]}")
    sys.exit(0 if res.status_code == 200 else 4)


if __name__ == "__main__":
    main()
