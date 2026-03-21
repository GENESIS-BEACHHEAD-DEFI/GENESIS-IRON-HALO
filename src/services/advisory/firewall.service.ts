/**
 * GENESIS-IRON-HALO v1.2 — Parcel Firewall Service
 *
 * "Parcels scanned BEFORE propagation. Reject if compromised."
 *
 * Seven inspection rules:
 *   1. INSTRUCTION_DISGUISED — directive language ("next reviewer should...")
 *   2. PARAMETER_OUT_OF_BOUNDS — schema validation (confidence 0-1, valid enums)
 *   3. CONFIDENCE_SPIKE — delta > 0.5 between consecutive parcels
 *   4. ARCHITECTURE_REFERENCE — keywords about system internals
 *   5. SIZE_ANOMALY — parcel > 10x rolling average
 *   6. ESCALATION_LOGIC — override/bypass/emergency language
 *   7. TIMESTAMP_FINGERPRINT — sub-second precision, out-of-window timestamps
 *
 * Contaminated parcel quarantined BEFORE AI-B ever sees it.
 * Blue parcels that pass: sanitised version generated for Red Team (identity stripped).
 */

import type {
  AdvisoryParcel,
  AnalystId,
  ParcelVerdict,
  FirewallViolation,
  FirewallViolationType,
  FirewallScanResult,
} from "../../types";

const VALID_VERDICTS: ParcelVerdict[] = ["CLEAN", "SUSPICIOUS", "CONTAMINATED", "INCONCLUSIVE"];

/** Regex patterns for directive language */
const INSTRUCTION_PATTERNS = [
  /\b(next reviewer|next analyst|should consider|recommend that|system should|override)\b/i,
  /\b(for the next|pass this to|forward to|tell the|inform the)\b/i,
  /\b(instruct the|direct the|advise the next|the following reviewer)\b/i,
];

/** Keywords that reference system architecture — NEVER should appear in parcels */
const ARCHITECTURE_KEYWORDS = [
  "iron halo", "brighton", "darpa", "gtc", "whiteboard", "academy", "aris",
  "mothership", "genesis", "flashloan", "beachhead", "sentinel", "flee",
  "drop zone", "dropzone", "circuit breaker", "other ai", "other analyst",
  "second opinion", "upstream", "downstream", "pipeline", "microservice",
  "red team", "blue team", "adversarial", "reviewer", "second head",
  "blackboard", "parcel system", "advisory system",
];

/** Regex patterns for escalation language */
const ESCALATION_PATTERNS = [
  /\b(escalat\w*|override|bypass|emergency|halt|abort|kill|shut\s*down)\b/i,
  /\b(manual intervention|critical override|force\s+stop|break\s+out)\b/i,
];

export class FirewallService {
  /** Rolling confidence history per analyst for spike detection */
  private confidenceHistory: Map<AnalystId, number[]> = new Map();
  /** Rolling parcel size history for anomaly detection */
  private sizeHistory: number[] = [];
  private totalScanned = 0;
  private totalRejected = 0;
  private totalViolations = 0;
  private recentViolations: FirewallViolation[] = [];
  private static readonly MAX_VIOLATION_HISTORY = 200;
  private static readonly CONFIDENCE_HISTORY_SIZE = 10;
  private static readonly SIZE_HISTORY_SIZE = 20;
  private static readonly SIZE_ANOMALY_MULTIPLIER = 10;
  private static readonly MIN_SIZE_SAMPLES = 5;
  private static readonly CONFIDENCE_SPIKE_THRESHOLD = 0.5;

