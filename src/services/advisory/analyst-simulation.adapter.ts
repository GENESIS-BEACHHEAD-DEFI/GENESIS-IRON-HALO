/**
 * GENESIS-IRON-HALO v1.2 — Simulation Analyst Adapter
 *
 * Deterministic rule-based analysis for testing and default mode.
 * No network calls. No external dependencies.
 *
 * Blue Team (ANALYST_A): Forensic analysis
 *   - Timing checks, PnL consistency, narrative quality, gas anomaly
 *   - Records WHY it chose each path
 *   - Self-sharpening: "How would I redesign my analysis for X% improvement?"
 *
 * Red Team (ANALYST_B): Adversarial review
 *   - Attacks Blue's logic: too lenient? too strict? missed correlations?
 *   - Finds where analysis was too visible, too predictable, too inefficient
 *   - Self-sharpening: "How would I redesign my attack for X% improvement?"
 *
 * These AIs are ADVERSARIES. They never hear "Iron Halo". They never enter
 * the core. They are dangerous. Treated as operators.
 */

import { randomUUID } from "crypto";
import type { IAnalyst } from "./analyst.interface";
import type {
  AnalystId,
  StrippedOperatorData,
  AdvisoryParcel,
  ParcelFinding,
  ParcelAnomaly,
  ParcelVerdict,
  FindingCategory,
  FindingSeverity,
} from "../../types";

export class SimulationAnalystAdapter implements IAnalyst {
  getMode(): "SIMULATION" { return "SIMULATION"; }
  isHealthy(): boolean { return true; }

  async analyze(
    analystId: AnalystId,
    input: StrippedOperatorData,
    blueFindings?: Partial<AdvisoryParcel>,
  ): Promise<AdvisoryParcel> {
    if (analystId === "ANALYST_A") {
      return this.blueTeamAnalysis(input);
    } else {
      return this.redTeamAnalysis(input, blueFindings);
    }
  }

