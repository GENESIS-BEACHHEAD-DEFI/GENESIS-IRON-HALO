# GENESIS-IRON-HALO

**Sandboxed Decontamination Chamber — Operator Return Security Pipeline**

Port: **8680**

> "All returning operators are contaminated by default."
> "Even a hint of a clone or mistiming — BURN."
> "We take no prisoners. We protect what we love."

---

## What It Does

1. Receives returning operators via `POST /return` and runs a full security pipeline before extracting any intelligence.
2. Enforces the **Five-Pound Note Doctrine** — every dispatched operator holds one half of a cryptographic HMAC token; Iron Halo holds the other. If halves do not match on return, the operator is burned immediately.
3. Implements **Centurion Mutual Authentication (v1.3)** — before delivering alpha, operators challenge Iron Halo to prove its identity via Centurion-signed proofs. Prevents adversary mirror attacks (fake endpoints stealing alpha).
4. Runs **AI-powered behavioural inspection** with 10 checks (timing analysis, clone detection, narrative fingerprint, data consistency, gas anomaly, behaviour history, empty report, plus class-specific checks) producing verdicts: CLEAN, SUSPICIOUS, CONTAMINATED, KRYPTONITE, or ADVERSARY_DETECTED.
5. Manages **7 operator classes** with distinct handling: PAYLOAD (real yield), RECON (standard debrief), CHAOS_REGIMENT (403 immediate burn — self-destruct class never returns), DEEP_COVER (mothership extraction), PHANTOM_STACK (KRYPTONITE debrief with dynamic questioning), PATSY (honeypot — adversary detection on return), DECOY (legacy backwards compat).
6. Operates the **Blackboard Architecture v1.2** — two external adversary AIs (Blue Team forensic analyst + Red Team adversarial reviewer) that never communicate directly. Iron Halo is the sole deterministic judge. Bidirectional anonymity enforced.
7. Enforces a **7-rule Parcel Firewall** scanning all AI advisory parcels before propagation: INSTRUCTION_DISGUISED, PARAMETER_OUT_OF_BOUNDS, CONFIDENCE_SPIKE, ARCHITECTURE_REFERENCE, SIZE_ANOMALY, ESCALATION_LOGIC, TIMESTAMP_FINGERPRINT.
8. Implements **Sealed Mission Manifests (v1.3)** — DARPA seals expected yield at dispatch; a reconciliation engine (5 checks: manifest integrity SHA-256, yield variance, parameter match, clip size variance, TX verification) compares sealed expectations against actual execution receipts. No skimming, no side-drops.
9. Runs the **Strike Protocol (v1.3.1)** — defensive self-destruct doctrine. Strike One = dark mode (silent detection, adversary unaware). Strike Two = scorched earth (6 actions: KEYS_WIPED, ALPHA_POISONED, STATE_CORRUPTED, ROUTES_DESTROYED, EVIDENCE_PRESERVED, SELF_DESTRUCTED). Evidence hash preserved to Ledger Lite before destruction.
10. Operates a **Dead Man's Switch** monitoring advisory AIs for probe attempts across 4 pattern categories (WALLET, CONTRACT, OPERATOR, INFRASTRUCTURE). 3 suspicious probes = LOCKDOWN.
11. Full debrief pipeline: DEBRIEF, SANITISE, EXTRACT, BURN. KRYPTONITE protocol for PHANTOM_STACK with dynamic cross-validation questioning. Evidence chain hashing. Intel forwarded to GTC, Brighton, Whiteboard, Ledger Lite.
12. **GOLDEN RULE**: ALL operators burned after mission. No exceptions. No mission 2. Zero fingerprint.

---

## Architecture

