/**
 * GENESIS-IRON-HALO — Debrief Service
 *
 * "How would you have completed differently for X% improvement?"
 * "What did you observe outside mission parameters?"
 *
 * The interrogation room. Extracts every drop of intelligence from
 * the returning operator before it's burned. Academy-grade AI interrogation.
 *
 * Two debrief protocols:
 *   STANDARD:   Standard debrief → sanitise → extract → BURN
 *   KRYPTONITE: Dynamic questioning → cross-validation tagging →
 *               strict sanitise (UNVERIFIED) → extract → BURN
 *
 * KRYPTONITE protocol for PHANTOM_STACK operators:
 *   - These operators have been dark for months. Sleeper cells.
 *   - Intel is the most valuable (deep cover, long observation)
 *   - But also highest risk of compromise or manipulation
 *   - ALL intel marked UNVERIFIED until cross-validated by Brighton/ARIS
 *   - Dynamic questioning: challenge inconsistencies, probe for planted data
 *
 * Intel never dies. Operator is disposable. Knowledge is immortal.
 *
 * GOLDEN RULE (LAW): processOperator() ALWAYS ends with burnOperator().
 * No code path bypasses it. No exceptions.
 */

import { createHash, randomUUID } from "crypto";
import type { OperatorReturnReport, HaloRecord, SanitisedIntel } from "../types";

const GTC_URL = process.env.GTC_URL || "http://genesis-beachhead-gtc:8650";
const BRIGHTON_URL = process.env.BRIGHTON_URL || "";
const WHITEBOARD_URL = process.env.WHITEBOARD_URL || "";
const LEDGER_LITE_URL = process.env.LEDGER_LITE_URL || "http://genesis-ledger-lite:8500";
const KRYPTONITE_DEBRIEF_ENABLED = process.env.KRYPTONITE_DEBRIEF_ENABLED === "true";

export class DebriefService {
  private totalDebriefed = 0;
  private totalIntelExtracted = 0;
  private totalBurned = 0;
  private totalProcessingMs = 0;
  private totalKryptoniteDebriefed = 0;