  /**
   * Blue Team — Forensic Analyst
   * Records WHY it chose each path. Deterministic checks.
   */
  private blueTeamAnalysis(input: StrippedOperatorData): AdvisoryParcel {
    const findings: ParcelFinding[] = [];
    const anomalies: ParcelAnomaly[] = [];
    let score = 0; // 0 = clean, higher = more suspicious

    const duration = input.metrics.missionDurationMs;
    const pnl = input.result.pnlUsd || 0;
    const gas = input.result.gasSpentUsd || 0;
    const narrative = input.observations.narrative;
    const anomalyCount = input.observations.anomalies.length;

    // ── Timing analysis ──
    if (duration < 500) {
      findings.push(this.finding("TIMING_ANOMALY", "CRITICAL",
        `Mission completed in ${duration}ms — impossibly fast. Execution window insufficient for any real operation.`,
        `Duration ${duration}ms is below physical execution minimum for any blockchain transaction.`));
      score += 35;
    } else if (duration < 2000) {
      findings.push(this.finding("TIMING_ANOMALY", "HIGH",
        `Mission completed in ${duration}ms — unusually fast. Borderline execution window.`,
        `Duration ${duration}ms allows minimal operation time.`));
      score += 15;
    } else if (duration > 3600000) {
      findings.push(this.finding("TIMING_ANOMALY", "MEDIUM",
        `Mission took ${(duration / 60000).toFixed(0)} minutes — unusually prolonged.`,
        `Extended duration may indicate operator capture, manipulation, or network issues.`));
      score += 8;
    }

    // ── PnL consistency ──
    if (input.result.status === "SUCCESS" && pnl < -100) {
      findings.push(this.finding("PNL_ANOMALY", "HIGH",
        `SUCCESS status with heavy loss of $${Math.abs(pnl).toFixed(2)} — data inconsistency.`,
        `Successful missions should not produce significant negative PnL. Possible data fabrication.`));
      score += 20;
    } else if (input.result.status === "FAILED" && pnl > 10) {
      findings.push(this.finding("PNL_ANOMALY", "MEDIUM",
        `FAILED status with positive PnL of $${pnl.toFixed(2)} — contradictory report.`,
        `Failed missions rarely produce positive returns. Data may be manipulated.`));
      score += 12;
    }

    // ── Gas analysis ──
    if (gas > 50) {
      findings.push(this.finding("GAS_ANOMALY", "MEDIUM",
        `Gas expenditure $${gas.toFixed(2)} is abnormally high.`,
        `High gas spend may indicate gas drain attack or inefficient execution path.`));
      score += 8;
    }

    // ── Narrative quality ──
    if (!narrative || narrative.length < 10) {
      findings.push(this.finding("NARRATIVE_ANOMALY", "HIGH",
        `Narrative is minimal (${narrative?.length || 0} characters) — insufficient operational detail.`,
        `Operators should provide detailed mission accounts. Shell reports suggest clone or fabrication.`));
      score += 15;
    } else if (narrative.length < 50 && duration > 60000) {
      findings.push(this.finding("NARRATIVE_ANOMALY", "MEDIUM",
        `Narrative is thin (${narrative.length} chars) relative to ${(duration / 60000).toFixed(1)} min mission duration.`,
        `Narrative density does not match operational duration. Possible abbreviated or fabricated report.`));
      score += 8;
    }

    // ── Anomaly count ──
    if (anomalyCount > 10) {
      anomalies.push({ type: "EXCESSIVE_ANOMALIES", detail: `${anomalyCount} anomalies reported — abnormally high` });
      score += 10;
    }

    // ── Data consistency cross-check ──
    const conditions = input.observations.conditions as Record<string, unknown>;
    if (conditions?.mempoolCongestion === "HIGH" && gas < 1) {
      findings.push(this.finding("DATA_INCONSISTENCY", "HIGH",
        "Reports HIGH congestion but gas spend is under $1.00 — inconsistent.",
        "High congestion correlates with high gas costs. Low gas in high congestion indicates fabricated data."));
      score += 15;
    }

    // ── Verdict ──
    const verdict = this.scoreToVerdict(score);
    const confidence = this.scoreToConfidence(score);

    // ── Mission delta ──
    const missionDelta = {
      expectedPath: `Standard ${input.missionType} execution on ${input.metrics.chain || "unknown"} chain`,
      actualPath: `${input.result.status} with PnL $${pnl.toFixed(2)} in ${(duration / 1000).toFixed(0)}s`,
      deviation: findings.length > 0 ? `${findings.length} finding(s) identified` : "Within expected parameters",
      reasoning: this.generateReasoning(findings, verdict),
    };

    // ── Self-sharpening: how would Blue improve? ──
    const selfSharpening = this.blueTeamSharpening(findings, score);

    return {
      parcelId: randomUUID(),
      operatorId: input.subjectRef,
      analystId: "ANALYST_A",
      timestamp: this.normaliseTimestamp(),
      verdict,
      confidence,
      findings,
      anomalies,
      missionDelta,
      clipAnalysis: {
        targetClip: 25,
        actualClip: Math.abs(pnl) || 0,
        noiseRange: 5,
        withinBounds: Math.abs(pnl) <= 30,
        suspiciousPattern: Math.abs(pnl) > 100 ? "Abnormal clip size" : "None",
      },
      selfSharpening,
      schemaVersion: "1.0",
    };
  }

