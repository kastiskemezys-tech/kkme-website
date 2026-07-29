# Draft — operator email to AST re: BTD API

Phase 36.C. Operator-voice, English. For Kastytis to send, edit, or bin.

**To:** AST's transparency / BTD contact. `dispecer@ast.lv` is the published
operational address; `info@ast.lv` is the general one. The BTD footer or the
"Contacts" page on `baltic.transparency-dashboard.eu` may carry a data-specific
address — worth a look before sending, since a targeted address gets a better
answer than a general one.

**Cc:** worth considering Litgrid and Elering, since BTD is a joint product and
whoever operates it may not sit at AST.

**Tone note:** this is a free service we depend on and are not paying for. The
first item is a heads-up, not a complaint — it costs them nothing to ignore and
may be useful if they have not seen it. The second is the one we actually want
answered.

---

**Subject:** Baltic Transparency Dashboard — origin TLS error from Cloudflare, and API access policy

Hello,

I run [KKME](https://kkme.eu), a Baltic flexibility and storage market
intelligence site. It uses the Baltic Transparency Dashboard export API as its
source for balancing capacity and activation prices, and I wanted to flag one
technical observation and ask one question.

**1. Cloudflare-originated requests receive HTTP 526**

Requests to `api-baltic.transparency-dashboard.eu` from Cloudflare Workers
return `526` (invalid origin SSL certificate) rather than reaching the API. I
have confirmed this twice from Cloudflare's edge, several hours apart, and other
sites requested on the same runs returned normally, so it appears specific to
the BTD origin rather than a general egress problem on my side.

Direct requests from an ordinary server work correctly and return a valid
Let's Encrypt certificate (`CN=baltic.transparency-dashboard.eu`, issued
2026-07-18, valid to 2026-10-16), so the certificate itself is fine. The usual
cause of this pattern is an incomplete certificate chain — a leaf served without
its intermediate — which many clients tolerate by fetching the intermediate
themselves, while stricter validators reject it. That would be consistent with
what I see, though I can only observe the symptom from outside.

No action needed on my account; I have moved that request path to a host that
works. Flagging it only because if it is a chain configuration issue it may be
affecting other automated consumers too, and it would be invisible to you in
normal browser testing.

**2. API access policy**

More usefully for me: is there a documented policy for automated use of the
export API? Specifically —

- Any User-Agent or identification you would like automated clients to send?
- Rate limits or preferred request windows I should respect? I currently poll
  every four hours for a rolling nine-day window, and I would rather fit your
  expectations than guess at them.
- Do you prefer registered/known consumers, and if so, is there a way to
  register?

I would rather be a well-behaved consumer you know about than an anonymous one
you have to reason about from logs. Happy to adjust anything that helps.

Thank you for running the dashboard — for anyone working on Baltic balancing
data it is the only consolidated source, and it is genuinely valuable.

Best regards,
Kastytis Kemežys
kkme.eu

---

## Notes for the operator (not part of the email)

- **The Mac IP question is deliberately omitted**, per your instruction — the Mac
  leg is retired, so it is moot. For the record, the observation was that BTD's
  origin accepted TCP from `83.229.26.247` but returned zero TLS bytes and no
  certificate, while serving the VPS normally from the same IP. If you ever want
  to raise it, that is the detail.
- **The 526 diagnosis is stated as a hypothesis, not a finding.** A missing
  intermediate is the most common cause of that exact split (strict validators
  fail, tolerant clients succeed), but I could not verify the served chain from
  outside — the handshake that would reveal it is the one that fails. The email
  says "the usual cause" and "I can only observe the symptom", which is as far
  as the evidence goes.
- If they reply with a rate limit stricter than 4-hourly, `fetch_btd.py`'s cron
  schedule is the only thing that needs changing.