  /**
   * Full debrief pipeline: DEBRIEF → SANITISE → EXTRACT → BURN
   * Routes to KRYPTONITE protocol for PHANTOM_STACK operators.
   *
   * v1.2: Accepts optional AdvisoryVerdict from Blackboard Architecture.
   * Advisory verdict influences flagging and GTC logging.
   *
   * GOLDEN RULE: This method ALWAYS ends with burnOperator(). No exceptions.
   */
  async processOperator(
    record: HaloRecord,
    report: OperatorReturnReport,
    advisoryVerdict?: import("../types").AdvisoryVerdict,
  ): Promise<HaloRecord> {
    const startTime = Date.now();

    // Route to KRYPTONITE protocol if applicable
    const isKryptonite = record.contaminationLevel === "KRYPTONITE" && KRYPTONITE_DEBRIEF_ENABLED;

    // ── Stage 1: DEBRIEF ──
    record.stage = "DEBRIEFING";
    record.timestamps.debriefed = new Date().toISOString();
    this.totalDebriefed++;

    if (isKryptonite) {
      this.totalKryptoniteDebriefed++;
      console.log(
        `[IRON-HALO] ██ KRYPTONITE DEBRIEF ██ operator=${record.operatorId} mission=${record.missionId} ` +
        `class=PHANTOM_STACK — Dynamic questioning protocol active`,
      );
      this.kryptoniteDebrief(record, report);
    } else {
      console.log(
        `[IRON-HALO] DEBRIEF operator=${record.operatorId} mission=${record.missionId} ` +
        `status=${report.result.status} pnl=$${report.result.pnlUsd || 0}`,
      );
    }

    // Log observations
    if (report.observations.outsideParams && report.observations.outsideParams.length > 0) {
      console.log(
        `[IRON-HALO] OUTSIDE_PARAMS operator=${record.operatorId}: ` +
        report.observations.outsideParams.join(" | "),
      );
    }

    if (report.observations.anomalies && report.observations.anomalies.length > 0) {
      console.log(
        `[IRON-HALO] ANOMALIES operator=${record.operatorId}: ` +
        report.observations.anomalies.join(" | "),
      );
    }

    if (report.selfAssessment?.improvementSuggestion) {
      console.log(
        `[IRON-HALO] SELF_ASSESSMENT operator=${record.operatorId}: ` +
        `"${report.selfAssessment.improvementSuggestion}" ` +
        `(est. ${report.selfAssessment.estimatedImprovementPercent || 0}% improvement)`,
      );
    }

    // ── v1.2: Advisory verdict influence ──
    if (advisoryVerdict) {
      if (advisoryVerdict.action === "HOLD_MANUAL_REVIEW") {
        record.flagged = true;
        record.flagReason = (record.flagReason ? record.flagReason + " | " : "") +
          `ADVISORY_HOLD: ${advisoryVerdict.reasoning}`;
        console.log(
          `[IRON-HALO] ADVISORY_FLAG operator=${record.operatorId} — ` +
          `Blackboard recommends HOLD_MANUAL_REVIEW`,
        );
      }
      if (advisoryVerdict.action === "QUARANTINE_DARPA") {
        record.flagged = true;
        record.flagReason = (record.flagReason ? record.flagReason + " | " : "") +
          `ADVISORY_DARPA_ESCALATION: ${advisoryVerdict.reasoning}`;
        console.log(
          `[IRON-HALO] ██ ADVISORY_DARPA_ESCALATION ██ operator=${record.operatorId} — ` +
          `Both analysts SUSPICIOUS. Flagged to DARPA.`,
        );
      }
    }

    // ── Stage 2: SANITISE ──
    record.stage = "SANITISING";
    record.timestamps.sanitised = new Date().toISOString();

    const intel = isKryptonite
      ? this.kryptoniteSanitise(report, record)
      : this.sanitise(report);
    record.extractedIntel = intel;

    console.log(
      `[IRON-HALO] SANITISED operator=${record.operatorId} — intel cleaned for downstream` +
      (isKryptonite ? " (KRYPTONITE: all intel marked UNVERIFIED)" : ""),
    );

    // ── Stage 3: EXTRACT — Forward intel to Whiteboard/GTC/Brighton ──
    record.stage = "EXTRACTING";
    record.timestamps.extracted = new Date().toISOString();

    // Evidence chain: hash before burn (Nemo-X legal protection)
    const evidenceHash = this.hashDebriefRecord(record);
    this.forwardEvidenceHash(record.id, evidenceHash, intel.missionType);
    console.log(
      `[IRON_HALO] EVIDENCE_CHAIN hash=${evidenceHash.slice(0, 16)}... ` +
      `record=${record.id.slice(0, 8)}... — immutable proof on Ledger Lite`,
    );

    await this.forwardIntel(intel, record);
    this.totalIntelExtracted++;

    console.log(
      `[IRON-HALO] EXTRACTED operator=${record.operatorId} — intel forwarded to GTC + Brighton`,
    );

    // ── Stage 4: BURN — GOLDEN RULE: NO CODE PATH BYPASSES THIS ──
    record.stage = "BURNING";
    record.timestamps.burned = new Date().toISOString();

    this.burnOperator(record, report);
    this.totalBurned++;

    // ── Complete ──
    record.stage = "COMPLETE";
    record.timestamps.completed = new Date().toISOString();
    record.processingMs = Date.now() - startTime;
    this.totalProcessingMs += record.processingMs;

    console.log(
      `[IRON-HALO] COMPLETE operator=${record.operatorId} — ` +
      `processed in ${record.processingMs}ms, operator BURNED` +
      (isKryptonite ? " (KRYPTONITE protocol)" : ""),
    );

    // Log financial events to Ledger Lite (if there was P&L)
    if (report.result.pnlUsd && report.result.pnlUsd !== 0) {
      this.postToLedgerLite("OPERATOR_MISSION_COMPLETE", {
        operatorId: record.operatorId,
        missionId: record.missionId,
        missionType: record.missionType,
        operatorClass: record.operatorClass || "LEGACY",
        contaminationLevel: record.contaminationLevel || "STANDARD",
        status: report.result.status,
        pnlUsd: report.result.pnlUsd,
        gasSpentUsd: report.result.gasSpentUsd || 0,
        flagged: record.flagged,
      });
    }

    return record;
  }

