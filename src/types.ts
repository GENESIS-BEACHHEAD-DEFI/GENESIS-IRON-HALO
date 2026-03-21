/**
 * GENESIS-IRON-HALO — Type Definitions
 *
 * Every returning operator is contaminated by default.
 * Iron Halo is the sandboxed decontamination chamber.
 *
 * Six operator classes — each with unique mission profiles,
 * extraction protocols, and lifecycle rules.
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
    debriefed?: string;
    sanitised?: string;
    extracted?: string;
    burned?: string;
    completed?: string;
  };
  /** Extracted intelligence (sanitised — safe for downstream) */
  extractedIntel?: SanitisedIntel;
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
