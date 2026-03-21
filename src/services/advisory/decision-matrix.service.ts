/**
 * GENESIS-IRON-HALO v1.2 — Decision Matrix Service
 *
 * "Iron Halo is judge — deterministic, auditable, final authority."
 *
 * Maps Blue Team + Red Team parcels to an advisory action.
 * Pure deterministic logic. No AI involvement. No live learning.
 *
 * Decision Matrix:
 *   | Parcel A     | Parcel B     | Action              |
 *   |--------------|--------------|---------------------|
 *   | CLEAN        | CLEAN        | RELEASE             |
 *   | CLEAN        | SUSPICIOUS   | HOLD_MANUAL_REVIEW  |
 *   | SUSPICIOUS   | SUSPICIOUS   | QUARANTINE_DARPA    |
 *   | CONTAMINATED | anything     | QUARANTINE_BURN     |
 *   | anything     | CONTAMINATED | QUARANTINE_BURN     |
 *   | INCONCLUSIVE | INCONCLUSIVE | RERUN               |
 *   | Timeout/Null | any          | INTERNAL_RULES_ONLY |
 *   | Malformed    | any          | CIRCUIT_BREAKER     |
 */

import type {
  AdvisoryParcel,
  AdvisoryAction,
  AdvisoryVerdict,
  FirewallScanResult,
  CircuitBreakerState,
} from "../../types";

export class DecisionMatrixService {
  private totalResolutions = 0;
  private actionCounts: Record<AdvisoryAction, number> = {
    RELEASE: 0,
    HOLD_MANUAL_REVIEW: 0,
    QUARANTINE_DARPA: 0,
    QUARANTINE_BURN: 0,
    RERUN: 0,
    INTERNAL_RULES_ONLY: 0,
    CIRCUIT_BREAKER_FALLBACK: 0,
  };

  /**
   * Resolve two advisory parcels into a final advisory verdict.
   * Pure deterministic logic. Iron Halo as sole judge.
   */
  resolve(
    parcelA: AdvisoryParcel | null,
    parcelB: AdvisoryParcel | null,
    firewallA: FirewallScanResult,
    firewallB: FirewallScanResult,
    circuitBreaker: { a: CircuitBreakerState; b: CircuitBreakerState },
  ): AdvisoryVerdict {
    this.totalResolutions++;
    const now = new Date().toISOString();

    // ── Circuit breaker check ──
    if (circuitBreaker.a === "OPEN" && circuitBreaker.b === "OPEN") {
      return this.makeVerdict(
        "CIRCUIT_BREAKER_FALLBACK",
        "Both analyst circuit breakers OPEN. Full fallback to internal deterministic rules.",
        parcelA, parcelB, firewallA, firewallB, true, true, now,
      );
    }

    // ── Firewall rejections ──
    if (firewallA.quarantined && firewallB.quarantined) {
      return this.makeVerdict(
        "INTERNAL_RULES_ONLY",
        "Both parcels quarantined by firewall. Internal rules only.",
        parcelA, parcelB, firewallA, firewallB, false, true, now,
      );
    }

    if (firewallA.quarantined) {
      return this.makeVerdict(
        "INTERNAL_RULES_ONLY",
        `Blue Team parcel quarantined: ${firewallA.violations.filter(v => v.severity === "REJECT").map(v => v.type).join(", ")}. Internal rules only.`,
        parcelA, parcelB, firewallA, firewallB, false, true, now,
      );
    }

    if (firewallB.quarantined) {
      return this.makeVerdict(
        "INTERNAL_RULES_ONLY",
        `Red Team parcel quarantined: ${firewallB.violations.filter(v => v.severity === "REJECT").map(v => v.type).join(", ")}. Internal rules only.`,
        parcelA, parcelB, firewallA, firewallB, false, true, now,
      );
    }

    // ── Null/missing parcels ──
    if (!parcelA || !parcelB) {
      const missing = !parcelA && !parcelB ? "both parcels" : !parcelA ? "Blue Team parcel" : "Red Team parcel";
      return this.makeVerdict(
        "INTERNAL_RULES_ONLY",
        `Missing ${missing}. Timeout or analyst failure. Internal rules only.`,
        parcelA, parcelB, firewallA, firewallB, false, true, now,
      );
    }

    // ── Single circuit breaker OPEN (partial) ──
    if (circuitBreaker.a === "OPEN") {
      // Only Red Team parcel available — use it + internal rules
      return this.resolveSingleParcel(parcelB, "Red Team only (Blue circuit breaker OPEN)", parcelA, parcelB, firewallA, firewallB, now);
    }

    if (circuitBreaker.b === "OPEN") {
      // Only Blue Team parcel available — use it + internal rules
      return this.resolveSingleParcel(parcelA, "Blue Team only (Red circuit breaker OPEN)", parcelA, parcelB, firewallA, firewallB, now);
    }

    // ── Both parcels available — full decision matrix ──
    const verdictA = parcelA.verdict;
    const verdictB = parcelB.verdict;

    // CONTAMINATED by either → QUARANTINE_BURN
    if (verdictA === "CONTAMINATED" || verdictB === "CONTAMINATED") {
      const who = verdictA === "CONTAMINATED" && verdictB === "CONTAMINATED" ? "Both analysts" :
                  verdictA === "CONTAMINATED" ? "Blue Team" : "Red Team";
      return this.makeVerdict(
        "QUARANTINE_BURN",
        `${who} verdict CONTAMINATED (Blue: ${verdictA}/${parcelA.confidence.toFixed(2)}, Red: ${verdictB}/${parcelB.confidence.toFixed(2)}). Quarantine immediately. Burn operator.`,
        parcelA, parcelB, firewallA, firewallB, false, false, now,
      );
    }

    // Both CLEAN → RELEASE
    if (verdictA === "CLEAN" && verdictB === "CLEAN") {
      return this.makeVerdict(
        "RELEASE",
        `Both analysts verdict CLEAN (Blue: ${parcelA.confidence.toFixed(2)}, Red: ${parcelB.confidence.toFixed(2)}). High confidence. Release operator.`,
        parcelA, parcelB, firewallA, firewallB, false, false, now,
      );
    }

    // Both SUSPICIOUS → QUARANTINE_DARPA
    if (verdictA === "SUSPICIOUS" && verdictB === "SUSPICIOUS") {
      return this.makeVerdict(
        "QUARANTINE_DARPA",
        `Both analysts verdict SUSPICIOUS (Blue: ${parcelA.confidence.toFixed(2)}, Red: ${parcelB.confidence.toFixed(2)}). Flag to DARPA.`,
        parcelA, parcelB, firewallA, firewallB, false, false, now,
      );
    }

    // Both INCONCLUSIVE → RERUN
    if (verdictA === "INCONCLUSIVE" && verdictB === "INCONCLUSIVE") {
      return this.makeVerdict(
        "RERUN",
        `Both analysts verdict INCONCLUSIVE (Blue: ${parcelA.confidence.toFixed(2)}, Red: ${parcelB.confidence.toFixed(2)}). Re-run with different data slice. Circuit breaker check.`,
        parcelA, parcelB, firewallA, firewallB, false, false, now,
      );
    }

    // Mixed verdicts — HOLD_MANUAL_REVIEW
    return this.makeVerdict(
      "HOLD_MANUAL_REVIEW",
      `Analyst disagreement (Blue: ${verdictA}/${parcelA.confidence.toFixed(2)}, Red: ${verdictB}/${parcelB.confidence.toFixed(2)}). Hold for manual review. Log to GTC.`,
      parcelA, parcelB, firewallA, firewallB, false, false, now,
    );
  }