  /**
   * KRYPTONITE Debrief — Dynamic questioning protocol for PHANTOM_STACK operators.
   *
   * These operators have been embedded for months as sleeper cells.
   * Intel is extremely valuable but highest risk of planted/manipulated data.
   *
   * Dynamic questioning:
   *   - Challenge narrative consistency across observations
   *   - Probe for time gaps or unexplained periods
   *   - Cross-reference P&L with reported conditions
   *   - Tag all intel with cross-validation markers for Brighton/ARIS
   */
  private kryptoniteDebrief(record: HaloRecord, report: OperatorReturnReport): void {
    const challenges: string[] = [];

    // Challenge 1: Time gap analysis — long-term deployment should have proportional observations
    const deployedMs = report.operatorMeta.missionDurationMs;
    const observationCount = (report.observations.outsideParams?.length || 0) +
      (report.observations.anomalies?.length || 0);
    const hoursDeployed = deployedMs / 3600000;

    if (hoursDeployed > 24 && observationCount < 3) {
      challenges.push(
        `TIME_GAP: Deployed ${hoursDeployed.toFixed(1)}h but only ${observationCount} observations. ` +
        `Where was the operator? What happened during unaccounted periods?`,
      );
    }

    // Challenge 2: Narrative consistency — check for contradictions
    const narrative = report.observations.missionNarrative;
    const conditions = report.observations.conditions;

    if (conditions?.mempoolCongestion === "HIGH" && (report.result.gasSpentUsd || 0) < 1) {
      challenges.push(
        `CONSISTENCY: Reports HIGH mempool congestion but gas spend is only $${report.result.gasSpentUsd || 0}. ` +
        `High congestion should mean high gas. Possible fabrication.`,
      );
    }

    // Challenge 3: Success without evidence
    if (report.result.status === "SUCCESS" && (!narrative || narrative.length < 50)) {
      challenges.push(
        `EVIDENCE: Claims SUCCESS but narrative is minimal (${narrative?.length || 0} chars). ` +
        `Long-term operators should have detailed intelligence.`,
      );
    }

    // Challenge 4: Competitor intel validation marker
    if (conditions?.competitorActivity) {
      challenges.push(
        `COMPETITOR_INTEL: Reports competitor activity "${conditions.competitorActivity}". ` +
        `REQUIRES CROSS-VALIDATION via Brighton pattern matching. May be planted intelligence.`,
      );
    }

    if (challenges.length > 0) {
      console.log(
        `[IRON-HALO] KRYPTONITE_CHALLENGES operator=${record.operatorId}: ` +
        challenges.join(" || "),
      );
    }

    console.log(
      `[IRON-HALO] KRYPTONITE_DEBRIEF_COMPLETE operator=${record.operatorId} ` +
      `challenges=${challenges.length} — All intel tagged UNVERIFIED`,
    );
  }

  /**
   * KRYPTONITE Sanitise — Stricter sanitisation for PHANTOM_STACK operators.
   *
   * All intel marked UNVERIFIED until cross-validated by Brighton/ARIS.
   * Cross-validation tags added for downstream correlation.
   */
  private kryptoniteSanitise(report: OperatorReturnReport, record: HaloRecord): SanitisedIntel {
    const base = this.sanitise(report);

    // Mark ALL intel as UNVERIFIED — Brighton/ARIS must cross-validate
    base.unverified = true;

    // Add cross-validation tags for downstream correlation
    base.crossValidationTags = [
      `KRYPTONITE:${record.operatorId}`,
      `PHANTOM_STACK:${record.missionId}`,
      `DURATION_HOURS:${(report.operatorMeta.missionDurationMs / 3600000).toFixed(1)}`,
    ];

    if (report.observations.conditions?.competitorActivity) {
      base.crossValidationTags.push(`COMPETITOR_INTEL:REQUIRES_VALIDATION`);
    }

    if (report.operatorMeta.chain) {
      base.crossValidationTags.push(`CHAIN:${report.operatorMeta.chain}`);
    }

    console.log(
      `[IRON-HALO] KRYPTONITE_SANITISE operator=${record.operatorId} — ` +
      `all intel UNVERIFIED, ${base.crossValidationTags.length} cross-validation tags`,
    );

    return base;
  }

