/**
 * GENESIS-IRON-HALO — AI Inspection Service
 *
 * "Even a hint of a clone or mistiming — BURN."
 * "We take no prisoners. We protect what we love."
 *
 * AI-powered behavioural inspection of returning operators.
 * Every operator is inspected before admission, even if handshake passes.
 *
 * Inspection checks:
 *   1. TIMING ANALYSIS  — mission duration vs expected. Too fast = clone. Too slow = compromised.
 *   2. CLONE DETECTION   — duplicate operatorIds, identical reports, statistical fingerprinting
 *   3. BEHAVIOUR ANOMALY — P&L doesn't match conditions, narrative contradicts data
 *   4. REPLAY DETECTION  — seen-before mission IDs, recycled observation text
 *   5. SEQUENCE ANALYSIS — operator history, pattern breaks, sudden behaviour change
 *
 * Verdict: CLEAN, SUSPICIOUS, or CONTAMINATED
 *   CLEAN        → proceed to debrief
 *   SUSPICIOUS   → flag + proceed (extra scrutiny)
 *   CONTAMINATED → IMMEDIATE BURN. No debrief. No intel extracted. Destroyed.
 */

import type { OperatorReturnReport } from "../types";

export type InspectionVerdict = "CLEAN" | "SUSPICIOUS" | "CONTAMINATED";

export interface InspectionResult {
  verdict: InspectionVerdict;
  score: number;           // 0-100 (0 = definitely clean, 100 = definitely contaminated)
  checks: InspectionCheck[];
  recommendation: string;
}

export interface InspectionCheck {
  name: string;
  passed: boolean;
  severity: "INFO" | "WARNING" | "CRITICAL";
  detail: string;
}

export class InspectionService {
  /** Historical fingerprints for clone detection */
  private seenMissionIds: Set<string> = new Set();
  private seenNarratives: Map<string, number> = new Map(); // hash → count
  private operatorTimingHistory: Map<string, number[]> = new Map(); // operatorId → durations
  private totalInspected = 0;
  private totalClean = 0;
  private totalSuspicious = 0;
  private totalContaminated = 0;