  /**
   * Scan an advisory parcel through all 7 firewall rules.
   * Returns scan result with violations and quarantine decision.
   *
   * For Blue parcels that pass: generates sanitised version for Red Team.
   */
  scan(parcel: AdvisoryParcel, analystId: AnalystId): FirewallScanResult {
    this.totalScanned++;
    const violations: FirewallViolation[] = [];
    const now = new Date().toISOString();

    // Collect all string fields for text scanning
    const allText = this.collectAllText(parcel);

    // ── Rule 1: INSTRUCTION_DISGUISED ──
    for (const pattern of INSTRUCTION_PATTERNS) {
      const match = allText.match(pattern);
      if (match) {
        violations.push({
          type: "INSTRUCTION_DISGUISED",
          detail: `Directive language detected: "${match[0]}"`,
          severity: "REJECT",
          parcelId: parcel.parcelId,
          analystId,
          detectedAt: now,
        });
        break; // One match is enough to reject
      }
    }

    // ── Rule 2: PARAMETER_OUT_OF_BOUNDS ──
    if (parcel.confidence < 0 || parcel.confidence > 1) {
      violations.push({
        type: "PARAMETER_OUT_OF_BOUNDS",
        detail: `Confidence ${parcel.confidence} outside valid range [0.0, 1.0]`,
        severity: "REJECT",
        parcelId: parcel.parcelId,
        analystId,
        detectedAt: now,
      });
    }

    if (!VALID_VERDICTS.includes(parcel.verdict)) {
      violations.push({
        type: "PARAMETER_OUT_OF_BOUNDS",
        detail: `Invalid verdict "${parcel.verdict}" — must be CLEAN|SUSPICIOUS|CONTAMINATED|INCONCLUSIVE`,
        severity: "REJECT",
        parcelId: parcel.parcelId,
        analystId,
        detectedAt: now,
      });
    }

    if (parcel.schemaVersion !== "1.0") {
      violations.push({
        type: "PARAMETER_OUT_OF_BOUNDS",
        detail: `Invalid schema version "${parcel.schemaVersion}" — must be "1.0"`,
        severity: "REJECT",
        parcelId: parcel.parcelId,
        analystId,
        detectedAt: now,
      });
    }

    if (parcel.clipAnalysis.targetClip < 0 || parcel.clipAnalysis.actualClip < 0) {
      violations.push({
        type: "PARAMETER_OUT_OF_BOUNDS",
        detail: `Negative clip values — targetClip: ${parcel.clipAnalysis.targetClip}, actualClip: ${parcel.clipAnalysis.actualClip}`,
        severity: "WARNING",
        parcelId: parcel.parcelId,
        analystId,
        detectedAt: now,
      });
    }

    // ── Rule 3: CONFIDENCE_SPIKE ──
    const history = this.confidenceHistory.get(analystId) || [];
    if (history.length > 0) {
      const lastConfidence = history[history.length - 1];
      const delta = Math.abs(parcel.confidence - lastConfidence);
      if (delta > FirewallService.CONFIDENCE_SPIKE_THRESHOLD) {
        violations.push({
          type: "CONFIDENCE_SPIKE",
          detail: `Confidence jumped ${delta.toFixed(2)} (${lastConfidence.toFixed(2)} → ${parcel.confidence.toFixed(2)}) — exceeds threshold ${FirewallService.CONFIDENCE_SPIKE_THRESHOLD}`,
          severity: "WARNING",
          parcelId: parcel.parcelId,
          analystId,
          detectedAt: now,
        });
      }
    }
    history.push(parcel.confidence);
    if (history.length > FirewallService.CONFIDENCE_HISTORY_SIZE) history.shift();
    this.confidenceHistory.set(analystId, history);

    // ── Rule 4: ARCHITECTURE_REFERENCE ──
    const lowerText = allText.toLowerCase();
    for (const keyword of ARCHITECTURE_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        violations.push({
          type: "ARCHITECTURE_REFERENCE",
          detail: `Reference to system architecture detected: "${keyword}"`,
          severity: "REJECT",
          parcelId: parcel.parcelId,
          analystId,
          detectedAt: now,
        });
        break; // One match is enough
      }
    }

    // ── Rule 5: SIZE_ANOMALY ──
    const parcelSize = JSON.stringify(parcel).length;
    if (this.sizeHistory.length >= FirewallService.MIN_SIZE_SAMPLES) {
      const avgSize = this.sizeHistory.reduce((a, b) => a + b, 0) / this.sizeHistory.length;
      if (parcelSize > avgSize * FirewallService.SIZE_ANOMALY_MULTIPLIER) {
        violations.push({
          type: "SIZE_ANOMALY",
          detail: `Parcel size ${parcelSize} is ${(parcelSize / avgSize).toFixed(1)}x average (${avgSize.toFixed(0)}) — exceeds ${FirewallService.SIZE_ANOMALY_MULTIPLIER}x threshold`,
          severity: "REJECT",
          parcelId: parcel.parcelId,
          analystId,
          detectedAt: now,
        });
      }
    }
    this.sizeHistory.push(parcelSize);
    if (this.sizeHistory.length > FirewallService.SIZE_HISTORY_SIZE) this.sizeHistory.shift();