| File | Purpose | Lines |
|------|---------|-------|
| `src/index.ts` | Express server, all endpoints, processing loop, full security pipeline | 1085 |
| `src/types.ts` | Type definitions — 7 operator classes, contamination levels, return reports, advisory types, strike types, reconciliation types | 692 |
| `src/services/quarantine.service.ts` | First-stage decontamination, priority queue (KRYPTONITE first), admission, flagging | 186 |
| `src/services/inspection.service.ts` | AI behavioural inspection, 10 checks, clone detection, class-specific checks, PATSY marker detection | 420 |
| `src/services/handshake.service.ts` | Cryptographic handshake v1.3 — Five-Pound Note + Centurion mutual authentication, HMAC-SHA256 | 429 |
| `src/services/debrief.service.ts` | Full debrief pipeline — DEBRIEF/SANITISE/EXTRACT/BURN, KRYPTONITE protocol, evidence chain, downstream forwarding | 524 |
| `src/services/reconciliation.service.ts` | Sealed mission manifest, 5-check reconciliation engine, yield variance detection | 478 |
| `src/services/strike-protocol.service.ts` | Strike Protocol — dark mode + scorched earth, attempt tracking, evidence preservation to Ledger Lite | 408 |
| `src/services/dead-mans-switch.service.ts` | Advisory AI probe detection, 4 pattern categories, lockdown trigger | 249 |
| `src/services/advisory/blackboard.service.ts` | Blackboard Architecture orchestrator — 13-step advisory cycle, data stripping, GTC audit trail | 499 |
| `src/services/advisory/analyst.interface.ts` | IAnalyst abstraction — SIMULATION or API mode | 40 |
| `src/services/advisory/analyst-simulation.adapter.ts` | Deterministic rule-based Blue/Red Team analysis for testing/default mode | 393 |
| `src/services/advisory/analyst-api.adapter.ts` | Real external AI calls (ChatGPT/Perplexity), Value Aligned prompts, metadata stripping | 229 |
| `src/services/advisory/dropzone.service.ts` | Dead-drop one-way read-only zones, write-once/read-once, expiry, quarantine | 189 |
| `src/services/advisory/firewall.service.ts` | 7-rule parcel firewall, content inspection, sanitisation for Red Team | 328 |
| `src/services/advisory/circuit-breaker.service.ts` | Per-analyst circuit breakers (CLOSED/OPEN/HALF_OPEN), anomaly detection, verdict shift detection | 221 |
| `src/services/advisory/decision-matrix.service.ts` | Deterministic decision matrix — Blue+Red verdicts mapped to advisory action | 231 |
| `src/services/advisory/parcel-renderer.service.ts` | Cold document renderer — plain text parcels, zero metadata, parse/render | 190 |
| `src/services/advisory/schema-generator.service.ts` | Dynamic per-mission schemas, one-time use, KRYPTONITE extra questions, Fisher-Yates shuffle | 204 |
| `package.json` | genesis-iron-halo v1.0.0 — Express 4.18.2, TypeScript 5.3.3 | — |
| `Dockerfile` | node:20.20.0-slim, EXPOSE 8680 | 8 |

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/return` | Operator returns from mission — full security pipeline (class check, inspection, handshake, quarantine, advisory, debrief, burn) |
| `POST` | `/handshake/issue` | DARPA issues handshake tokens before dispatch (v1.3: includes Centurion mutual auth tokens) |
| `POST` | `/mutual/verify` | Operator challenges Iron Halo to prove identity before delivering alpha (v1.3) |
| `POST` | `/manifest/seal` | DARPA seals expected yield parameters at dispatch (v1.3) |
| `POST` | `/manifest/reconcile` | Reconcile execution receipt against sealed manifest (v1.3) |
| `GET` | `/manifest/:id` | Get sealed manifest status |
| `GET` | `/reconciliation` | Recent reconciliation results and stats |
| `GET` | `/health` | Service health — quarantine queue, handshake stats, inspection stats, advisory state, reconciliation, strike protocol |
| `GET` | `/state` | Full Iron Halo state — security, quarantine queue, debrief stats, recent completed records |
| `GET` | `/record/:id` | Get specific record by ID (quarantine or completed) |
| `GET` | `/flagged` | Flagged operators in quarantine and completed |
| `GET` | `/burns` | Immediate burn log |
| `GET` | `/kryptonite` | PHANTOM_STACK KRYPTONITE debrief protocol status |
| `GET` | `/adversary` | Adversary detection log — PATSY honeypot clones detected |
| `POST` | `/patsy/register` | Register PATSY marker for adversary detection |
| `GET` | `/advisory/state` | Blackboard Architecture state (v1.2) |
| `GET` | `/advisory/history` | Recent advisory verdicts history (v1.2) |
| `POST` | `/advisory/reset` | Reset both analyst circuit breakers (v1.2) |
| `GET` | `/advisory/firewall` | Recent parcel firewall violations (v1.2) |
| `GET` | `/strikes` | Strike Protocol log — failed attempts + scorched earth events (v1.3.1) |
| `GET` | `/strikes/scorched-earth` | Scorched earth event detail (v1.3.1) |
| `GET` | `/lockdown/status` | Dead Man's Switch status |
| `POST` | `/lockdown/reset` | Commander manual lockdown restart |
| `POST` | `/lockdown/scan` | Test scan text for probe patterns |
| `POST` | `/red-team/ingest` | Receive decontaminated Red Aggressor Force attack reports |

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8680` | Server port |
| `GTC_URL` | `http://genesis-beachhead-gtc:8650` | GTC telemetry endpoint |
| `LEDGER_LITE_URL` | `http://genesis-ledger-lite:8500` | Ledger Lite compliance endpoint |
| `HANDSHAKE_SECRET` | Random 64 bytes | HMAC key for Five-Pound Note handshake |
| `CENTURION_SECRET` | Random 64 bytes | Centurion master signing key for mutual authentication |
| `HANDSHAKE_EXPIRY_MS` | `7200000` (2 hours) | Default handshake token expiry |
| `ADVISORY_ENABLED` | `false` | Enable Blackboard Architecture v1.2 |
| `ADVISORY_MODE` | `SIMULATION` | Analyst mode: `SIMULATION` (deterministic) or `API` (real AI calls) |
| `ADVISORY_MIN_DURATION_MS` | `5000` | Minimum advisory cycle duration (anti-timing side-channel) |
| `ADVISORY_ZONE_EXPIRY_MS` | `60000` | Drop zone expiry in ms |
| `ADVISORY_BLUE_API_URL` | — | Blue Team API URL (API mode only) |
| `ADVISORY_BLUE_API_KEY` | — | Blue Team API key (API mode only) |
| `ADVISORY_RED_API_URL` | — | Red Team API URL (API mode only) |
| `ADVISORY_RED_API_KEY` | — | Red Team API key (API mode only) |
| `ADVISORY_API_TIMEOUT_MS` | `30000` | API call timeout (API mode only) |
| `CIRCUIT_BREAKER_THRESHOLD` | `3` | Consecutive failures before circuit breaker trips |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `300000` (5 min) | Cooldown before HALF_OPEN probe |
| `HALO_PROCESS_INTERVAL_MS` | `2000` | Background processing loop interval |
| `HALO_PURGE_INTERVAL_MS` | `300000` (5 min) | Expired handshake token purge interval |
| `STRIKE_TWO_THRESHOLD` | `2` | Failed attempts before scorched earth |
| `DEAD_MANS_SWITCH_THRESHOLD` | `3` | Suspicious probes before lockdown |

