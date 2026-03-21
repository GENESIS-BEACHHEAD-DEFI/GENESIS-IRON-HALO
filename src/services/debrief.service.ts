/**
 * GENESIS-IRON-HALO — Debrief Service
 *
 * "How would you have completed differently for X% improvement?"
 * "What did you observe outside mission parameters?"
 *
 * The interrogation room. Extracts every drop of intelligence from
 * the returning operator before it's burned. Academy-grade AI interrogation.
 *
 * Intel never dies. Operator is disposable. Knowledge is immortal.
 */

import { createHash, randomUUID } from "crypto";
import type { OperatorReturnReport, HaloRecord, SanitisedIntel } from "../types";

const GTC_URL = process.env.GTC_URL || "http://genesis-beachhead-gtc:8650";
const BRIGHTON_URL = process.env.BRIGHTON_URL || "";
const LEDGER_LITE_URL = process.env.LEDGER_LITE_URL || "http://genesis-ledger-lite:8500";

export class DebriefService {
  private totalDebriefed = 0;
  private totalIntelExtracted = 0;
  private totalBurned = 0;
  private totalProcessingMs = 0;

  /**
   * Full debrief pipeline: DEBRIEF → SANITISE → EXTRACT → BURN
   * Processes the operator through all stages sequentially.
   */
  async processOperator(
    record: HaloRecord,
    report: OperatorReturnReport,
  ): Promise<HaloRecord> {
    const startTime = Date.now();

    // ── Stage 1: DEBRIEF ──
    record.stage = "DEBRIEFING";
    record.timestamps.debriefed = new Date().toISOString();
    this.totalDebriefed++;

    console.log(
      `[IRON-HALO] DEBRIEF operator=${record.operatorId} mission=${record.missionId} ` +
      `status=${report.result.status} pnl=$${report.result.pnlUsd || 0}`,
    );

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

    // ── Stage 2: SANITISE ──
    record.stage = "SANITISING";
    record.timestamps.sanitised = new Date().toISOString();

    const intel = this.sanitise(report);
    record.extractedIntel = intel;

    console.log(
      `[IRON-HALO] SANITISED operator=${record.operatorId} — intel cleaned for downstream`,
    );

    // ── Stage 3: EXTRACT — Forward intel to Whiteboard/GTC/Brighton ──
    record.stage = "EXTRACTING";
    record.timestamps.extracted = new Date().toISOString();

    await this.forwardIntel(intel, record);
    this.totalIntelExtracted++;

    console.log(
      `[IRON-HALO] EXTRACTED operator=${record.operatorId} — intel forwarded to GTC + Brighton`,
    );

    // ── Stage 4: BURN ──
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
      `processed in ${record.processingMs}ms, operator BURNED`,
    );

    // Log financial events to Ledger Lite (if there was P&L)
    if (report.result.pnlUsd && report.result.pnlUsd !== 0) {
      this.postToLedgerLite("OPERATOR_MISSION_COMPLETE", {
        operatorId: record.operatorId,
        missionId: record.missionId,
        missionType: record.missionType,
        status: report.result.status,
        pnlUsd: report.result.pnlUsd,
        gasSpentUsd: report.result.gasSpentUsd || 0,
        flagged: record.flagged,
      });
    }

    return record;
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
   * Forward sanitised intel to downstream systems.
   * One-way POST only — Iron Halo never reads from core.
   */
  private async forwardIntel(intel: SanitisedIntel, record: HaloRecord): Promise<void> {
    const gtcPayload = {
      eventType: "OPERATOR_DEBRIEF",
      source: "genesis-iron-halo",
      eventId: record.id,
      payload: {
        missionId: intel.missionId,
        missionType: intel.missionType,
        operatorId: record.operatorId,
        swarmId: record.swarmId,
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
  }

  /**
   * BURN the operator.
   * In v1, this is a logical burn — log the burn event, mark as destroyed.
   * In future versions with real wallets, this will:
   *   - Sweep remaining balance to gas buffer
   *   - Destroy private keys
   *   - Blacklist wallet address (never reuse)
   */
  private burnOperator(record: HaloRecord, report: OperatorReturnReport): void {
    console.log(
      `[IRON-HALO] BURN operator=${record.operatorId} ` +
      `wallet=${report.operatorMeta.walletAddress ? report.operatorMeta.walletAddress.slice(0, 10) + "..." : "N/A"} ` +
      `chain=${report.operatorMeta.chain || "N/A"} — ` +
      `DESTROYED. Zero fingerprint. No reuse.`,
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
    avgProcessingMs: number;
  } {
    return {
      totalDebriefed: this.totalDebriefed,
      totalIntelExtracted: this.totalIntelExtracted,
      totalBurned: this.totalBurned,
      avgProcessingMs: this.totalDebriefed > 0
        ? Math.round(this.totalProcessingMs / this.totalDebriefed)
        : 0,
    };
  }
}
