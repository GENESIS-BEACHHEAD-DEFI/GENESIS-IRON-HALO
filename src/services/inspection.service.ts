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
 *   6. CHAOS_REGIMENT RETURN — This class self-destructs. Return = impersonator. +80 score.
 *   7. UNAUTHORIZED SELF-RETURN — DEEP_COVER/PHANTOM_STACK without extractedByMothership. +60 score.
 *   8. PHANTOM_STACK AUTO-KRYPTONITE — Always KRYPTONITE contamination level.
 *   9. PATSY MARKER DETECTION — No PATSY ever comes home. If marker detected = ADVERSARY CLONED US.
 *      Triggers adversary pipeline mapping. We trace their process. They think they're winning.
 *  10. PATSY RETURN REJECTION — Like CHAOS, PATSYs never return. +90 score if class = PATSY.
 *
 * Verdict: CLEAN, SUSPICIOUS, CONTAMINATED, KRYPTONITE, or ADVERSARY_DETECTED
 *   CLEAN              → proceed to debrief
 *   SUSPICIOUS         → flag + proceed (extra scrutiny)
 *   CONTAMINATED       → IMMEDIATE BURN. No debrief. No intel extracted. Destroyed.
 *   KRYPTONITE         → PHANTOM_STACK: admit to KRYPTONITE quarantine → dynamic debrief → strict sanitise → burn
 *   ADVERSARY_DETECTED → PATSY marker found. Enemy cloned our operator. Map their pipeline. BURN the clone.
 */

import type { OperatorReturnReport, OperatorClass } from "../types";

export type InspectionVerdict = "CLEAN" | "SUSPICIOUS" | "CONTAMINATED" | "KRYPTONITE" | "ADVERSARY_DETECTED";

export interface InspectionResult {
  verdict: InspectionVerdict;
  score: number;           // 0-100 (0 = definitely clean, 100 = definitely contaminated)
  checks: InspectionCheck[];
  recommendation: string;
  /** Operator class detected from the report */
  operatorClass?: OperatorClass;
  /** PATSY marker detected — adversary cloned our operator */
  patsyMarkerDetected?: boolean;
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
  private totalKryptonite = 0;
  private totalAdversaryDetected = 0;
  /** Known PATSY markers issued by Mothership — only our stack knows these */
  private knownPatsyMarkers: Set<string> = new Set();

  /**
   * Register a PATSY marker. Called when Mothership deploys a PATSY.
   * Only our stack knows these markers — the adversary copies them blindly.
   */
  registerPatsyMarker(marker: string): void {
    this.knownPatsyMarkers.add(marker);
  }

