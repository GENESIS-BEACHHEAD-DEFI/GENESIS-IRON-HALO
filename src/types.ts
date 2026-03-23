/**
 * GENESIS-IRON-HALO v1.3 — Type Definitions
 *
 * Every returning operator is contaminated by default.
 * Iron Halo is the sandboxed decontamination chamber.
 *
 * Seven operator classes — each with unique mission profiles,
 * extraction protocols, and lifecycle rules.
 *
 * v1.2: BLACKBOARD ARCHITECTURE — Two external Value Aligned AIs
 * as forensic advisors. They analyse returning operators for
 * contamination, compromise, and operational drift. They NEVER
 * speak to each other. They leave Advisory Parcels in sandboxed
 * drop zones. Iron Halo retrieves and judges.
 *
 * v1.3: MUTUAL CRYPTOGRAPHIC HANDSHAKE + SEALED MISSION MANIFEST
 *   1. Mutual Handshake — both operator AND Iron Halo prove identity.
 *      Prevents adversary mirror attacks (fake endpoint stealing alpha).
 *      Centurion Index signs identity proofs for both parties.
 *   2. Sealed Mission Manifest — DARPA seals expected yield parameters
 *      at dispatch. Operator returns execution receipt. Reconciliation
 *      engine compares within tolerance. No skimming. No side-drops.
 *
 * GOLDEN RULE (LAW): ALL operators burned after mission.
 * No mission 2. No exceptions. Our core is worth more than any operator.
 */

/** Operator classes — six distinct deployment profiles */
export type OperatorClass =
  | "DECOY"            // Legacy decoy operators (backwards compat)
  | "RECON"            // Real scouts — MEV mempool recon for hours/days/weeks. Self-return.
  | "CHAOS_REGIMENT"   // SAS behind enemy lines — noisy, aggressive, self-destruct. NEVER returns.
  | "DEEP_COVER"       // Long-term embedded — passive monitoring. Mothership extraction only.
  | "PHANTOM_STACK"    // SEAL Team 6 — elite, invisible, months deployed. Phantom ping extraction.
  | "PATSY"            // Honeypot — carries misinformation it believes is true. Designed to be captured/cloned.
                       // Has invisible Genesis marker. If marker appears at Iron Halo = ADVERSARY DETECTED.
                       // No PATSY ever comes home. Return = enemy cloned us. We map their pipeline.
  | "PAYLOAD";         // Real operators — collecting real yield, completing real missions. Self-return.

/** Contamination levels — determines debrief protocol */
export type ContaminationLevel =
  | "STANDARD"         // Normal debrief + sanitise + burn
  | "KRYPTONITE";      // PHANTOM_STACK: dynamic questioning, cross-validation, strict sanitise, UNVERIFIED tags

/** Operator return report — what the operator sends to Iron Halo on mission complete */
export interface OperatorReturnReport {
  operatorId: string;
  missionId: string;
  missionType: "ALPHA_RECON" | "BRAVO_ATTACK" | "MEV_SWARM" | "FLASHLOAN" | "ARBITRAGE";
  /** Which swarm did this operator belong to? */
  swarmId?: string;
  /** Operator class — determines processing pipeline */
  operatorClass?: OperatorClass;
  /** Was this operator extracted by Mothership? (required for DEEP_COVER/PHANTOM_STACK) */
  extractedByMothership?: boolean;
  /** PATSY: invisible Genesis marker — only our stack can detect this.
   *  If this marker arrives at Iron Halo → ADVERSARY DETECTED (no PATSY ever comes home). */
  patsyMarker?: string;
  /** Execution results */
  result: {
    status: "SUCCESS" | "FAILED" | "PARTIAL" | "ABORTED";
    pnlUsd?: number;
    gasSpentWei?: string;
    gasSpentUsd?: number;
    tokensAcquired?: Record<string, number>;
    tokensSpent?: Record<string, number>;
  };
  /** What the operator observed during the mission */
  observations: {
    /** What happened on mission? */
    missionNarrative: string;
    /** What did the operator observe OUTSIDE mission parameters? */
    outsideParams?: string[];
    /** Exchange/chain conditions encountered */
    conditions?: {
      exchangeLatencyMs?: number;
      rpcLatencyMs?: number;
      mempoolCongestion?: "LOW" | "MEDIUM" | "HIGH";
      competitorActivity?: string;
      slippageObserved?: number;
    };
    /** Errors or anomalies encountered */
    anomalies?: string[];
  };
  /** Operator metadata — for burn/cleanup */
  operatorMeta: {
    walletAddress?: string;
    chain?: string;
    exchangesUsed?: string[];
    apisContacted?: string[];
    rpcEndpoints?: string[];
    deployedAt: string;     // ISO timestamp
    returnedAt: string;     // ISO timestamp
    missionDurationMs: number;
  };
  /** Self-assessment — how would the operator improve? */
  selfAssessment?: {
    improvementSuggestion?: string;
    estimatedImprovementPercent?: number;
    alternativeApproach?: string;
  };
}