---

## Integration

| Talks To | Direction | Purpose |
|----------|-----------|---------|
| GTC (port 8650) | OUT | Telemetry — every event, advisory cycle, adversary detection, strike protocol, red team reports |
| Brighton Protocol (port 8670) | OUT | Intelligence forwarding — debrief insights for pattern analysis |
| Whiteboard (port 8710) | OUT | Clean intel forwarding — sanitised DOCTRINE/ACTIONABLE intel |
| Ledger Lite (port 8500) | OUT | Compliance — strike protocol evidence hashes, reconciliation results |
| DARPA | IN | Issues handshake tokens (`/handshake/issue`), seals manifests (`/manifest/seal`) |
| Operators | IN | Return via `POST /return` with operatorToken and execution receipt |
| Red Aggressor Force | IN | Decontaminated attack reports via `POST /red-team/ingest` |

Network: **ISOLATED** — cannot reach core systems. Communication is ONE-WAY POST to GTC/Brighton/Whiteboard/Ledger Lite only.

---

## Current State

- **Version**: v1.3.1
- **Status**: Built, compiled, deployed in Docker
- **Security Pipeline**: CLASS_CHECK -> MUTUAL_VERIFY -> INSPECT -> HANDSHAKE -> QUARANTINE -> ADVISORY -> DEBRIEF -> RECONCILE -> SANITISE -> EXTRACT -> BURN
- **Blackboard Architecture**: Operational in SIMULATION mode; API mode requires external AI endpoint configuration
- **Strike Protocol**: Armed — threshold 2 failed attempts before scorched earth

---

## Future Editions

1. **Real wallet key destruction** — v1 scorched earth is logical; future versions with real wallets will sweep balances and destroy private keys during KEYS_WIPED phase.
2. **Live AI advisory mode** — connect Blue Team (ChatGPT) and Red Team (Perplexity) via API for production-grade adversarial forensic analysis.
3. **Cross-operator pattern analysis** — aggregate debrief insights across all returning operators to detect slow-burn compromise campaigns.
4. **RAPIDS cuML integration** — GPU-accelerated anomaly detection in the inspection pipeline for sub-millisecond clone detection.
5. **Ensemble scoring in inspection** — weight multiple weak signals rather than single-threshold checks for more nuanced contamination verdicts.
6. **Dynamic KRYPTONITE questioning** — Brighton-driven question generation based on current adversary intelligence, replacing static question pool.

---

## Rail Deployment

| Rail | Status | Notes |
|------|--------|-------|
| Rail 1 (Cash Rail) | DEPLOYED | Primary decontamination chamber for all CEX/DEX operator returns |
| Rail 2+ | PLANNED | Model T19 — same service, different rail config |