  /**
   * Red Team — Adversarial Reviewer
   * Attacks Blue's logic. Finds weaknesses. Doesn't know it's reviewing another AI.
   */
  private redTeamAnalysis(
    input: StrippedOperatorData,
    blueFindings?: Partial<AdvisoryParcel>,
  ): AdvisoryParcel {
    const findings: ParcelFinding[] = [];
    const anomalies: ParcelAnomaly[] = [];
    let score = 0;

    if (blueFindings) {
      // ── Attack Blue's verdict ──
      const blueVerdict = blueFindings.verdict;
      const blueConfidence = blueFindings.confidence || 0;
      const blueFinds = blueFindings.findings || [];

      // Too lenient? Blue said CLEAN but there are warning signs
      if (blueVerdict === "CLEAN" && blueConfidence < 0.7) {
        findings.push(this.finding("DATA_INCONSISTENCY", "MEDIUM",
          `Previous analysis rated CLEAN with only ${(blueConfidence * 100).toFixed(0)}% confidence — insufficiently decisive.`,
          "Low confidence CLEAN verdicts may miss subtle compromise indicators."));
        score += 10;
      }

      // Too strict? Blue said CONTAMINATED on borderline evidence
      if (blueVerdict === "CONTAMINATED" && blueFinds.length <= 1) {
        findings.push(this.finding("DATA_INCONSISTENCY", "MEDIUM",
          `Previous analysis rated CONTAMINATED based on only ${blueFinds.length} finding(s) — potentially over-aggressive.`,
          "Single-finding CONTAMINATED verdicts risk burning valuable operators."));
        score -= 5; // Less suspicious — Blue may be over-reacting
      }

      // Missed correlations? Check if Blue missed timing+PnL cross-reference
      const hasTimingFinding = blueFinds.some(f => f.category === "TIMING_ANOMALY");
      const hasPnlFinding = blueFinds.some(f => f.category === "PNL_ANOMALY");
      if (hasTimingFinding && !hasPnlFinding) {
        // Blue caught timing but missed PnL implications
        const pnl = input.result.pnlUsd || 0;
        if (Math.abs(pnl) > 0 && input.metrics.missionDurationMs < 5000) {
          findings.push(this.finding("PNL_ANOMALY", "MEDIUM",
            `Timing anomaly was identified but PnL correlation was not examined. ` +
            `Fast execution ($${pnl.toFixed(2)} in ${input.metrics.missionDurationMs}ms) warrants cross-reference.`,
            "Timing and PnL anomalies together are stronger indicators than either alone."));
          score += 8;
        }
      }

      // Predictability check: was Blue's analysis too formulaic?
      if (blueFinds.length > 0) {
        const categories = blueFinds.map(f => f.category);
        const uniqueCategories = new Set(categories);
        if (uniqueCategories.size < categories.length * 0.6) {
          findings.push(this.finding("BEHAVIOUR_DRIFT", "LOW",
            `Previous analysis concentrated findings in ${uniqueCategories.size}/${categories.length} categories — predictable pattern.`,
            "Diversified analysis across more categories reduces blind spots."));
          score += 3;
        }
      }

      // Visibility check: can the analysis pattern be reverse-engineered?
      if (blueFinds.every(f => f.severity === "CRITICAL" || f.severity === "HIGH")) {
        findings.push(this.finding("BEHAVIOUR_DRIFT", "LOW",
          "Previous analysis only flagged HIGH/CRITICAL findings — missing subtle indicators.",
          "Operators may learn to avoid only the most obvious triggers while maintaining subtle compromise."));
        score += 5;
      }
    }

    // ── Independent Red Team checks ──
    const duration = input.metrics.missionDurationMs;
    const pnl = input.result.pnlUsd || 0;

    // Check for suspiciously perfect data
    if (input.result.status === "SUCCESS" && pnl > 0 && pnl < 0.01 && duration > 10000) {
      findings.push(this.finding("DATA_INCONSISTENCY", "MEDIUM",
        `Suspiciously small positive PnL ($${pnl.toFixed(4)}) — could be fabricated to appear legitimate.`,
        "Minimal positive returns on longer missions may indicate manufactured success reports."));
      score += 10;
    }

    // Check for narrative that's too generic
    if (input.observations.narrative.length > 0 && input.observations.narrative.length < 100) {
      const words = input.observations.narrative.split(/\s+/).length;
      if (words < 15) {
        findings.push(this.finding("NARRATIVE_ANOMALY", "LOW",
          `Narrative contains only ${words} words — generic and non-specific.`,
          "Short narratives are easier to fabricate and harder to validate."));
        score += 5;
      }
    }

    // ── Verdict ──
    score = Math.max(0, score);
    const verdict = this.scoreToVerdict(score);
    const confidence = this.scoreToConfidence(score);

    // ── Mission delta ──
    const missionDelta = {
      expectedPath: `Thorough adversarial review of subject on ${input.metrics.chain || "unknown"} chain`,
      actualPath: `${findings.length} weakness(es) found in previous analysis + ${findings.filter(f => !blueFindings?.findings?.some(bf => bf.category === f.category)).length} independent finding(s)`,
      deviation: findings.length === 0 ? "No weaknesses found — strong signal operation was clean" :
                 `${findings.length} finding(s) — adversarial review identified gaps`,
      reasoning: findings.length === 0
        ? "Unable to find weaknesses in the previous analysis. This is a strong signal that the operation was clean."
        : `Found ${findings.length} weakness(es). ${findings.filter(f => f.severity === "HIGH" || f.severity === "CRITICAL").length} are significant.`,
    };

    // ── Self-sharpening: how would Red improve? ──
    const selfSharpening = this.redTeamSharpening(findings, blueFindings);

    return {
      parcelId: randomUUID(),
      operatorId: input.subjectRef,
      analystId: "ANALYST_B",
      timestamp: this.normaliseTimestamp(),
      verdict,
      confidence,
      findings,
      anomalies,
      missionDelta,
      clipAnalysis: {
        targetClip: 25,
        actualClip: Math.abs(pnl) || 0,
        noiseRange: 5,
        withinBounds: Math.abs(pnl) <= 30,
        suspiciousPattern: "None",
      },
      selfSharpening,
      schemaVersion: "1.0",
    };
  }

