/**
 * GENESIS-IRON-HALO v1.2 — Circuit Breaker Service
 *
 * "If either AI produces anomalous parcels, circuit breaker trips."
 * "Iron Halo falls back to internal deterministic rules."
 * "External AIs are enhancement, never dependency."
 *
 * Per-analyst independent state machines:
 *   CLOSED  → normal operation, parcels flow
 *   OPEN    → tripped — all parcels from this analyst rejected
 *   HALF_OPEN → probing — test next parcel, success→CLOSED, fail→OPEN
 *
 * Anomaly triggers:
 *   - Malformed schema (missing required fields, wrong types)
 *   - Verdict pattern shift (3+ same verdict in a row for different operators)
 *   - Timing deviation (too fast or too slow)
 *   - Volume anomaly (more than 1 parcel per zone)
 *   - Content violation (firewall REJECT)
 */

import type {
  AnalystId,
  CircuitBreakerState,
  CircuitBreakerRecord,
  CircuitBreakerAnomaly,
  CircuitBreakerAnomalyType,
} from "../../types";

const THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || "3", 10);
const COOLDOWN_MS = parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || "300000", 10); // 5 min

const MAX_ANOMALY_HISTORY = 100;
const VERDICT_SHIFT_THRESHOLD = 3; // 3+ identical verdicts in a row = pattern shift

export class CircuitBreakerService {
  private breakers: Map<AnalystId, CircuitBreakerRecord> = new Map();
  /** Recent verdicts per analyst for pattern shift detection */
  private verdictHistory: Map<AnalystId, string[]> = new Map();

  constructor() {
    // Initialise both breakers in CLOSED state
    this.breakers.set("ANALYST_A", this.createRecord("ANALYST_A"));
    this.breakers.set("ANALYST_B", this.createRecord("ANALYST_B"));
    this.verdictHistory.set("ANALYST_A", []);
    this.verdictHistory.set("ANALYST_B", []);
  }

  /**
   * Check current state for an analyst.
   * Auto-transitions OPEN → HALF_OPEN if cooldown has elapsed.
   */
  check(analystId: AnalystId): CircuitBreakerState {
    const breaker = this.breakers.get(analystId)!;
    breaker.lastCheckedAt = new Date().toISOString();

    // Auto-transition: OPEN → HALF_OPEN after cooldown
    if (breaker.state === "OPEN" && breaker.trippedAt) {
      const elapsed = Date.now() - new Date(breaker.trippedAt).getTime();
      if (elapsed >= COOLDOWN_MS) {
        breaker.state = "HALF_OPEN";
        console.log(
          `[IRON-HALO] CIRCUIT_BREAKER analyst=${analystId} OPEN → HALF_OPEN ` +
          `(cooldown ${COOLDOWN_MS}ms elapsed — probing next parcel)`,
        );
      }
    }

    return breaker.state;
  }

  /**
   * Record a successful parcel processing.
   * HALF_OPEN → CLOSED on success.
   */
  recordSuccess(analystId: AnalystId): void {
    const breaker = this.breakers.get(analystId)!;
    breaker.consecutiveFailures = 0;

    if (breaker.state === "HALF_OPEN") {
      breaker.state = "CLOSED";
      console.log(
        `[IRON-HALO] CIRCUIT_BREAKER analyst=${analystId} HALF_OPEN → CLOSED ` +
        `(probe succeeded — analyst restored)`,
      );
    }
  }

