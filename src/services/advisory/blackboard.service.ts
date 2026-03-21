/**
 * GENESIS-IRON-HALO v1.2 — Blackboard Service (Core Orchestrator)
 *
 * "They look dead. Inert. Until the right time."
 *
 * Orchestrates the full Blackboard Architecture advisory cycle:
 *   1. Strip sensitive data → anonymised subjectRef
 *   2. Generate dynamic mission schema (one-time use)
 *   3. Check circuit breakers
 *   4. Create Drop Zone A → Blue Team analysis
 *   5. FIREWALL: scan Blue parcel
 *   6. Sanitise Blue findings for Red Team (identity stripped)
 *   7. Create Drop Zone B → Red Team analysis
 *   8. FIREWALL: scan Red parcel
 *   9. Enforce minimum duration (anti-timing side-channel)
 *  10. Decision Matrix → AdvisoryVerdict
 *  11. Burn everything: drop zones, schema, mapping table
 *  12. Log to GTC (full audit trail)
 *  13. Return AdvisoryVerdict
 *
 * Wrapped in try-catch — ANY failure → INTERNAL_RULES_ONLY.
 * v1.2 is NEVER worse than v1.0. Enhancement, never dependency.
 *
 * The two AIs are ADVERSARIES. They never hear "Iron Halo".
 * They never enter the core. Bidirectional anonymity enforced.
 * Iron Halo is the sole deterministic judge.
 */

import { randomUUID } from "crypto";
import type {
  OperatorReturnReport,
  HaloRecord,
  AdvisoryVerdict,
  StrippedOperatorData,
  BlackboardState,
  AdvisoryParcel,
} from "../../types";

import type { IAnalyst } from "./analyst.interface";
import { DropZoneService } from "./dropzone.service";
import { FirewallService } from "./firewall.service";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { SchemaGeneratorService } from "./schema-generator.service";
import { ParcelRendererService } from "./parcel-renderer.service";
import { DecisionMatrixService } from "./decision-matrix.service";