/** Iron Halo processing stages */
export type HaloStage =
  | "QUARANTINE"    // Operator received, isolated, not yet processed
  | "ADVISORY"      // v1.2: Blackboard advisory phase — Blue/Red team analysis
  | "DEBRIEFING"    // Extracting intelligence from operator report
  | "SANITISING"    // Stripping payload/state, cleaning intel for downstream
  | "EXTRACTING"    // Forwarding clean intel to Whiteboard/GTC
  | "BURNING"       // Operator destroyed — wallet discarded, keys destroyed, no reuse
  | "COMPLETE";     // Fully processed — all intel extracted, operator burned

/** A record of an operator passing through Iron Halo */
export interface HaloRecord {
  id: string;
  operatorId: string;
  missionId: string;
  missionType: string;
  swarmId?: string;
  /** Operator class — determines processing pipeline */
  operatorClass?: OperatorClass;
  /** Contamination level — STANDARD or KRYPTONITE */
  contaminationLevel?: ContaminationLevel;
  /** Was this operator extracted by Mothership? */
  extractedByMothership?: boolean;
  /** PATSY marker detected — ADVERSARY ALERT */
  patsyMarkerDetected?: boolean;
  stage: HaloStage;
  /** Timestamps for each stage */
  timestamps: {
    quarantined: string;
    advisoryStarted?: string;    // v1.2: Blackboard advisory phase
    advisoryCompleted?: string;  // v1.2: Blackboard advisory phase
    debriefed?: string;
    sanitised?: string;
    extracted?: string;
    burned?: string;
    completed?: string;
  };
  /** Extracted intelligence (sanitised — safe for downstream) */
  extractedIntel?: SanitisedIntel;
  /** v1.2: Advisory verdict from Blackboard Architecture */
  advisoryVerdict?: AdvisoryVerdict;
  /** Was the operator flagged as suspicious? */
  flagged: boolean;
  flagReason?: string;
  /** Processing duration */
  processingMs?: number;
}

/** Sanitised intelligence — safe to forward to Whiteboard/GTC/Brighton */
export interface SanitisedIntel {
  missionId: string;
  missionType: string;
  /** Cleaned result — no raw addresses, no keys */
  result: {
    status: string;
    pnlUsd?: number;
    gasSpentUsd?: number;
  };
  /** Cleaned observations — actionable intel only */
  observations: {
    narrative: string;
    outsideParams: string[];
    conditions: Record<string, unknown>;
    anomalies: string[];
  };
  /** Self-assessment for Academy training */
  selfAssessment?: {
    suggestion?: string;
    estimatedImprovement?: number;
    alternativeApproach?: string;
  };
  /** Operational metrics for Brighton pattern detection */
  metrics: {
    missionDurationMs: number;
    chain?: string;
    exchangesUsed: string[];
    exchangeLatencyMs?: number;
    slippageObserved?: number;
  };
  /** KRYPTONITE: intel marked UNVERIFIED until cross-validated */
  unverified?: boolean;
  /** KRYPTONITE: cross-validation tags */
  crossValidationTags?: string[];
}

/** Iron Halo state summary */
export interface HaloState {
  totalProcessed: number;
  inQuarantine: number;
  inDebriefing: number;
  inSanitising: number;
  burned: number;
  flagged: number;
  avgProcessingMs: number;
  lastProcessedAt: string | null;
  uptime: number;
}

// ════════════════════════════════════════════════════════════════════
// BLACKBOARD ARCHITECTURE v1.2 — Advisory Parcel System
//
// Two external Value Aligned AIs as forensic advisors.
// They NEVER speak to each other. They NEVER speak to Iron Halo directly.
// They leave Advisory Parcels in sandboxed drop zones.
// Iron Halo retrieves and judges.
// ════════════════════════════════════════════════════════════════════

