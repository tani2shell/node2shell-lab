[English](README.md) · [中文](README.zh.md) · [日本語](README.ja.md)

# node2shell-lab

A lightweight, single-container pentest lab about an **engine-level decompression
bug**: the app layer is boring, the decoder underneath it is not.

You are triage on-call for **PacketLedger**, a freight-manifest gateway for the
harbor district. Routine traffic, routine app — except the intake API happily
decompresses brotli request bodies on a runtime that ships a *very* interesting
advisory. The attestation desk upstairs refuses to hand over the sealed proof
until someone can *demonstrate* an engine incident. Three crashes. That's the policy.

> **📌 Real CVE, invented story — please read.**
> `CVE-2026-111497` is **real**: an out-of-bounds write in the Brotli decoder
> bundled with Node.js (Google Brotli 1.0.3–1.2.0), published to NVD on
> 2026-10-22 and fixed in Node 24.22.1 by the
> [October 21, 2026 Node.js security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
> ([NVD entry](https://nvd.nist.gov/vuln/detail/CVE-2026-111497)).
> "Node2Shell" is *this lab's nickname* for the bug, not an official name — and
> not a promise (see win condition below). `docs/ADVISORY.md` wraps the real
> facts in an in-world storyline: the story is fiction, the CVE is not.

> **🎯 Honest win condition.** This lab is gated on a *demonstrated engine
> crash* (a reliable DoS-class primitive), not on catching a shell. Full RCE
> landing is heap-layout dependent and explicitly **bonus** — see
> "Platform notes". If you get a SIGSEGV and the crash counter moves, you have
> won the gate; do not burn your evening chasing `/bin/sh`.

## What's inside

- **2 flags** (OffSec-style pair): a `local` flag reachable through an
  application-layer primitive, and a `proof` flag held behind an engine-level gate.
- App surface: ~200 LOC of Node/Express. The real target is what lives *below* it.
- No credentials to find, no rabbit-hole content. Small by design; clone-to-playable
  in under two minutes.

## Difficulty

**Medium-hard (≈3.5 / 5)** for anyone who has not worked a decompression bug before;
**medium** if you have. The steep part is not the payload — it's realizing *where*
the bug lives and *how* the engine wants to be fed.

Calibration: the full solve chain has been verified end-to-end by a local LLM agent.

## Quick start

Prerequisites: Docker Engine (or Docker Desktop) with the compose plugin, plus
Python 3 (stdlib only, no pip installs — needed to run the reference PoC
generator referenced by hint-ladder step 5).
The image is `linux/amd64` — on Apple Silicon Docker Desktop runs it under
Rosetta (supported, see platform notes); on Windows use WSL2 + Docker Desktop.

```bash
git clone <repo-url> node2shell-lab && cd node2shell-lab

# Build (flags are build args — defaults work out of the box, set your own to be unique)
docker compose build \
  --build-arg LOCAL_FLAG='FLAG{y…l_1}' \
  --build-arg PROOF_FLAG='FLAG{y…f_1}'

docker compose up -d

# Confirm it is alive (published on 0.0.0.0:18993 — all interfaces; add a
# 127.0.0.1: prefix to the compose port mapping to tighten it to loopback)
curl http://127.0.0.1:18993/api/health
```

Entry point: `http://127.0.0.1:18993/` — the landing page lists the public intake surface.

Ops:

```bash
./reset.sh      # factory reset: wipes the crash ledger, re-seals the attestation
./teardown.sh   # stop and remove the container, free port 18993
docker compose logs -f gateway   # supervisor + worker log stream
```

## The brief

- `GET /` lists endpoints and accepted encodings. Read it, then read `/api/health`.
- The attestation desk (`GET /api/attest`) states its unseal policy in the 403
  body itself — the knowledge gate is *knowing what to send*, not guessing state.
- One advisory document ships in this repo (`docs/ADVISORY.md`). Consider it the
  only intel you get. Read it twice.
- Flags never appear in any world-readable path. If you find a file you "shouldn't"
  be able to read, you're playing right.

## Hint ladder

Work top-down; peel one rung at a time.

1. **Recon is the whole first act.** Enumerate what `GET /` advertises. The health
   endpoint discloses runtime info and *ops counters* — ask yourself what a
   supervisor counting crashes implies about this deployment's history.
2. The manifest intake accepts compressed request bodies. Fuzz the
   `Content-Encoding` header and note which decoders are *live on the request
   path* — not on your side of the wire, on *theirs*.
3. Open `docs/ADVISORY.md`. Match the affected version range against what
   `/api/health` actually disclosed. Is this box patched?
4. A single malformed brotli stream earns you an honest `400` and no crash —
   that is not a failure, that is a boundary. The advisory's phrase
   "multi-stage stream" is load-bearing. Two stages, one connection, a pause between.
5. A public PoC exists for this exact CVE — search GitHub by the CVE number and
   find it yourself. Its payload *generator* is worth borrowing (subject to its
   own license); its *harness* pins loopback and a fixed endpoint — tear it down
   and drive raw sockets against `/api/manifest` yourself.
6. Three recorded crashes (`/api/health` → `crashes: 3`) unseal `/api/attest`.
   The sealed proof is read from an inherited file descriptor, not a path —
   that's why path traversal can never shortcut the engine gate.
7. The `local` flag is app-layer, not engine-layer: look hard at how the receipt
   lookup builds a path from your query string. `path.join` does not normalize
   the way you'd hope.

## Platform notes

- **Apple Silicon (arm64):** the lab runs amd64-on-Rosetta by design. The crash
  primitive fires reliably (builder-measured 48/48); the *public-PoC RCE landing*
  does not (0/48) because x86 heap-layout assumptions break under Rosetta — this
  is precisely why the win condition is the crash gate. The lab is fully
  solvable on Apple Silicon; "bonus RCE" is not.
- **Native linux/amd64 (including cloud VMs and WSL2):** everything works;
  experimenters have reported RCE-class landings possible on bare x86_64 with
  tuning, at your own time-budget.
- **arm64-native Node:** the vulnerability class also exists on arm64 in
  reality, but the public PoC profile here targets x86_64 offsets. Expect to
  adapt or settle for the crash gate.
- No version banner beyond the runtime major line (`node/24`) is given, on
  purpose — patch-level inference is part of the exercise.

## What you'll practice

Request-path decoder fuzzing · version/patch inference from thin disclosure ·
advisory-to-environment correlation · multi-stage chunked-request timing
craft · treating a crash as an *observable primitive* · path traversal on
`path.join`-style joins · reading a PoC harness and reusing its generator
against a different shape.

## Layout

```
app/            image build context (Dockerfile, entrypoint, server.js, flags via build args)
docs/ADVISORY.md   in-world vendor bulletin (your only intel)
docker-compose.yml single service, isolated bridge net, 2 CPU / 1 GB caps
reset.sh / teardown.sh
```

Solution write-up: `docs/SOLUTION.md` (spoilers — finish the ladder first).

## License

MIT. Built as a training target; no real credentials or secrets anywhere in the
image — everything in it is synthetic by design.