const GTC_URL = process.env.GTC_URL || "http://genesis-beachhead-gtc:8650";
const ADVISORY_MIN_DURATION_MS = parseInt(process.env.ADVISORY_MIN_DURATION_MS || "5000", 10);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class BlackboardService {
  private totalAdvisoryRuns = 0;
  private totalParcelAReceived = 0;
  private totalParcelBReceived = 0;
  private totalFirewallRejections = 0;
  private totalCircuitBreakerTrips = 0;
  private totalFallbackToInternal = 0;
  private totalAdvisoryMs = 0;
  private lastRunAt: string | null = null;

  /** Recent advisory verdicts for /advisory/history */
  private advisoryHistory: Array<{
    operatorId: string;
    missionId: string;
    action: string;
    reasoning: string;
    decidedAt: string;
    blueVerdict?: string;
    redVerdict?: string;
    blueConfidence?: number;
    redConfidence?: number;
    blueSelfSharpening?: AdvisoryParcel["selfSharpening"];
    redSelfSharpening?: AdvisoryParcel["selfSharpening"];
    circuitBreakerTripped: boolean;
    internalRulesOnly: boolean;
    durationMs: number;
  }> = [];
  private static readonly MAX_HISTORY = 200;

  constructor(
    private dropzone: DropZoneService,
    private firewall: FirewallService,
    private circuitBreaker: CircuitBreakerService,
    private schemaGenerator: SchemaGeneratorService,
    private renderer: ParcelRendererService,
    private decisionMatrix: DecisionMatrixService,
    private analyst: IAnalyst,
  ) {
    console.log(
      `[IRON-HALO] BLACKBOARD_ARCHITECTURE initialised mode=${analyst.getMode()} ` +
      `minDuration=${ADVISORY_MIN_DURATION_MS}ms — ` +
      `Two adversary AIs. Bidirectional anonymity. Iron Halo judges.`,
    );
  }

  /**
   * Run the full advisory cycle for an operator.
   *
   * ANY failure → INTERNAL_RULES_ONLY fallback.
   * v1.2 is NEVER worse than v1.0.
   */
  async runAdvisory(
    record: HaloRecord,
    report: OperatorReturnReport,
  ): Promise<AdvisoryVerdict> {
    const startTime = Date.now();
    this.totalAdvisoryRuns++;

    try {
      return await this.executeAdvisoryCycle(record, report, startTime);
    } catch (err) {
      // ANY failure → graceful degradation
      this.totalFallbackToInternal++;

      console.error(
        `[IRON-HALO] ADVISORY_FAILURE operator=${record.operatorId} ` +
        `error=${err instanceof Error ? err.message : "Unknown"} — ` +
        `Falling back to INTERNAL_RULES_ONLY. v1.2 enhancement failed, v1.0 pipeline continues.`,
      );

      // Log failure to GTC
      this.logToGtc("ADVISORY_FALLBACK_INTERNAL", record, {
        error: err instanceof Error ? err.message : "Unknown",
        fallbackReason: "Advisory cycle exception",
      });

      const verdict: AdvisoryVerdict = {
        action: "INTERNAL_RULES_ONLY",
        reasoning: `Advisory cycle failed: ${err instanceof Error ? err.message : "Unknown"}. Falling back to internal deterministic rules.`,
        circuitBreakerTripped: false,
        internalRulesOnly: true,
        decidedAt: new Date().toISOString(),
      };

      this.recordHistory(record, verdict, startTime);
      return verdict;
    }
  }

  private async executeAdvisoryCycle(
    record: HaloRecord,
    report: OperatorReturnReport,
    startTime: number,
  ): Promise<AdvisoryVerdict> {
    // ── Step 1: Strip sensitive data ──
    const subjectRef = randomUUID(); // Anonymised — AIs never see real operatorId
    const strippedData = this.stripData(report, subjectRef, record);

    console.log(
      `[IRON-HALO] ADVISORY_CYCLE_START operator=${record.operatorId} ` +
      `subject=${subjectRef.slice(0, 8)}... class=${record.operatorClass || "LEGACY"} ` +
      `mode=${this.analyst.getMode()}`,
    );

    // ── Step 2: Check circuit breakers ──
    const cbStateA = this.circuitBreaker.check("ANALYST_A");
    const cbStateB = this.circuitBreaker.check("ANALYST_B");

    if (this.circuitBreaker.areBothOpen()) {
      this.totalCircuitBreakerTrips++;
      this.totalFallbackToInternal++;

      console.error(
        `[IRON-HALO] ADVISORY_BOTH_BREAKERS_OPEN operator=${record.operatorId} — ` +
        `Full fallback to internal rules. Both analysts circuit-broken.`,
      );

      const emptyFirewall = { passed: false, violations: [], quarantined: false };
      const verdict = this.decisionMatrix.resolve(null, null, emptyFirewall, emptyFirewall, { a: cbStateA, b: cbStateB });

      this.logToGtc("ADVISORY_CIRCUIT_BREAKER_TRIP", record, { target: "BOTH" });
      await this.enforceMinDuration(startTime);
      this.recordHistory(record, verdict, startTime);
      return verdict;
    }

    // ── Step 3: Create Drop Zone A + Blue Team Analysis ──
    let parcelA: AdvisoryParcel | null = null;
    const zoneA = this.dropzone.createZone(record.operatorId, record.missionId, "ANALYST_A");

    if (cbStateA !== "OPEN") {
      this.dropzone.writeInput(zoneA.zoneId, strippedData);

      parcelA = await this.analyst.analyze("ANALYST_A", strippedData);
      this.totalParcelAReceived++;

      // Render to plain text cold document
      const renderedA = this.renderer.render(parcelA);
      this.dropzone.writeParcel(zoneA.zoneId, parcelA, renderedA);

      console.log(
        `[IRON-HALO] BLUE_PARCEL_RECEIVED operator=${record.operatorId} ` +
        `verdict=${parcelA.verdict} confidence=${parcelA.confidence.toFixed(2)} ` +
        `findings=${parcelA.findings.length}`,
      );
    }

    // ── Step 4: FIREWALL — Scan Blue parcel ──
    let firewallA = { passed: true, violations: [], quarantined: false } as import("../../types").FirewallScanResult;

    if (parcelA) {
      firewallA = this.firewall.scan(parcelA, "ANALYST_A");

      if (firewallA.quarantined) {
        this.totalFirewallRejections++;
        this.dropzone.quarantine(zoneA.zoneId);
        this.circuitBreaker.recordFailure("ANALYST_A", "CONTENT_VIOLATION",
          `Firewall rejected Blue parcel: ${firewallA.violations.filter(v => v.severity === "REJECT").map(v => v.type).join(", ")}`);

        this.logToGtc("ADVISORY_FIREWALL_REJECTION", record, {
          analyst: "ANALYST_A",
          violations: firewallA.violations.map(v => ({ type: v.type, detail: v.detail })),
        });

        // Contaminated parcel quarantined BEFORE Red Team ever sees it
        parcelA = null;
      } else {
        this.circuitBreaker.recordSuccess("ANALYST_A");
        if (parcelA.verdict) this.circuitBreaker.recordVerdict("ANALYST_A", parcelA.verdict);
      }
    }

    // ── Step 5: Sanitise Blue findings for Red Team ──
    const sanitisedBlue = firewallA.sanitisedForRedTeam;

    // ── Step 6: Create Drop Zone B + Red Team Analysis ──
    let parcelB: AdvisoryParcel | null = null;
    const zoneB = this.dropzone.createZone(record.operatorId, record.missionId, "ANALYST_B");

    if (cbStateB !== "OPEN") {
      this.dropzone.writeInput(zoneB.zoneId, strippedData);

      parcelB = await this.analyst.analyze("ANALYST_B", strippedData, sanitisedBlue || undefined);
      this.totalParcelBReceived++;

      const renderedB = this.renderer.render(parcelB);
      this.dropzone.writeParcel(zoneB.zoneId, parcelB, renderedB);

      console.log(
        `[IRON-HALO] RED_PARCEL_RECEIVED operator=${record.operatorId} ` +
        `verdict=${parcelB.verdict} confidence=${parcelB.confidence.toFixed(2)} ` +
        `findings=${parcelB.findings.length}`,
      );
    }

    // ── Step 7: FIREWALL — Scan Red parcel ──
    let firewallB = { passed: true, violations: [], quarantined: false } as import("../../types").FirewallScanResult;

    if (parcelB) {
      firewallB = this.firewall.scan(parcelB, "ANALYST_B");

      if (firewallB.quarantined) {
        this.totalFirewallRejections++;
        this.dropzone.quarantine(zoneB.zoneId);
        this.circuitBreaker.recordFailure("ANALYST_B", "CONTENT_VIOLATION",
          `Firewall rejected Red parcel: ${firewallB.violations.filter(v => v.severity === "REJECT").map(v => v.type).join(", ")}`);

        this.logToGtc("ADVISORY_FIREWALL_REJECTION", record, {
          analyst: "ANALYST_B",
          violations: firewallB.violations.map(v => ({ type: v.type, detail: v.detail })),
        });

        parcelB = null;
      } else {
        this.circuitBreaker.recordSuccess("ANALYST_B");
        if (parcelB.verdict) this.circuitBreaker.recordVerdict("ANALYST_B", parcelB.verdict);
      }
    }

    // ── Step 8: Enforce minimum duration (anti-timing side-channel) ──
    await this.enforceMinDuration(startTime);

    // ── Step 9: Decision Matrix — Iron Halo judges ──
    const cbStateAfterA = this.circuitBreaker.check("ANALYST_A");
    const cbStateAfterB = this.circuitBreaker.check("ANALYST_B");

    const verdict = this.decisionMatrix.resolve(
      parcelA, parcelB, firewallA, firewallB,
      { a: cbStateAfterA, b: cbStateAfterB },
    );

    console.log(
      `[IRON-HALO] ██ ADVISORY_VERDICT ██ operator=${record.operatorId} ` +
      `action=${verdict.action} blue=${parcelA?.verdict || "N/A"} red=${parcelB?.verdict || "N/A"} ` +
      `cbTripped=${verdict.circuitBreakerTripped} internalOnly=${verdict.internalRulesOnly}`,
    );

    // ── Step 10: Burn everything — one-time use ──
    this.dropzone.destroy(zoneA.zoneId);
    this.dropzone.destroy(zoneB.zoneId);
    this.schemaGenerator.markUsed(strippedData.missionSchema);
    // subjectRef mapping only existed on the stack — already garbage collected

    // ── Step 11: Log to GTC (full audit trail — ALL data, whole picture) ──
    this.logToGtc("ADVISORY_CYCLE_COMPLETE", record, {
      action: verdict.action,
      reasoning: verdict.reasoning,
      blueVerdict: parcelA?.verdict,
      blueConfidence: parcelA?.confidence,
      blueFindings: parcelA?.findings.length,
      blueSelfSharpening: parcelA?.selfSharpening,
      redVerdict: parcelB?.verdict,
      redConfidence: parcelB?.confidence,
      redFindings: parcelB?.findings.length,
      redSelfSharpening: parcelB?.selfSharpening,
      firewallRejectionsA: firewallA.violations.filter(v => v.severity === "REJECT").length,
      firewallRejectionsB: firewallB.violations.filter(v => v.severity === "REJECT").length,
      circuitBreakerTripped: verdict.circuitBreakerTripped,
      internalRulesOnly: verdict.internalRulesOnly,
      mode: this.analyst.getMode(),
      durationMs: Date.now() - startTime,
    });

    // ── Step 12: Record history ──
    this.recordHistory(record, verdict, startTime, parcelA || undefined, parcelB || undefined);

    this.lastRunAt = new Date().toISOString();
    return verdict;
  }

  /**
   * Strip sensitive data from operator report.
   * Generate anonymised subjectRef. Remove wallet addresses, API keys, RPC endpoints.
   * The AIs are adversaries — they see NOTHING about our stack.
   */
  private stripData(
    report: OperatorReturnReport,
    subjectRef: string,
    record: HaloRecord,
  ): StrippedOperatorData {
    // Generate dynamic mission schema — unique per mission, dead after one use
    const schema = this.schemaGenerator.generate(
      record.operatorClass,
      report.missionType,
      record.contaminationLevel,
      {
        missionDurationMs: report.operatorMeta.missionDurationMs,
        pnlUsd: report.result.pnlUsd,
        gasSpentUsd: report.result.gasSpentUsd,
        narrativeLength: report.observations.missionNarrative?.length || 0,
        anomalyCount: report.observations.anomalies?.length || 0,
        chain: report.operatorMeta.chain,
        mempoolCongestion: report.observations.conditions?.mempoolCongestion as string | undefined,
        exchangeCount: report.operatorMeta.exchangesUsed?.length || 0,
      },
    );

    return {
      subjectRef, // Anonymised — NOT the real operatorId
      missionType: report.missionType,
      result: {
        status: report.result.status,
        pnlUsd: report.result.pnlUsd,
        gasSpentUsd: report.result.gasSpentUsd,
        // NO raw token data — stripped
      },
      observations: {
        narrative: report.observations.missionNarrative,
        outsideParams: report.observations.outsideParams || [],
        conditions: report.observations.conditions || {},
        anomalies: report.observations.anomalies || [],
        // NO wallet addresses, NO API keys, NO RPC endpoints
      },
      metrics: {
        missionDurationMs: report.operatorMeta.missionDurationMs,
        chain: report.operatorMeta.chain,
        // Only exchange latency (not exchange names — could fingerprint)
        exchangeLatencyMs: report.observations.conditions?.exchangeLatencyMs,
        slippageObserved: report.observations.conditions?.slippageObserved,
      },
      selfAssessment: report.selfAssessment ? {
        suggestion: report.selfAssessment.improvementSuggestion,
        estimatedImprovement: report.selfAssessment.estimatedImprovementPercent,
      } : undefined,
      missionSchema: schema,
    };
  }

  /**
   * Enforce minimum advisory duration to prevent timing side-channel.
   * Even if both parcels are ready instantly, Iron Halo waits.
   */
  private async enforceMinDuration(startTime: number): Promise<void> {
    const elapsed = Date.now() - startTime;
    if (elapsed < ADVISORY_MIN_DURATION_MS) {
      const waitMs = ADVISORY_MIN_DURATION_MS - elapsed;
      await sleep(waitMs);
    }
  }

  /**
   * Record advisory history for /advisory/history endpoint.
   */
  private recordHistory(
    record: HaloRecord,
    verdict: AdvisoryVerdict,
    startTime: number,
    parcelA?: AdvisoryParcel,
    parcelB?: AdvisoryParcel,
  ): void {
    const durationMs = Date.now() - startTime;
    this.totalAdvisoryMs += durationMs;

    this.advisoryHistory.push({
      operatorId: record.operatorId,
      missionId: record.missionId,
      action: verdict.action,
      reasoning: verdict.reasoning,
      decidedAt: verdict.decidedAt,
      blueVerdict: parcelA?.verdict,
      redVerdict: parcelB?.verdict,
      blueConfidence: parcelA?.confidence,
      redConfidence: parcelB?.confidence,
      blueSelfSharpening: parcelA?.selfSharpening,
      redSelfSharpening: parcelB?.selfSharpening,
      circuitBreakerTripped: verdict.circuitBreakerTripped,
      internalRulesOnly: verdict.internalRulesOnly,
      durationMs,
    });

    if (this.advisoryHistory.length > BlackboardService.MAX_HISTORY) {
      this.advisoryHistory.shift();
    }
  }

  /**
   * Log to GTC — full audit trail. ALL data. The whole picture.
   * Three AIs sharpening every event. Stack learning 100%.
   */
  private logToGtc(
    eventType: string,
    record: HaloRecord,
    payload: Record<string, unknown>,
  ): void {
    fetch(`${GTC_URL}/telemetry/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        source: "genesis-iron-halo-advisory",
        eventId: `${record.id}-advisory`,
        payload: {
          operatorId: record.operatorId,
          missionId: record.missionId,
          operatorClass: record.operatorClass,
          contaminationLevel: record.contaminationLevel,
          ...payload,
        },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      // GTC may be unreachable — never block Iron Halo pipeline
    });
  }

  /**
   * Get blackboard system state.
   */
  getState(): BlackboardState {
    const cbStates = this.circuitBreaker.getAllStates();
    return {
      enabled: true,
      mode: this.analyst.getMode(),
      circuitBreakerA: cbStates.analystA,
      circuitBreakerB: cbStates.analystB,
      totalAdvisoryRuns: this.totalAdvisoryRuns,
      totalParcelAReceived: this.totalParcelAReceived,
      totalParcelBReceived: this.totalParcelBReceived,
      totalFirewallRejections: this.totalFirewallRejections,
      totalCircuitBreakerTrips: this.totalCircuitBreakerTrips,
      totalFallbackToInternal: this.totalFallbackToInternal,
      activeDropZones: this.dropzone.getActiveCount(),
      avgAdvisoryMs: this.totalAdvisoryRuns > 0
        ? Math.round(this.totalAdvisoryMs / this.totalAdvisoryRuns) : 0,
      lastRunAt: this.lastRunAt,
    };
  }

  /**
   * Get advisory history for /advisory/history endpoint.
   */
  getHistory(limit = 50): typeof this.advisoryHistory {
    return this.advisoryHistory.slice(-limit).reverse();
  }

  /**
   * Reset circuit breakers (manual override).
   */
  resetCircuitBreakers(): void {
    this.circuitBreaker.reset("ANALYST_A");
    this.circuitBreaker.reset("ANALYST_B");
    console.log("[IRON-HALO] ADVISORY_CIRCUIT_BREAKERS_RESET — both analysts restored");
  }
}