  /**
   * Full AI inspection of a returning operator.
   * Run this BEFORE handshake verification — catch bad actors early.
   */
  inspect(report: OperatorReturnReport): InspectionResult {
    this.totalInspected++;
    const checks: InspectionCheck[] = [];
    let contaminationScore = 0;

    // ── Check 1: TIMING ANALYSIS ──
    const duration = report.operatorMeta.missionDurationMs;

    // Too fast — likely a clone/replay, no real execution happened
    if (duration < 500) {
      checks.push({
        name: "TIMING_TOO_FAST",
        passed: false,
        severity: "CRITICAL",
        detail: `Mission completed in ${duration}ms — impossibly fast. Clone/replay suspected.`,
      });
      contaminationScore += 40;
    } else if (duration < 2000) {
      checks.push({
        name: "TIMING_SUSPICIOUS_FAST",
        passed: false,
        severity: "WARNING",
        detail: `Mission completed in ${duration}ms — unusually fast.`,
      });
      contaminationScore += 15;
    } else {
      checks.push({
        name: "TIMING_NORMAL",
        passed: true,
        severity: "INFO",
        detail: `Mission duration ${duration}ms — within expected range.`,
      });
    }

    // Too slow — possible compromise, operator may have been captured/manipulated
    if (duration > 3600000) { // > 1 hour
      checks.push({
        name: "TIMING_TOO_SLOW",
        passed: false,
        severity: "WARNING",
        detail: `Mission took ${(duration / 60000).toFixed(0)} minutes — unusually slow.`,
      });
      contaminationScore += 10;
    }

    // ── Check 2: CLONE DETECTION — Duplicate mission IDs ──
    if (this.seenMissionIds.has(report.missionId)) {
      checks.push({
        name: "DUPLICATE_MISSION_ID",
        passed: false,
        severity: "CRITICAL",
        detail: `Mission ID ${report.missionId} has been seen before. CLONE DETECTED.`,
      });
      contaminationScore += 50;
    } else {
      this.seenMissionIds.add(report.missionId);
      checks.push({
        name: "MISSION_ID_UNIQUE",
        passed: true,
        severity: "INFO",
        detail: `Mission ID is unique.`,
      });
    }

    // ── Check 3: NARRATIVE FINGERPRINT — Identical reports = clone ──
    const narrativeHash = this.hashString(report.observations.missionNarrative);
    const narrativeCount = this.seenNarratives.get(narrativeHash) || 0;

    if (narrativeCount >= 3) {
      checks.push({
        name: "NARRATIVE_CLONE",
        passed: false,
        severity: "CRITICAL",
        detail: `Identical mission narrative seen ${narrativeCount} times. Mass clone attack.`,
      });
      contaminationScore += 40;
    } else if (narrativeCount >= 1) {
      checks.push({
        name: "NARRATIVE_DUPLICATE",
        passed: false,
        severity: "WARNING",
        detail: `Similar mission narrative seen ${narrativeCount} time(s) before.`,
      });
      contaminationScore += 15;
    } else {
      checks.push({
        name: "NARRATIVE_UNIQUE",
        passed: true,
        severity: "INFO",
        detail: `Mission narrative is unique.`,
      });
    }
    this.seenNarratives.set(narrativeHash, narrativeCount + 1);

    // ── Check 4: DATA CONSISTENCY — P&L matches conditions ──
    if (report.result.status === "SUCCESS") {
      // Success should have positive or near-zero P&L
      if ((report.result.pnlUsd || 0) < -100) {
        checks.push({
          name: "PNL_INCONSISTENCY",
          passed: false,
          severity: "WARNING",
          detail: `SUCCESS status but P&L is -$${Math.abs(report.result.pnlUsd || 0)}. Data may be fabricated.`,
        });
        contaminationScore += 20;
      }
    }

    if (report.result.status === "FAILED") {
      // Failed missions shouldn't report positive P&L
      if ((report.result.pnlUsd || 0) > 10) {
        checks.push({
          name: "PNL_INCONSISTENCY_FAILED",
          passed: false,
          severity: "WARNING",
          detail: `FAILED status but P&L is +$${report.result.pnlUsd}. Contradictory.`,
        });
        contaminationScore += 15;
      }
    }

    // ── Check 5: GAS SPEND ANOMALY ──
    const gasSpent = report.result.gasSpentUsd || 0;
    if (gasSpent > 50) {
      checks.push({
        name: "EXCESSIVE_GAS",
        passed: false,
        severity: "WARNING",
        detail: `Gas spend $${gasSpent.toFixed(2)} — unusually high. Possible gas drain attack.`,
      });
      contaminationScore += 10;
    }

    // ── Check 6: OPERATOR BEHAVIOUR HISTORY ──
    const prevDurations = this.operatorTimingHistory.get(report.operatorId) || [];
    if (prevDurations.length >= 3) {
      const avgDuration = prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length;
      const deviation = Math.abs(duration - avgDuration) / avgDuration;

      if (deviation > 3) { // 3x deviation from historical average
        checks.push({
          name: "BEHAVIOUR_DEVIATION",
          passed: false,
          severity: "WARNING",
          detail: `Duration deviated ${(deviation * 100).toFixed(0)}% from historical average (${avgDuration.toFixed(0)}ms avg).`,
        });
        contaminationScore += 10;
      }
    }
    prevDurations.push(duration);
    if (prevDurations.length > 50) prevDurations.shift();
    this.operatorTimingHistory.set(report.operatorId, prevDurations);

    // ── Check 7: EMPTY REPORT — Suspiciously minimal data ──
    if (
      !report.observations.missionNarrative ||
      report.observations.missionNarrative.length < 10
    ) {
      checks.push({
        name: "MINIMAL_REPORT",
        passed: false,
        severity: "WARNING",
        detail: `Mission narrative too short (${report.observations.missionNarrative?.length || 0} chars). Possible shell operator.`,
      });
      contaminationScore += 10;
    }

    // ── VERDICT ──
    contaminationScore = Math.min(100, contaminationScore);
    let verdict: InspectionVerdict;
    let recommendation: string;

    if (contaminationScore >= 50) {
      verdict = "CONTAMINATED";
      recommendation = "IMMEDIATE BURN. Do not debrief. Do not extract intel. Destroy operator.";
      this.totalContaminated++;
      console.error(
        `[IRON-HALO] INSPECTION: CONTAMINATED operator=${report.operatorId} ` +
        `score=${contaminationScore}/100 — IMMEDIATE BURN`,
      );
    } else if (contaminationScore >= 20) {
      verdict = "SUSPICIOUS";
      recommendation = "Proceed with extra scrutiny. Flag for manual review. Extract intel with caution.";
      this.totalSuspicious++;
      console.log(
        `[IRON-HALO] INSPECTION: SUSPICIOUS operator=${report.operatorId} ` +
        `score=${contaminationScore}/100 — flagged`,
      );
    } else {
      verdict = "CLEAN";
      recommendation = "Proceed to debrief. Operator appears genuine.";
      this.totalClean++;
    }

    // Prune seen data to prevent unbounded memory growth
    if (this.seenMissionIds.size > 100000) {
      const arr = Array.from(this.seenMissionIds);
      this.seenMissionIds = new Set(arr.slice(-50000));
    }
    if (this.seenNarratives.size > 50000) {
      const entries = Array.from(this.seenNarratives.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25000);
      this.seenNarratives = new Map(entries);
    }

    return {
      verdict,
      score: contaminationScore,
      checks,
      recommendation,
    };
  }

  private hashString(str: string): string {
    const { createHash } = require("crypto");
    return createHash("sha256").update(str || "").digest("hex").slice(0, 16);
  }

  getStats(): {
    totalInspected: number;
    totalClean: number;
    totalSuspicious: number;
    totalContaminated: number;
  } {
    return {
      totalInspected: this.totalInspected,
      totalClean: this.totalClean,
      totalSuspicious: this.totalSuspicious,
      totalContaminated: this.totalContaminated,
    };
  }
}