  /**
   * Sanitise operator report — strip sensitive data, keep actionable intel.
   * No raw wallet addresses, no API keys, no RPC endpoints in output.
   */
  private sanitise(report: OperatorReturnReport): SanitisedIntel {
    return {
      missionId: report.missionId,
      missionType: report.missionType,
      result: {
        status: report.result.status,
        pnlUsd: report.result.pnlUsd,
        gasSpentUsd: report.result.gasSpentUsd,
      },
      observations: {
        narrative: report.observations.missionNarrative,
        outsideParams: report.observations.outsideParams || [],
        conditions: report.observations.conditions || {},
        anomalies: report.observations.anomalies || [],
      },
      selfAssessment: report.selfAssessment ? {
        suggestion: report.selfAssessment.improvementSuggestion,
        estimatedImprovement: report.selfAssessment.estimatedImprovementPercent,
        alternativeApproach: report.selfAssessment.alternativeApproach,
      } : undefined,
      metrics: {
        missionDurationMs: report.operatorMeta.missionDurationMs,
        chain: report.operatorMeta.chain,
        // Only exchange NAMES — not endpoints
        exchangesUsed: report.operatorMeta.exchangesUsed || [],
        exchangeLatencyMs: report.observations.conditions?.exchangeLatencyMs,
        slippageObserved: report.observations.conditions?.slippageObserved,
      },
    };
  }

  /**
   * Hash a debrief record deterministically for evidence chain.
   * Canonical JSON (sorted keys) ensures identical hash regardless of insertion order.
   */
  private hashDebriefRecord(record: any): string {
    const canonical = JSON.stringify(record, Object.keys(record).sort());
    return createHash("sha256").update(canonical).digest("hex");
  }