  /**
   * Full AI inspection of a returning operator.
   * Run this BEFORE handshake verification — catch bad actors early.
   */
  inspect(report: OperatorReturnReport): InspectionResult {
    this.totalInspected++;
    const checks: InspectionCheck[] = [];
    let contaminationScore = 0;
    const operatorClass = report.operatorClass;
    let patsyMarkerDetected = false;

    // ══════════════════════════════════════════════════
    // CLASS-SPECIFIC CHECK: CHAOS_REGIMENT RETURN REJECTION
    // This class self-destructs. If it's "returning" — it's an impersonator.
    // ══════════════════════════════════════════════════
    if (operatorClass === "CHAOS_REGIMENT") {
      checks.push({
        name: "CHAOS_REGIMENT_RETURN",
        passed: false,
        severity: "CRITICAL",
        detail: "CHAOS_REGIMENT operators self-destruct. Return = impersonator or compromised. IMMEDIATE BURN.",
      });
      contaminationScore += 80;
    }

    // ══════════════════════════════════════════════════
    // CLASS-SPECIFIC CHECK: PATSY RETURN REJECTION
    // No PATSY ever comes home. Like CHAOS, it's designed to be taken.
    // If operatorClass = PATSY, it's either our PATSY somehow returning
    // (impossible — they don't know how) or enemy testing us. Either way: BURN.
    // ══════════════════════════════════════════════════
    if (operatorClass === "PATSY") {
      checks.push({
        name: "PATSY_RETURN",
        passed: false,
        severity: "CRITICAL",
        detail: "PATSY operators are designed to be captured. They never return. IMMEDIATE BURN.",
      });
      contaminationScore += 90;
    }

    // ══════════════════════════════════════════════════
    // PATSY MARKER DETECTION — ADVERSARY MAPPING TRIGGER
    // If an operator arrives carrying a known PATSY marker, the adversary
    // captured our PATSY, cloned it, and sent the clone to us.
    // They think they're winning. We now map their pipeline.
    // ══════════════════════════════════════════════════
    if (report.patsyMarker && this.knownPatsyMarkers.has(report.patsyMarker)) {
      patsyMarkerDetected = true;
      checks.push({
        name: "PATSY_MARKER_ADVERSARY_DETECTED",
        passed: false,
        severity: "CRITICAL",
        detail: `██ ADVERSARY DETECTED ██ Known PATSY marker found on returning operator. ` +
          `The enemy captured and cloned our PATSY. We are now mapping their pipeline. ` +
          `They think they are winning. Marker: ${report.patsyMarker.slice(0, 8)}...`,
      });
      // Don't add contamination score — we WANT to log this, not just burn
      // The verdict will be ADVERSARY_DETECTED which triggers special handling
      this.totalAdversaryDetected++;
      console.error(
        `[IRON-HALO] ██████████████████████████████████████████████████\n` +
        `[IRON-HALO] ██ ADVERSARY DETECTED — PATSY MARKER FOUND ██\n` +
        `[IRON-HALO] ██ Operator: ${report.operatorId}\n` +
        `[IRON-HALO] ██ Marker: ${report.patsyMarker.slice(0, 16)}...\n` +
        `[IRON-HALO] ██ The enemy cloned our PATSY. Mapping their pipeline.\n` +
        `[IRON-HALO] ██████████████████████████████████████████████████`,
      );
    }

    // ══════════════════════════════════════════════════
    // CLASS-SPECIFIC CHECK: UNAUTHORIZED SELF-RETURN
    // DEEP_COVER and PHANTOM_STACK must be extracted by Mothership.
    // Self-return without extractedByMothership = compromised.
    // ══════════════════════════════════════════════════
    if (
      (operatorClass === "DEEP_COVER" || operatorClass === "PHANTOM_STACK") &&
      !report.extractedByMothership
    ) {
      checks.push({
        name: "UNAUTHORIZED_SELF_RETURN",
        passed: false,
        severity: "CRITICAL",
        detail: `${operatorClass} returned without Mothership extraction. Possible compromise or impersonator.`,
      });
      contaminationScore += 60;
    }

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

    // ADVERSARY_DETECTED — PATSY marker found. Highest priority verdict.
    // We don't just burn — we log everything about this clone for adversary mapping.
    if (patsyMarkerDetected) {
      verdict = "ADVERSARY_DETECTED";
      recommendation = "ADVERSARY CLONE DETECTED. PATSY marker identified. Log all metadata for adversary pipeline mapping. BURN the clone.";
      // totalAdversaryDetected already incremented above
      console.error(
        `[IRON-HALO] INSPECTION: ADVERSARY_DETECTED operator=${report.operatorId} ` +
        `score=${contaminationScore}/100 — PATSY marker found. Enemy pipeline exposed.`,
      );
    } else
    // PHANTOM_STACK auto-KRYPTONITE — regardless of score, these get KRYPTONITE processing
    // (unless they're already CONTAMINATED from other checks)
    if (operatorClass === "PHANTOM_STACK" && contaminationScore < 50) {
      verdict = "KRYPTONITE";
      recommendation = "PHANTOM_STACK operator. KRYPTONITE debrief protocol: dynamic questioning, cross-validation, strict sanitise, UNVERIFIED tags. BURN after.";
      this.totalKryptonite++;
      console.log(
        `[IRON-HALO] INSPECTION: KRYPTONITE operator=${report.operatorId} ` +
        `score=${contaminationScore}/100 — PHANTOM_STACK auto-KRYPTONITE protocol`,
      );
    } else if (contaminationScore >= 50) {
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
      operatorClass,
      patsyMarkerDetected,
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
    totalKryptonite: number;
    totalAdversaryDetected: number;
    knownPatsyMarkers: number;
  } {
    return {
      totalInspected: this.totalInspected,
      totalClean: this.totalClean,
      totalSuspicious: this.totalSuspicious,
      totalContaminated: this.totalContaminated,
      totalKryptonite: this.totalKryptonite,
      totalAdversaryDetected: this.totalAdversaryDetected,
      knownPatsyMarkers: this.knownPatsyMarkers.size,
    };
  }
}