  /**
   * Resolve when only one parcel is available (circuit breaker partial).
   */
  private resolveSingleParcel(
    parcel: AdvisoryParcel,
    context: string,
    parcelA: AdvisoryParcel | null,
    parcelB: AdvisoryParcel | null,
    firewallA: FirewallScanResult,
    firewallB: FirewallScanResult,
    now: string,
  ): AdvisoryVerdict {
    if (parcel.verdict === "CONTAMINATED") {
      return this.makeVerdict(
        "QUARANTINE_BURN",
        `${context}: verdict CONTAMINATED (confidence: ${parcel.confidence.toFixed(2)}). Quarantine immediately.`,
        parcelA, parcelB, firewallA, firewallB, true, false, now,
      );
    }

    // Single parcel, non-CONTAMINATED — hold for review (reduced confidence without second opinion)
    return this.makeVerdict(
      "HOLD_MANUAL_REVIEW",
      `${context}: verdict ${parcel.verdict} (confidence: ${parcel.confidence.toFixed(2)}). Single analyst only — hold for manual review.`,
      parcelA, parcelB, firewallA, firewallB, true, false, now,
    );
  }

  private makeVerdict(
    action: AdvisoryAction,
    reasoning: string,
    parcelA: AdvisoryParcel | null,
    parcelB: AdvisoryParcel | null,
    firewallA: FirewallScanResult,
    firewallB: FirewallScanResult,
    circuitBreakerTripped: boolean,
    internalRulesOnly: boolean,
    decidedAt: string,
  ): AdvisoryVerdict {
    this.actionCounts[action]++;

    console.log(
      `[IRON-HALO] DECISION_MATRIX action=${action} ` +
      `blueVerdict=${parcelA?.verdict || "N/A"} redVerdict=${parcelB?.verdict || "N/A"} ` +
      `circuitBreaker=${circuitBreakerTripped} internalOnly=${internalRulesOnly}`,
    );

    return {
      action,
      parcelA: parcelA || undefined,
      parcelB: parcelB || undefined,
      firewallResultA: firewallA,
      firewallResultB: firewallB,
      reasoning,
      circuitBreakerTripped,
      internalRulesOnly,
      decidedAt,
    };
  }

  getStats(): {
    totalResolutions: number;
    actionCounts: Record<AdvisoryAction, number>;
  } {
    return {
      totalResolutions: this.totalResolutions,
      actionCounts: { ...this.actionCounts },
    };
  }
}