  /**
   * Forward evidence hash to Ledger Lite — immutable proof the record existed
   * BEFORE the operator is burned. Nemo-X legal protection.
   */
  private forwardEvidenceHash(recordId: string, hash: string, missionType: string): void {
    if (!LEDGER_LITE_URL) return;

    fetch(`${LEDGER_LITE_URL}/payload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rail: "INTELLIGENCE",
        type: "DEBRIEF_HASH",
        recordId,
        hash,
        missionType,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      // Ledger Lite may be unreachable — log but don't block
    });
  }

  /**
   * Forward sanitised intel to downstream systems.
   * One-way POST only — Iron Halo never reads from core.
   */
  private async forwardIntel(intel: SanitisedIntel, record: HaloRecord): Promise<void> {
    const gtcPayload = {
      eventType: record.contaminationLevel === "KRYPTONITE"
        ? "OPERATOR_KRYPTONITE_DEBRIEF"
        : "OPERATOR_DEBRIEF",
      source: "genesis-iron-halo",
      eventId: record.id,
      payload: {
        missionId: intel.missionId,
        missionType: intel.missionType,
        operatorId: record.operatorId,
        swarmId: record.swarmId,
        operatorClass: record.operatorClass || "LEGACY",
        contaminationLevel: record.contaminationLevel || "STANDARD",
        status: intel.result.status,
        pnlUsd: intel.result.pnlUsd,
        gasSpentUsd: intel.result.gasSpentUsd,
        missionDurationMs: intel.metrics.missionDurationMs,
        chain: intel.metrics.chain,
        exchangesUsed: intel.metrics.exchangesUsed,
        exchangeLatencyMs: intel.metrics.exchangeLatencyMs,
        slippageObserved: intel.metrics.slippageObserved,
        outsideParams: intel.observations.outsideParams,
        anomalies: intel.observations.anomalies,
        selfAssessment: intel.selfAssessment,
        flagged: record.flagged,
        flagReason: record.flagReason,
        unverified: intel.unverified || false,
        crossValidationTags: intel.crossValidationTags || [],
        // v1.2: Advisory verdict from Blackboard Architecture — full picture
        advisoryAction: record.advisoryVerdict?.action || null,
        advisoryReasoning: record.advisoryVerdict?.reasoning || null,
        advisoryCircuitBreakerTripped: record.advisoryVerdict?.circuitBreakerTripped || false,
        advisoryInternalOnly: record.advisoryVerdict?.internalRulesOnly || false,
      },
      timestamp: new Date().toISOString(),
    };

    // Forward to GTC (training corpus)
    fetch(`${GTC_URL}/telemetry/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gtcPayload),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      // GTC may be unreachable — never block Iron Halo pipeline
    });

    // Forward to Brighton (pattern detection)
    if (BRIGHTON_URL) {
      fetch(`${BRIGHTON_URL}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gtcPayload),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }

    // Forward to Whiteboard (institutional intelligence)
    if (WHITEBOARD_URL) {
      const whiteboardPayload = {
        category: record.flagged ? "WARNING" : "LESSON",
        source: "IRON_HALO",
        intelligence: `${intel.missionType} mission ${intel.result.status}: ` +
          `pnl=$${intel.result.pnlUsd || 0} chain=${intel.metrics.chain || "unknown"} ` +
          `exchanges=${intel.metrics.exchangesUsed.join(",")} ` +
          `latency=${intel.metrics.exchangeLatencyMs || 0}ms` +
          (intel.observations.anomalies.length > 0 ? ` anomalies=${intel.observations.anomalies.join(";")}` : "") +
          (intel.selfAssessment?.suggestion ? ` self-assessment="${intel.selfAssessment.suggestion}"` : ""),
        affectedRails: ["ALL"] as string[],
        affectedClasses: [] as string[],
        evidence: [record.id],
        tags: [
          intel.missionType,
          intel.result.status,
          ...(intel.metrics.chain ? [intel.metrics.chain] : []),
          ...(record.operatorClass ? [record.operatorClass] : []),
        ],
      };

      fetch(`${WHITEBOARD_URL}/intel/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(whiteboardPayload),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  }

  /**
   * BURN the operator.
   *
   * GOLDEN RULE (LAW): ALL operators burned after mission.
   * No mission 2. No exceptions. Our core is worth more than any operator.
   *
   * In v1, this is a logical burn — log the burn event, mark as destroyed.
   * In future versions with real wallets, this will:
   *   - Sweep remaining balance to gas buffer
   *   - Destroy private keys
   *   - Blacklist wallet address (never reuse)
   */
  private burnOperator(record: HaloRecord, report: OperatorReturnReport): void {
    console.log(
      `[IRON-HALO] BURN operator=${record.operatorId} ` +
      `class=${record.operatorClass || "LEGACY"} ` +
      `wallet=${report.operatorMeta.walletAddress ? report.operatorMeta.walletAddress.slice(0, 10) + "..." : "N/A"} ` +
      `chain=${report.operatorMeta.chain || "N/A"} — ` +
      `DESTROYED. Zero fingerprint. No reuse. No mission 2.`,
    );
  }

  /**
   * Post financial event to Ledger Lite.
   */
  private postToLedgerLite(eventType: string, data: Record<string, unknown>): void {
    const payload = {
      id: randomUUID(),
      rail: "BEACHHEAD" as const,
      eventType,
      source: "genesis-iron-halo",
      timestamp: new Date().toISOString(),
      data,
    };

    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

    fetch(`${LEDGER_LITE_URL}/payload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, payloadHash }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }

  getStats(): {
    totalDebriefed: number;
    totalIntelExtracted: number;
    totalBurned: number;
    totalKryptoniteDebriefed: number;
    avgProcessingMs: number;
  } {
    return {
      totalDebriefed: this.totalDebriefed,
      totalIntelExtracted: this.totalIntelExtracted,
      totalBurned: this.totalBurned,
      totalKryptoniteDebriefed: this.totalKryptoniteDebriefed,
      avgProcessingMs: this.totalDebriefed > 0
        ? Math.round(this.totalProcessingMs / this.totalDebriefed)
        : 0,
    };
  }
}