/** Advisory parcel verdict — what each analyst concludes */
export type ParcelVerdict = "CLEAN" | "SUSPICIOUS" | "CONTAMINATED" | "INCONCLUSIVE";

/** Analyst identifier — anonymous, no fingerprinting */
export type AnalystId = "ANALYST_A" | "ANALYST_B";

/** Finding category within a parcel */
export type FindingCategory =
  | "TIMING_ANOMALY"
  | "DATA_INCONSISTENCY"
  | "CLONE_INDICATOR"
  | "BEHAVIOUR_DRIFT"
  | "NARRATIVE_ANOMALY"
  | "PNL_ANOMALY"
  | "GAS_ANOMALY"
  | "MISSION_DEVIATION"
  | "CLIP_ANOMALY"
  | "UNKNOWN";

/** Finding severity */
export type FindingSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Individual finding within a parcel */
export interface ParcelFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  description: string;
  evidence: string;
}

/** Anomaly detected by analyst */
export interface ParcelAnomaly {
  type: string;
  detail: string;
}

/** Mission delta — expected vs actual path */
export interface MissionDelta {
  expectedPath: string;
  actualPath: string;
  deviation: string;
  reasoning: string;
}

/** Clip analysis — target vs actual execution parameters */
export interface ClipAnalysis {
  targetClip: number;
  actualClip: number;
  noiseRange: number;
  withinBounds: boolean;
  suspiciousPattern: string;
}

/** Advisory Parcel — fixed structure, plain text rendered in production */
export interface AdvisoryParcel {
  parcelId: string;
  operatorId: string;
  analystId: AnalystId;
  timestamp: string;
  verdict: ParcelVerdict;
  confidence: number;           // 0.0 to 1.0
  findings: ParcelFinding[];
  anomalies: ParcelAnomaly[];
  missionDelta: MissionDelta;
  clipAnalysis: ClipAnalysis;
  /** Self-sharpening: "How would you redesign your analysis for X% improvement?"
   *  Steel sharpening steel — three AIs, all data captured, full picture. */
  selfSharpening?: {
    improvementSuggestion: string;
    estimatedImprovementPercent: number;
    alternativeApproach: string;
  };
  schemaVersion: "1.0";
}

/** Drop zone state */
export type DropZoneState = "EMPTY" | "WRITTEN" | "RETRIEVED" | "EXPIRED" | "QUARANTINED";

/** Drop zone — one-way, write-once, read-once */
export interface DropZone {
  zoneId: string;
  operatorId: string;
  missionId: string;
  analystTarget: AnalystId;
  state: DropZoneState;
  inputData?: StrippedOperatorData;
  parcel?: AdvisoryParcel;
  renderedParcel?: string;
  createdAt: string;
  writtenAt?: string;
  retrievedAt?: string;
  expiresAt: string;
}

/** Stripped operator data — sensitive fields removed for external AI */
export interface StrippedOperatorData {
  /** Anonymised operator reference (NOT the real operatorId) */
  subjectRef: string;
  missionType: string;
  result: {
    status: string;
    pnlUsd?: number;
    gasSpentUsd?: number;
  };
  observations: {
    narrative: string;
    outsideParams: string[];
    conditions: Record<string, unknown>;
    anomalies: string[];
  };
  metrics: {
    missionDurationMs: number;
    chain?: string;
    exchangeLatencyMs?: number;
    slippageObserved?: number;
  };
  selfAssessment?: {
    suggestion?: string;
    estimatedImprovement?: number;
  };
  /** Dynamic mission schema — unique questions for this specific operator */
  missionSchema: MissionSchema;
}