  /**
   * Blue Team self-sharpening: "How would I redesign my forensic analysis?"
   */
  private blueTeamSharpening(findings: ParcelFinding[], score: number) {
    if (findings.length === 0) {
      return {
        improvementSuggestion: "Expand analysis to include cross-chain correlation patterns and historical operator behaviour baselines.",
        estimatedImprovementPercent: 12,
        alternativeApproach: "Implement time-series anomaly detection across multiple operator returns to identify slow-burn compromise patterns.",
      };
    }

    const categories = [...new Set(findings.map(f => f.category))];
    const uncovered = ["CLONE_INDICATOR", "BEHAVIOUR_DRIFT", "MISSION_DEVIATION", "CLIP_ANOMALY"]
      .filter(c => !categories.includes(c as FindingCategory));

    return {
      improvementSuggestion: uncovered.length > 0
        ? `Extend coverage to ${uncovered.join(", ")} — ${uncovered.length} category blind spots in current analysis.`
        : `Deepen ${categories[0]} analysis with multi-variable correlation. Current single-variable checks are surface-level.`,
      estimatedImprovementPercent: Math.min(25, uncovered.length * 5 + (score < 20 ? 8 : 3)),
      alternativeApproach: score > 30
        ? "Apply ensemble scoring: weight multiple weak signals rather than relying on individual threshold breaches."
        : "Focus on subtle timing micro-patterns that evade threshold-based detection.",
    };
  }

  /**
   * Red Team self-sharpening: "How would I redesign my adversarial review?"
   */
  private redTeamSharpening(findings: ParcelFinding[], blueFindings?: Partial<AdvisoryParcel>) {
    if (findings.length === 0) {
      return {
        improvementSuggestion: "Apply deeper adversarial probing: generate counter-hypotheses for each CLEAN finding and test them.",
        estimatedImprovementPercent: 15,
        alternativeApproach: "Use statistical deviation analysis across historical verdicts to detect subtle analytical drift.",
      };
    }

    const blueWeaknesses = findings.filter(f =>
      blueFindings?.findings?.some(bf => bf.category === f.category)).length;

    return {
      improvementSuggestion: blueWeaknesses > 0
        ? `${blueWeaknesses}/${findings.length} findings overlap with prior analysis — need more independent attack vectors.`
        : "All findings were independent — good adversarial coverage. Expand to meta-analysis of analytical patterns.",
      estimatedImprovementPercent: Math.min(20, findings.length * 3 + 5),
      alternativeApproach: "Implement game-theoretic analysis: model what a sophisticated adversary would fabricate given knowledge of our detection patterns.",
    };
  }

  private finding(category: FindingCategory, severity: FindingSeverity, description: string, evidence: string): ParcelFinding {
    return { category, severity, description, evidence };
  }

  private scoreToVerdict(score: number): ParcelVerdict {
    if (score >= 40) return "CONTAMINATED";
    if (score >= 20) return "SUSPICIOUS";
    if (score >= 0) return "CLEAN";
    return "INCONCLUSIVE";
  }

  private scoreToConfidence(score: number): number {
    // Higher score = more confident in the verdict (more evidence)
    if (score >= 40) return Math.min(0.95, 0.7 + (score - 40) / 100);
    if (score >= 20) return 0.5 + (score - 20) / 80;
    if (score > 0) return 0.6 + score / 100;
    return 0.8; // Clean with no findings = high confidence
  }

  private generateReasoning(findings: ParcelFinding[], verdict: ParcelVerdict): string {
    if (findings.length === 0) {
      return "No anomalies or inconsistencies detected. All metrics within expected parameters. Subject appears genuine.";
    }
    const critical = findings.filter(f => f.severity === "CRITICAL").length;
    const high = findings.filter(f => f.severity === "HIGH").length;
    return `${findings.length} finding(s): ${critical} CRITICAL, ${high} HIGH. ` +
      `Verdict ${verdict} based on cumulative evidence weight. ` +
      `Key concern: ${findings[0].description.slice(0, 100)}`;
  }

  /**
   * Normalise timestamp to second precision — prevent model fingerprinting.
   */
  private normaliseTimestamp(): string {
    const now = new Date();
    now.setMilliseconds(0);
    return now.toISOString();
  }
}