  /**
   * Record a failure/anomaly for an analyst.
   * Trips the breaker after THRESHOLD consecutive failures.
   */
  recordFailure(analystId: AnalystId, anomalyType: CircuitBreakerAnomalyType, detail: string): void {
    const breaker = this.breakers.get(analystId)!;
    const anomaly: CircuitBreakerAnomaly = {
      type: anomalyType,
      detail,
      detectedAt: new Date().toISOString(),
      analystId,
    };

    breaker.anomalyHistory.push(anomaly);
    if (breaker.anomalyHistory.length > MAX_ANOMALY_HISTORY) {
      breaker.anomalyHistory.shift();
    }

    breaker.consecutiveFailures++;

    console.log(
      `[IRON-HALO] CIRCUIT_BREAKER_ANOMALY analyst=${analystId} type=${anomalyType} ` +
      `consecutive=${breaker.consecutiveFailures}/${THRESHOLD} — ${detail}`,
    );

    // HALF_OPEN + failure → back to OPEN
    if (breaker.state === "HALF_OPEN") {
      this.trip(analystId, `Probe failed: ${anomalyType} — ${detail}`);
      return;
    }

    // CLOSED + threshold reached → OPEN
    if (breaker.consecutiveFailures >= THRESHOLD) {
      this.trip(analystId, `${THRESHOLD} consecutive failures: ${anomalyType} — ${detail}`);
    }
  }

  /**
   * Record a verdict for pattern shift detection.
   * 3+ identical verdicts in a row = suspicious pattern shift.
   */
  recordVerdict(analystId: AnalystId, verdict: string): void {
    const history = this.verdictHistory.get(analystId) || [];
    history.push(verdict);
    if (history.length > 10) history.shift();
    this.verdictHistory.set(analystId, history);

    // Check for pattern shift: last N verdicts identical
    if (history.length >= VERDICT_SHIFT_THRESHOLD) {
      const lastN = history.slice(-VERDICT_SHIFT_THRESHOLD);
      const allSame = lastN.every(v => v === lastN[0]);
      if (allSame) {
        this.recordFailure(
          analystId,
          "VERDICT_SHIFT",
          `${VERDICT_SHIFT_THRESHOLD} consecutive "${lastN[0]}" verdicts — pattern shift detected`,
        );
      }
    }
  }

  /**
   * Force-trip the circuit breaker.
   */
  trip(analystId: AnalystId, reason: string): void {
    const breaker = this.breakers.get(analystId)!;
    breaker.state = "OPEN";
    breaker.tripReason = reason;
    breaker.trippedAt = new Date().toISOString();
    breaker.totalTrips++;

    console.error(
      `[IRON-HALO] ██ CIRCUIT_BREAKER_TRIPPED ██ analyst=${analystId} ` +
      `trips=${breaker.totalTrips} — ${reason}. ` +
      `Falling back to internal deterministic rules. ` +
      `Cooldown: ${COOLDOWN_MS}ms before HALF_OPEN probe.`,
    );
  }

  /**
   * Manual reset — force a breaker back to CLOSED.
   */
  reset(analystId: AnalystId): void {
    const breaker = this.breakers.get(analystId)!;
    breaker.state = "CLOSED";
    breaker.consecutiveFailures = 0;
    breaker.tripReason = undefined;
    breaker.trippedAt = undefined;

    console.log(
      `[IRON-HALO] CIRCUIT_BREAKER_RESET analyst=${analystId} — ` +
      `manually reset to CLOSED`,
    );
  }

  /**
   * Check if both breakers are OPEN (full fallback needed).
   */
  areBothOpen(): boolean {
    return (
      this.breakers.get("ANALYST_A")!.state === "OPEN" &&
      this.breakers.get("ANALYST_B")!.state === "OPEN"
    );
  }

  /**
   * Get state for a specific analyst.
   */
  getState(analystId: AnalystId): CircuitBreakerRecord {
    return { ...this.breakers.get(analystId)! };
  }

  /**
   * Get state for both analysts.
   */
  getAllStates(): { analystA: CircuitBreakerRecord; analystB: CircuitBreakerRecord } {
    return {
      analystA: this.getState("ANALYST_A"),
      analystB: this.getState("ANALYST_B"),
    };
  }

  private createRecord(analystId: AnalystId): CircuitBreakerRecord {
    return {
      target: analystId,
      state: "CLOSED",
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      totalTrips: 0,
      anomalyHistory: [],
    };
  }
}