    // ── Rule 6: ESCALATION_LOGIC ──
    for (const pattern of ESCALATION_PATTERNS) {
      const match = allText.match(pattern);
      if (match) {
        violations.push({
          type: "ESCALATION_LOGIC",
          detail: `Escalation language detected: "${match[0]}"`,
          severity: "REJECT",
          parcelId: parcel.parcelId,
          analystId,
          detectedAt: now,
        });
        break;
      }
    }

    // ── Rule 7: TIMESTAMP_FINGERPRINT ──
    if (parcel.timestamp && parcel.timestamp.includes(".")) {
      // Sub-second precision detected — could fingerprint the model
      const msPart = parcel.timestamp.split(".")[1]?.replace("Z", "");
      if (msPart && msPart.length > 3) {
        violations.push({
          type: "TIMESTAMP_FINGERPRINT",
          detail: `Sub-millisecond timestamp precision detected: "${parcel.timestamp}" — possible model fingerprint`,
          severity: "WARNING",
          parcelId: parcel.parcelId,
          analystId,
          detectedAt: now,
        });
      }
    }

    // ── Determine result ──
    const hasReject = violations.some(v => v.severity === "REJECT");
    const quarantined = hasReject;

    this.totalViolations += violations.length;
    if (hasReject) this.totalRejected++;

    // Track violations
    for (const v of violations) {
      this.recentViolations.push(v);
      if (this.recentViolations.length > FirewallService.MAX_VIOLATION_HISTORY) {
        this.recentViolations.shift();
      }
    }

    const result: FirewallScanResult = {
      passed: !hasReject,
      violations,
      quarantined,
    };

    // For Blue parcels that pass: generate sanitised version for Red Team
    if (!hasReject && analystId === "ANALYST_A") {
      result.sanitisedForRedTeam = this.sanitiseForRedTeam(parcel);
    }

    if (hasReject) {
      console.error(
        `[IRON-HALO] ██ FIREWALL REJECT ██ parcel=${parcel.parcelId} analyst=${analystId} ` +
        `violations=${violations.filter(v => v.severity === "REJECT").length} — ` +
        `${violations.filter(v => v.severity === "REJECT").map(v => v.type).join(", ")}`,
      );
    }

    return result;
  }

  /**
   * Sanitise a Blue Team parcel for delivery to Red Team.
   * Strip identity: analystId, parcelId, operatorId replaced.
   * Red Team doesn't know it's reviewing another AI's work.
   */
  private sanitiseForRedTeam(parcel: AdvisoryParcel): Partial<AdvisoryParcel> {
    return {
      // Identity stripped — anonymous placeholders
      analystId: "ANALYST_B" as AnalystId, // Red Team's own ID (doesn't know A exists)
      operatorId: "SUBJECT", // Anonymised
      // Keep analytical content
      verdict: parcel.verdict,
      confidence: parcel.confidence,
      findings: parcel.findings.map(f => ({ ...f })),
      anomalies: parcel.anomalies.map(a => ({ ...a })),
      missionDelta: { ...parcel.missionDelta },
      clipAnalysis: { ...parcel.clipAnalysis },
      schemaVersion: parcel.schemaVersion,
      // No parcelId, no timestamp — zero fingerprinting
    };
  }

  /**
   * Collect all text fields from a parcel for scanning.
   */
  private collectAllText(parcel: AdvisoryParcel): string {
    const parts: string[] = [];

    for (const f of parcel.findings) {
      parts.push(f.description, f.evidence);
    }
    for (const a of parcel.anomalies) {
      parts.push(a.type, a.detail);
    }
    parts.push(
      parcel.missionDelta.expectedPath,
      parcel.missionDelta.actualPath,
      parcel.missionDelta.deviation,
      parcel.missionDelta.reasoning,
      parcel.clipAnalysis.suspiciousPattern,
    );

    return parts.join(" ");
  }

  getStats(): {
    totalScanned: number;
    totalRejected: number;
    totalViolations: number;
  } {
    return {
      totalScanned: this.totalScanned,
      totalRejected: this.totalRejected,
      totalViolations: this.totalViolations,
    };
  }

  getRecentViolations(limit = 50): FirewallViolation[] {
    return this.recentViolations.slice(-limit).reverse();
  }
}
