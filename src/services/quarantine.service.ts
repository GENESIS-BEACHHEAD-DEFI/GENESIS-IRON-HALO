/**
 * GENESIS-IRON-HALO — Quarantine Service
 *
 * First stage of decontamination. Every returning operator enters quarantine.
 * No operator touches core systems until fully processed.
 *
 * Quarantine validates the return report, flags suspicious operators,
 * and queues for debriefing.
 *
 * Operator class tracking:
 *   - Records operatorClass and contaminationLevel on admission
 *   - KRYPTONITE operators get PRIORITY processing (they've been dark longest,
 *     intel decays fastest, but also highest risk of compromise)
 */

import { randomUUID } from "crypto";
import type { OperatorReturnReport, HaloRecord, OperatorClass, ContaminationLevel } from "../types";

/** Maximum time an operator can sit in quarantine before auto-flag (1 hour) */
const QUARANTINE_TIMEOUT_MS = parseInt(process.env.QUARANTINE_TIMEOUT_MS || "3600000", 10);

export class QuarantineService {
  private quarantineQueue: Map<string, HaloRecord> = new Map();
  private flaggedCount = 0;

  /**
   * Admit an operator into quarantine.
   * Returns the HaloRecord ID for tracking through the pipeline.
   */
  admit(
    report: OperatorReturnReport,
    contaminationLevel?: ContaminationLevel,
  ): HaloRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    const record: HaloRecord = {
      id,
      operatorId: report.operatorId,
      missionId: report.missionId,
      missionType: report.missionType,
      swarmId: report.swarmId,
      operatorClass: report.operatorClass,
      contaminationLevel: contaminationLevel || "STANDARD",
      extractedByMothership: report.extractedByMothership,
      stage: "QUARANTINE",
      timestamps: {
        quarantined: now,
      },
      flagged: false,
    };

    // ── Suspicious operator detection ──
    // Flag operators that show signs of compromise or anomalous behaviour

    // 1. Mission duration outlier — too fast or too slow
    if (report.operatorMeta.missionDurationMs < 100) {
      record.flagged = true;
      record.flagReason = `Suspiciously fast mission: ${report.operatorMeta.missionDurationMs}ms`;
    }

    // 2. Negative P&L beyond threshold on a SUCCESS — data inconsistency
    if (report.result.status === "SUCCESS" && (report.result.pnlUsd || 0) < -50) {
      record.flagged = true;
      record.flagReason = `SUCCESS with heavy loss: $${report.result.pnlUsd}`;
    }

    // 3. Unknown tokens acquired — potential dust attack / honeypot
    if (report.result.tokensAcquired) {
      const knownStables = new Set(["USDT", "USDC", "BUSD", "DAI", "USD"]);
      const unknownTokens = Object.keys(report.result.tokensAcquired)
        .filter(t => !knownStables.has(t));
      if (unknownTokens.length > 5) {
        record.flagged = true;
        record.flagReason = `Acquired ${unknownTokens.length} unknown tokens — potential contamination`;
      }
    }

    // 4. Too many anomalies reported
    if (report.observations.anomalies && report.observations.anomalies.length > 10) {
      record.flagged = true;
      record.flagReason = `Excessive anomalies: ${report.observations.anomalies.length}`;
    }

    if (record.flagged) {
      this.flaggedCount++;
      console.log(`[IRON-HALO] FLAGGED operator=${report.operatorId} reason="${record.flagReason}"`);
    }

    this.quarantineQueue.set(id, record);

    console.log(
      `[IRON-HALO] QUARANTINE operator=${report.operatorId} mission=${report.missionId} ` +
      `type=${report.missionType} class=${record.operatorClass || "LEGACY"} ` +
      `contamination=${record.contaminationLevel} flagged=${record.flagged}`,
    );

    return record;
  }

  /**
   * Get next operator ready for debriefing.
   *
   * Priority order:
   *   1. KRYPTONITE operators (priority — intel decays fastest, highest risk)
   *   2. Non-flagged STANDARD operators (likely clean)
   *   3. Flagged STANDARD operators
   */
  getNextForDebrief(): HaloRecord | null {
    // Priority 1: KRYPTONITE operators — process first
    for (const [, record] of this.quarantineQueue) {
      if (record.stage === "QUARANTINE" && record.contaminationLevel === "KRYPTONITE") {
        return record;
      }
    }

    // Priority 2: Non-flagged standard operators — they're likely clean
    for (const [, record] of this.quarantineQueue) {
      if (record.stage === "QUARANTINE" && !record.flagged && record.contaminationLevel !== "KRYPTONITE") {
        return record;
      }
    }

    // Priority 3: Flagged standard operators
    for (const [, record] of this.quarantineQueue) {
      if (record.stage === "QUARANTINE" && record.flagged) {
        return record;
      }
    }

    return null;
  }

  /**
   * Advance a record to the next stage.
   */
  advance(id: string, record: HaloRecord): void {
    this.quarantineQueue.set(id, record);
  }

  /**
   * Remove a fully processed record.
   */
  release(id: string): void {
    this.quarantineQueue.delete(id);
  }

  /**
   * Get a record by ID.
   */
  get(id: string): HaloRecord | undefined {
    return this.quarantineQueue.get(id);
  }

  /**
   * Get all records in quarantine.
   */
  getAll(): HaloRecord[] {
    return Array.from(this.quarantineQueue.values());
  }

  /**
   * Get all KRYPTONITE records currently in quarantine.
   */
  getKryptoniteRecords(): HaloRecord[] {
    return Array.from(this.quarantineQueue.values())
      .filter(r => r.contaminationLevel === "KRYPTONITE");
  }

  getQueueSize(): number {
    return this.quarantineQueue.size;
  }

  getFlaggedCount(): number {
    return this.flaggedCount;
  }

  getQuarantineCount(): number {
    let count = 0;
    for (const record of this.quarantineQueue.values()) {
      if (record.stage === "QUARANTINE") count++;
    }
    return count;
  }
}
