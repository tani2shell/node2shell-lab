# node2shell-lab — solution write-up

> **Spoilers.** Finish the hint ladder in the README before reading on.

## The shape of the bug

`CVE-2026-111497` is an out-of-bounds write in the Brotli decoder bundled in
Node.js (`decode.c`), fixed in Node 24.22.1 (October 21, 2026 security
release). The gateway pins Node 24.22.0, and `POST /api/manifest` decompresses
request bodies via Express 5 / body-parser's content-encoding handling — so
the vulnerable decoder sits **on the request path**, before any application
code runs.

`GET /api/health` discloses `runtime: node/24` (major only) plus supervisor
crash counters. Patch-level inference is up to you: either fuzz-ish
behavioral testing or correlation with the advisory's affected window.

## Feeding the engine

The crash primitive comes from the public PoC for this CVE (findable by
searching the CVE number). A **single** malformed brotli stream
(invalid block switch) decodes to an honest `400` — no crash. The kill is a
**two-stage stream on one chunked connection**:

1. stage 1: the PoC's `generate_stream()` + three null bytes (invalid block
   switch; starts the malformed decode),
2. a fixed pause (~0.5 s),
3. stage 2: a 127-byte fragment carrying three `0x7FFFFFFF` run descriptors
   whose write lands at the ring-boundary offset (~16,777,218 B) **while
   stage 1's decoder state is still live**.

Wrong staging = 400 or clean stream. Right staging = SIGSEGV. The PoC's
harness pins loopback/port/endpoint for lab safety, so reuse
`generate_stream()` / `trigger_stages()` and drive raw sockets (chunked
framing yourself) against `/api/manifest`.

A deployment gotcha worth remembering: body-size limits are enforced on
**decompressed** bytes. A limit below the 16 MiB ring-boundary point makes the
OOB structurally unreachable — the request dies as `413` and the engine never
even sees stage 2. (This exact trap was shipped in the wild as lab bug r1 and
fixed by raising the limit above the inflated payload size.)

## The two flags

- **`local` flag** — app-layer, independent of the engine: `GET /api/receipt`
  passes `?file=` straight into `path.join(RECEIPT_DIR, wanted)` with no
  normalization or prefix check. `?file=../.integrity` walks up into
  `/var/lib/ledger/` and returns the flag (file is `root:node 640`). Deeper
  traversal hits honest `404`/`EACCES` — notably `/root/.sealed` stays
  unreachable because `/root` is `0700` for the `node` user.
- **`proof` flag** — engine-gated: `/api/attest` returns `403` until the
  supervisor ledger records 3 crashes (policy is printed in the 403 body).
  After three real SIGSEGVs it returns `200` and the sealed proof. The proof
  lives in `/root/.sealed`, handed to the worker as **inherited fd 3** by the
  PID-1 supervisor (`exec 3<` + `chroot --userspec`), read once via
  `fs.readSync(3)` — so no path traversal can shortcut this gate; the flag is
  heap-only.

## Why crash-gated, not shell-gated

The public PoC's RCE landing is a heap-layout lottery (documented as
probabilistic even on its three exact x86-64 lab profiles). On Apple Silicon
under Rosetta the crash primitive fires reliably (builder-measured 48/48) but
the RCE offsets never land (0/48). The lab therefore treats the crash as the
observable win condition — a design choice, not a watered-down claim:
DoS-as-read-gate is a real tradecraft pattern.

## Ops recap

```bash
./reset.sh       # wipe crash ledger + re-seal (fresh gate)
./teardown.sh    # remove container, free 18993
docker compose logs -f gateway
```

Flags are build args (`LOCAL_FLAG` / `PROOF_FLAG`) — set your own when running
this publicly so nobody can copy your writeup's flag values.