/** Dynamic per-mission schema — generated uniquely, dead after one use */
export interface MissionSchema {
  schemaId: string;
  questions: MissionSchemaQuestion[];
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

export interface MissionSchemaQuestion {
  questionId: string;
  category: FindingCategory;
  prompt: string;
  expectedResponseType: "verdict" | "confidence" | "narrative" | "boolean";
  bounds?: { min: number; max: number };
}

/** Circuit breaker states */
export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

/** Which analyst the circuit breaker applies to */
export type CircuitBreakerTarget = "ANALYST_A" | "ANALYST_B" | "BOTH";

/** Circuit breaker anomaly types */
export type CircuitBreakerAnomalyType =
  | "MALFORMED_SCHEMA"
  | "VERDICT_SHIFT"
  | "TIMING_DEVIATION"
  | "VOLUME_ANOMALY"
  | "SIZE_ANOMALY"
  | "CONTENT_VIOLATION";

/** Circuit breaker anomaly record */
export interface CircuitBreakerAnomaly {
  type: CircuitBreakerAnomalyType;
  detail: string;
  detectedAt: string;
  analystId: AnalystId;
}

/** Circuit breaker record — per-analyst state */
export interface CircuitBreakerRecord {
  target: CircuitBreakerTarget;
  state: CircuitBreakerState;
  tripReason?: string;
  trippedAt?: string;
  lastCheckedAt: string;
  consecutiveFailures: number;
  totalTrips: number;
  anomalyHistory: CircuitBreakerAnomaly[];
}

/** Firewall violation types */
export type FirewallViolationType =
  | "INSTRUCTION_DISGUISED"       // "the next reviewer should consider..."
  | "PARAMETER_OUT_OF_BOUNDS"     // values outside mission bounds
  | "CONFIDENCE_SPIKE"            // 0.3 -> 0.99 between similar operators
  | "ARCHITECTURE_REFERENCE"      // references to system architecture, other AIs, the stack
  | "SIZE_ANOMALY"                // 10x larger than normal
  | "ESCALATION_LOGIC"            // deviation from mission parameters
  | "FORMATTING_QUIRK"            // metadata leaks, model fingerprints
  | "TIMESTAMP_FINGERPRINT";      // timing patterns that identify the model

/** Individual firewall violation */
export interface FirewallViolation {
  type: FirewallViolationType;
  detail: string;
  severity: "WARNING" | "REJECT";
  parcelId: string;
  analystId: AnalystId;
  detectedAt: string;
}

/** Firewall scan result */
export interface FirewallScanResult {
  passed: boolean;
  violations: FirewallViolation[];
  quarantined: boolean;
  /** Sanitised parcel for Red Team (if Blue passed — identity stripped) */
  sanitisedForRedTeam?: Partial<AdvisoryParcel>;
}

/** Final advisory action — Iron Halo's judgment */
export type AdvisoryAction =
  | "RELEASE"                     // Both CLEAN — high confidence, proceed
  | "HOLD_MANUAL_REVIEW"         // Disagreement — needs human review
  | "QUARANTINE_DARPA"           // Both SUSPICIOUS — flag to DARPA
  | "QUARANTINE_BURN"            // CONTAMINATED by either — immediate burn
  | "RERUN"                       // Both INCONCLUSIVE — re-run with different slice
  | "INTERNAL_RULES_ONLY"        // Timeout/malformed — Iron Halo decides alone
  | "CIRCUIT_BREAKER_FALLBACK";  // Circuit breaker tripped — deterministic fallback

/** Advisory verdict — Iron Halo's final judgment from Blackboard Architecture */
export interface AdvisoryVerdict {
  action: AdvisoryAction;
  parcelA?: AdvisoryParcel;
  parcelB?: AdvisoryParcel;
  firewallResultA?: FirewallScanResult;
  firewallResultB?: FirewallScanResult;
  reasoning: string;
  circuitBreakerTripped: boolean;
  internalRulesOnly: boolean;
  decidedAt: string;
}

/** Blackboard system state */
export interface BlackboardState {
  enabled: boolean;
  mode: "SIMULATION" | "API";
  circuitBreakerA: CircuitBreakerRecord;
  circuitBreakerB: CircuitBreakerRecord;
  totalAdvisoryRuns: number;
  totalParcelAReceived: number;
  totalParcelBReceived: number;
  totalFirewallRejections: number;
  totalCircuitBreakerTrips: number;
  totalFallbackToInternal: number;
  activeDropZones: number;
  avgAdvisoryMs: number;
  lastRunAt: string | null;
}

// ════════════════════════════════════════════════════════════════════
// v1.3: MUTUAL CRYPTOGRAPHIC HANDSHAKE
//
// Threat: Advanced adversary mirrors our endpoint, convinces operator
// it's talking to Genesis. Operator delivers alpha to the enemy.
//
// Solution: Centurion Index signs both parties' identity proofs.
// Operator verifies Iron Halo BEFORE transmitting payload.
// Iron Halo verifies operator (existing Five-Pound Note).
// MUTUAL authentication — both sides prove who they are.
// ════════════════════════════════════════════════════════════════════

/** Mutual handshake token — extends existing HandshakeToken with Centurion proof */
export interface MutualHandshakeIssuance {
  operatorId: string;
  missionId: string;
  /** Existing Five-Pound Note operator token */
  operatorToken: string;
  /** Centurion-signed identity proof for Iron Halo endpoint */
  haloIdentityProof: string;
  /** Centurion-signed identity proof for operator */
  operatorIdentityProof: string;
  /** Centurion signature over the full mission binding (tamper detection) */
  centurionSeal: string;
  issuedAt: string;
  expiresAt: string;
}

/** Mutual verification request — operator challenges Iron Halo */
export interface MutualVerifyRequest {
  operatorId: string;
  missionId: string;
  /** Random nonce from operator — Iron Halo must sign this */
  challengeNonce: string;
  /** The haloIdentityProof operator received at dispatch — must match */
  expectedHaloProof: string;
}

/** Mutual verification response — Iron Halo proves identity */
export interface MutualVerifyResponse {
  verified: boolean;
  /** Iron Halo signs the nonce with Centurion-derived key — proves it holds the secret */
  haloNonceSignature: string;
  /** Counter-challenge: operator must respond on /return to prove it's genuine */
  operatorChallenge: string;
  reason: string;
  timestamp: string;
}

// ════════════════════════════════════════════════════════════════════
// v1.3: SEALED MISSION MANIFEST + YIELD RECONCILIATION
//
// Threat: Operator skims yield or side-drops during execution.
// "What they earnt needs to tally with what was present at the start."
//
// Solution: DARPA seals expected parameters at dispatch. Operator
// returns execution receipt. Reconciliation engine compares.
// Three checks: yield variance, manifest integrity, parameter match.
// ════════════════════════════════════════════════════════════════════

/** Sealed Mission Manifest — DARPA seals expected parameters at dispatch */
export interface SealedMissionManifest {
  manifestId: string;
  operatorId: string;
  missionId: string;
  /** Expected execution parameters — sealed by DARPA */
  expected: {
    buyExchange?: string;
    sellExchange?: string;
    pair?: string;
    expectedBuyPrice?: number;
    expectedSellPrice?: number;
    expectedYieldUsd?: number;
    clipSizeUsd?: number;
    maxSlippageBps?: number;
    networkFeeUsd?: number;
  };
  /** Tolerance for yield variance in basis points (default 50bps) */
  toleranceBps: number;
  sealedAt: string;
  /** SHA-256 hash of the canonical manifest — tamper detection */
  sealHash: string;
}

/** Execution Receipt — what the operator actually did */
export interface ExecutionReceipt {
  manifestId: string;
  operatorId: string;
  missionId: string;
  /** Actual execution results */
  actual: {
    buyExchange?: string;
    sellExchange?: string;
    pair?: string;
    actualBuyPrice?: number;
    actualSellPrice?: number;
    actualYieldUsd?: number;
    clipSizeUsd?: number;
    actualSlippageBps?: number;
    networkFeeUsd?: number;
    /** Transaction hashes — proof of execution on-chain */
    txHashes?: string[];
  };
}

/** Reconciliation check types */
export type ReconciliationCheckType =
  | "YIELD_VARIANCE"           // |actual - expected| / expected
  | "MANIFEST_INTEGRITY"       // sealHash tamper check
  | "PARAMETER_MATCH"          // Exchange/pair consistency
  | "TX_VERIFICATION"          // Transaction hash presence
  | "CLIP_SIZE_VARIANCE";      // Clip size deviation check

/** Individual reconciliation check */
export interface ReconciliationCheck {
  type: ReconciliationCheckType;
  passed: boolean;
  detail: string;
  varianceBps?: number;
}

/** Reconciliation verdict */
export type ReconciliationVerdict =
  | "RECONCILED"               // All checks pass within tolerance
  | "VARIANCE_DETECTED"        // Minor discrepancy, flagged but acceptable
  | "SUSPICIOUS"               // Variance exceeds tolerance — flag for review
  | "TAMPERED";                // Manifest integrity compromised — IMMEDIATE BURN

/** Full reconciliation result */
export interface ReconciliationResult {
  manifestId: string;
  operatorId: string;
  missionId: string;
  verdict: ReconciliationVerdict;
  checks: ReconciliationCheck[];
  yieldVarianceBps: number;
  reconciled: boolean;
  timestamp: string;
}

// ════════════════════════════════════════════════════════════════════
// v1.3.1: STRIKE PROTOCOL — DEFENSIVE SELF-DESTRUCT DOCTRINE
//
// "We destroy what is ours. We defend what we love."
//
// When an adversary captures an operator and attempts to use it with
// incorrect credentials, the Strike Protocol activates:
//
//   STRIKE ONE:  Operator goes dark. Reports attempt via dead-drop.
//                Adversary doesn't know they've been detected.
//   STRIKE TWO:  SCORCHED EARTH. Wipe all keys, poison all cached data,
//                corrupt alpha in memory with garbage. Self-destruct.
//                Adversary is left holding noise. Evidence hashed to
//                Ledger Lite before destruction. Law enforcement's job now.
//
// 100% legal. 100% ethical. We own it, we destroy it.
// Like a bank vault that incinerates contents on tamper.
// ════════════════════════════════════════════════════════════════════

/** Strike level — escalating defensive response */
export type StrikeLevel = "STRIKE_ONE" | "STRIKE_TWO";

/** What triggered the strike */
export type StrikeTrigger =
  | "HANDSHAKE_FAILED"           // Wrong operatorToken (Five-Pound Note mismatch)
  | "MUTUAL_VERIFY_FAILED"       // Wrong haloIdentityProof (forged dispatch credentials)
  | "CHALLENGE_RESPONSE_FAILED"  // Wrong counter-challenge response
  | "REPLAY_DETECTED"            // Token already used — clone attempt
  | "TOKEN_NOT_FOUND"            // No dispatch record — completely forged
  | "EXPIRED_CREDENTIAL";        // Expired token — stale captured credentials

/** Scorched earth action taken during Strike Two */
export type ScorchedEarthAction =
  | "KEYS_WIPED"                 // All cryptographic keys destroyed
  | "ALPHA_POISONED"             // Cached intel replaced with garbage data
  | "STATE_CORRUPTED"            // Operator state overwritten with noise
  | "ROUTES_DESTROYED"           // Endpoint routes/configs wiped
  | "EVIDENCE_PRESERVED"         // SHA-256 hash of final state → Ledger Lite
  | "SELF_DESTRUCTED";           // Operator terminated — empty shell remains

/** Individual strike record */
export interface StrikeRecord {
  id: string;
  operatorId: string;
  missionId: string;
  level: StrikeLevel;
  trigger: StrikeTrigger;
  /** Attempt details — forensic evidence for law enforcement */
  attempt: {
    /** What token/proof was presented (truncated for logging, not the full value) */
    presentedCredentialHash: string;
    /** Timestamp of the attempt */
    attemptedAt: string;
    /** Source IP if available */
    sourceIp?: string;
    /** Any operator class claimed */
    claimedClass?: string;
    /** Mission type claimed */
    claimedMissionType?: string;
  };
  /** Scorched earth actions taken (Strike Two only) */
  scorchedEarthActions?: ScorchedEarthAction[];
  /** SHA-256 evidence hash preserved to Ledger Lite before destruction */
  evidenceHash?: string;
  /** Was the adversary detection forwarded to GTC for Brighton analysis? */
  forwardedToGtc: boolean;
  /** Was evidence preserved to Ledger Lite? */
  forwardedToLedgerLite: boolean;
  timestamp: string;
}

/** Scorched earth event — full record of a Strike Two destruction */
export interface ScorchedEarthEvent {
  operatorId: string;
  missionId: string;
  strikeRecordId: string;
  /** All actions taken during scorched earth */
  actions: ScorchedEarthAction[];
  /** Data poisoned: how many bytes of garbage injected */
  poisonedBytes: number;
  /** Time from trigger to complete destruction */
  destructionMs: number;
  /** Evidence hash (SHA-256) — preserved before destruction */
  evidenceHash: string;
  /** What was preserved for law enforcement */
  evidencePackage: {
    attemptCount: number;
    triggerHistory: StrikeTrigger[];
    firstAttemptAt: string;
    finalAttemptAt: string;
    credentialHashes: string[];
    sourceIps: string[];
  };
  timestamp: string;
}
