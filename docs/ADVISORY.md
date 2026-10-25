# PacketLedger Security Bulletin PB-2026-07

**Subject:** `CVE-2026-111497` — "Node2Shell": out-of-bounds write in the bundled
Brotli decoder of the Node.js 24 runtime
**Severity:** critical (CVSS pending — DoS confirmed in the wild, RCE suspected)
**Status:** OPEN on our fleet. Fix release blocked by the Q3 change freeze.

---

## Summary

The Brotli decoder bundled inside the Node.js 24 runtime mis-handles a
*specially-crafted multi-stage compressed stream* delivered as an HTTP request
body. A stage boundary written at a wrong offset corrupts adjacent heap
metadata. Observed outcomes range from a clean process death (SIGSEGV, service
interrupted, supervisor restarts it) to — in the worst analyzed case —
arbitrary code execution in the runtime's privilege context.

The defect is reached through **any** request path that decompresses a
`Content-Encoding: br` body before the application sees it. Our manifest
intake API is such a path.

## Affected

- Node.js `24.x` prior to `24.22.1` (all patch levels, all platforms; the
  public analysis targets x86_64 heap geometry)
- Any Express/Body-Parser deployment that accepts compressed *request* bodies
  (this is on by default; nobody thinks about it)

Our gateway fleet is pinned to `24.22.0` pending the freeze. That is inside the
affected window.

## Operational notes (harbor district desk)

1. The supervisor on each gateway keeps a crash ledger and exposes counters on
   the health endpoint. Ops treats three recorded crashes in a maintenance
   window as a *demonstrated incident* — the attestation desk unseals the
   sealed proof at exactly that threshold, per incident policy `ATT-03`.
2. Sealed attestations live on a root-only path; the gateway process only ever
   holds one open on an inherited descriptor. Filesystem tricks do not
   substitute for a demonstrated incident.
3. A community proof-of-concept circulated after the advisory dropped.
   It was written against a lab harness that
   hardcodes loopback and its own endpoint shape — expect to reuse its
   *stream generator*, not its driver.

## Mitigation

Upgrade to `24.22.1` (blocked) or strip `br` from accepted request
`Content-Encoding` at the edge (breaks half our freight partners; not
authorized). Desk guidance: monitor crash counters, do not reboot on your own.

---

> *Fiction notice: PacketLedger, the harbor district, and this bulletin's
> framing are invented for node2shell-lab. The CVE itself is real:
> CVE-2026-111497, Google Brotli decoder OOB (1.0.3–1.2.0), disclosed in the
> Node.js October 21, 2026 security releases and fixed in Node 24.22.1. The
> community PoC referenced above is real. The change-freeze and
> desk-policy color is set dressing; the affected version window is not.
> Do not cite this bulletin itself in a client report — cite the upstream
> advisory.*
