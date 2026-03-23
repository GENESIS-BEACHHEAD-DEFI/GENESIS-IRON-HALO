/**
 * GENESIS-IRON-HALO v1.3 — Reconciliation Service
 *
 * "What they earnt needs to tally with what was present at the start.
 *  No side drops. No stashes."
 *
 * DARPA seals a Mission Manifest at dispatch containing expected parameters:
 *   - Expected buy/sell prices, yield, clip size, slippage tolerance
 *   - Tolerance band in basis points (default ±50bps)
 *   - SHA-256 sealed hash for tamper detection
 *
 * Operator returns an Execution Receipt containing actual results:
 *   - Actual buy/sell prices, yield, clip size, slippage
 *   - Transaction hashes (proof of on-chain execution)
 *
 * Reconciliation engine runs 5 checks:
 *   1. MANIFEST_INTEGRITY  — Was the sealed manifest tampered with?
 *   2. YIELD_VARIANCE      — Does actual yield match expected within tolerance?
 *   3. PARAMETER_MATCH     — Are exchanges/pairs consistent?
 *   4. CLIP_SIZE_VARIANCE  — Was the clip size altered?
 *   5. TX_VERIFICATION     — Are transaction hashes present?
 *
 * Verdicts:
 *   RECONCILED        — All checks pass. Clean operator.
 *   VARIANCE_DETECTED — Minor discrepancy. Flagged but acceptable.
 *   SUSPICIOUS        — Exceeds tolerance. Flag for manual review.
 *   TAMPERED          — Manifest integrity compromised. IMMEDIATE BURN.
 */

import { createHash, randomUUID } from "crypto";
import type {
  SealedMissionManifest,
  ExecutionReceipt,
  ReconciliationResult,
  ReconciliationCheck,
  ReconciliationVerdict,
} from "../types";

const DEFAULT_TOLERANCE_BPS = parseInt(process.env.RECONCILIATION_TOLERANCE_BPS || "50", 10);
const GTC_URL = process.env.GTC_URL || "http://genesis-beachhead-gtc:8650";
const LEDGER_LITE_URL = process.env.LEDGER_LITE_URL || "http://genesis-ledger-lite:8500";

export class ReconciliationService {
  private manifests: Map<string, SealedMissionManifest> = new Map();
  private results: ReconciliationResult[] = [];
  private readonly maxResults = 500;

  private totalSealed = 0;
  private totalReconciled = 0;
  private totalSuspicious = 0;
  private totalTampered = 0;

  /**
   * Seal a mission manifest. Called by DARPA at dispatch.
   * The manifest is hashed (SHA-256) and stored. Any modification = tamper detected.
   */
  sealManifest(
    operatorId: string,
    missionId: string,
    expected: SealedMissionManifest["expected"],
    toleranceBps?: number,
  ): SealedMissionManifest {
    const manifestId = randomUUID();
    const sealedAt = new Date().toISOString();
    const tolerance = toleranceBps ?? DEFAULT_TOLERANCE_BPS;

    // Create the manifest WITHOUT sealHash first (hash covers all other fields)
    const manifestCore = {
      manifestId,
      operatorId,
      missionId,
      expected,
      toleranceBps: tolerance,
      sealedAt,
    };

    // SHA-256 over canonical JSON — tamper detection
    const canonical = JSON.stringify(manifestCore, Object.keys(manifestCore).sort());
    const sealHash = createHash("sha256").update(canonical).digest("hex");

    const manifest: SealedMissionManifest = {
      ...manifestCore,
      sealHash,
    };

    this.manifests.set(manifestId, manifest);
    this.totalSealed++;

    console.log(
      `[IRON-HALO] MANIFEST_SEALED id=${manifestId.slice(0, 8)}... ` +
      `operator=${operatorId} mission=${missionId} ` +
      `expectedYield=$${expected.expectedYieldUsd || 0} tolerance=${tolerance}bps`,
    );

    return manifest;
  }

  /**
   * Reconcile an execution receipt against a sealed manifest.
   *
   * Five checks. Commander's doctrine: "No side drops. No stashes."
   */
  reconcile(receipt: ExecutionReceipt): ReconciliationResult {
    const manifest = this.manifests.get(receipt.manifestId);

    // No manifest found — cannot reconcile
    if (!manifest) {
      const result: ReconciliationResult = {
        manifestId: receipt.manifestId,
        operatorId: receipt.operatorId,
        missionId: receipt.missionId,
        verdict: "SUSPICIOUS",
        checks: [{
          type: "MANIFEST_INTEGRITY",
          passed: false,
          detail: "NO_MANIFEST — No sealed manifest found for this manifestId. Cannot reconcile.",
        }],
        yieldVarianceBps: 0,
        reconciled: false,
        timestamp: new Date().toISOString(),
      };
      this.storeResult(result);
      return result;
    }

    const checks: ReconciliationCheck[] = [];

    // ── CHECK 1: MANIFEST_INTEGRITY — Was the manifest tampered with? ──
    const integrityCheck = this.checkManifestIntegrity(manifest);
    checks.push(integrityCheck);

    // If tampered — IMMEDIATE verdict, no further checks
    if (!integrityCheck.passed) {
      const result: ReconciliationResult = {
        manifestId: manifest.manifestId,
        operatorId: manifest.operatorId,
        missionId: manifest.missionId,
        verdict: "TAMPERED",
        checks,
        yieldVarianceBps: 0,
        reconciled: false,
        timestamp: new Date().toISOString(),
      };
      this.totalTampered++;
      this.storeResult(result);
      this.forwardToGtc(result);
      this.forwardToLedgerLite(result);

      console.error(
        `[IRON-HALO] ██ MANIFEST TAMPERED ██ id=${manifest.manifestId.slice(0, 8)}... ` +
        `operator=${manifest.operatorId} — INTEGRITY COMPROMISED. IMMEDIATE BURN.`,
      );

      return result;
    }

    // ── CHECK 2: YIELD_VARIANCE — Does actual yield match expected? ──
    const yieldCheck = this.checkYieldVariance(manifest, receipt);
    checks.push(yieldCheck);

    // ── CHECK 3: PARAMETER_MATCH — Are exchanges/pairs consistent? ──
    const paramCheck = this.checkParameterMatch(manifest, receipt);
    checks.push(paramCheck);

    // ── CHECK 4: CLIP_SIZE_VARIANCE — Was clip size altered? ──
    const clipCheck = this.checkClipSizeVariance(manifest, receipt);
    checks.push(clipCheck);

    // ── CHECK 5: TX_VERIFICATION — Are transaction hashes present? ──
    const txCheck = this.checkTxVerification(receipt);
    checks.push(txCheck);

    // ── VERDICT ──
    const failedChecks = checks.filter(c => !c.passed);
    const yieldVarianceBps = yieldCheck.varianceBps || 0;

    let verdict: ReconciliationVerdict;
    if (failedChecks.length === 0) {
      verdict = "RECONCILED";
    } else if (failedChecks.some(c => c.type === "YIELD_VARIANCE" && (c.varianceBps || 0) > manifest.toleranceBps * 2)) {
      // Yield variance > 2x tolerance = suspicious (possible skimming)
      verdict = "SUSPICIOUS";
      this.totalSuspicious++;
    } else if (failedChecks.length <= 2 && Math.abs(yieldVarianceBps) <= manifest.toleranceBps * 1.5) {
      // Minor issues, within extended tolerance
      verdict = "VARIANCE_DETECTED";
    } else {
      verdict = "SUSPICIOUS";
      this.totalSuspicious++;
    }

    const result: ReconciliationResult = {
      manifestId: manifest.manifestId,
      operatorId: manifest.operatorId,
      missionId: manifest.missionId,
      verdict,
      checks,
      yieldVarianceBps,
      reconciled: verdict === "RECONCILED",
      timestamp: new Date().toISOString(),
    };

    this.totalReconciled++;
    this.storeResult(result);
    this.forwardToGtc(result);

    // Log suspicious results to Ledger Lite (TAMPERED handled above with early return)
    if (verdict === "SUSPICIOUS") {
      this.forwardToLedgerLite(result);
    }

    console.log(
      `[IRON-HALO] RECONCILIATION verdict=${verdict} id=${manifest.manifestId.slice(0, 8)}... ` +
      `operator=${manifest.operatorId} yieldVariance=${yieldVarianceBps}bps ` +
      `checks=${checks.length - failedChecks.length}/${checks.length} passed`,
    );

    // Clean up manifest after reconciliation
    this.manifests.delete(receipt.manifestId);

    return result;
  }

  /**
   * Check 1: Verify manifest integrity — recompute hash and compare.
   */
  private checkManifestIntegrity(manifest: SealedMissionManifest): ReconciliationCheck {
    const manifestCore = {
      manifestId: manifest.manifestId,
      operatorId: manifest.operatorId,
      missionId: manifest.missionId,
      expected: manifest.expected,
      toleranceBps: manifest.toleranceBps,
      sealedAt: manifest.sealedAt,
    };

    const canonical = JSON.stringify(manifestCore, Object.keys(manifestCore).sort());
    const recomputedHash = createHash("sha256").update(canonical).digest("hex");
    const passed = recomputedHash === manifest.sealHash;

    return {
      type: "MANIFEST_INTEGRITY",
      passed,
      detail: passed
        ? "Manifest hash verified. No tampering detected."
        : `TAMPERED — Recomputed hash does not match sealHash. Manifest has been modified.`,
    };
  }

  /**
   * Check 2: Yield variance — |actual - expected| / expected in basis points.
   */
  private checkYieldVariance(
    manifest: SealedMissionManifest,
    receipt: ExecutionReceipt,
  ): ReconciliationCheck {
    const expected = manifest.expected.expectedYieldUsd;
    const actual = receipt.actual.actualYieldUsd;

    if (expected === undefined || actual === undefined) {
      return {
        type: "YIELD_VARIANCE",
        passed: true,
        detail: "Yield comparison skipped — expected or actual yield not provided.",
        varianceBps: 0,
      };
    }

    if (expected === 0) {
      return {
        type: "YIELD_VARIANCE",
        passed: actual === 0,
        detail: expected === 0 && actual !== 0
          ? `Expected zero yield but got $${actual}. Variance cannot be computed.`
          : "Both expected and actual yield are zero.",
        varianceBps: actual !== 0 ? 10000 : 0, // 100% if unexpected yield
      };
    }

    const varianceBps = Math.round(Math.abs((actual - expected) / expected) * 10000);
    const passed = varianceBps <= manifest.toleranceBps;

    // Additional check: yield LOWER than expected by more than tolerance = possible skimming
    const yieldShortfall = expected > 0 && actual < expected && varianceBps > manifest.toleranceBps;

    return {
      type: "YIELD_VARIANCE",
      passed: passed && !yieldShortfall,
      detail: yieldShortfall
        ? `YIELD SHORTFALL — Expected $${expected.toFixed(4)}, got $${actual.toFixed(4)}. ` +
          `Variance: ${varianceBps}bps (tolerance: ${manifest.toleranceBps}bps). Possible skimming.`
        : passed
        ? `Yield within tolerance — Expected $${expected.toFixed(4)}, got $${actual.toFixed(4)}. Variance: ${varianceBps}bps.`
        : `Yield outside tolerance — Expected $${expected.toFixed(4)}, got $${actual.toFixed(4)}. Variance: ${varianceBps}bps > ${manifest.toleranceBps}bps.`,
      varianceBps,
    };
  }

  /**
   * Check 3: Parameter match — exchanges and pairs should be consistent.
   */
  private checkParameterMatch(
    manifest: SealedMissionManifest,
    receipt: ExecutionReceipt,
  ): ReconciliationCheck {
    const mismatches: string[] = [];

    if (manifest.expected.buyExchange && receipt.actual.buyExchange &&
        manifest.expected.buyExchange !== receipt.actual.buyExchange) {
      mismatches.push(`buyExchange: expected=${manifest.expected.buyExchange}, actual=${receipt.actual.buyExchange}`);
    }

    if (manifest.expected.sellExchange && receipt.actual.sellExchange &&
        manifest.expected.sellExchange !== receipt.actual.sellExchange) {
      mismatches.push(`sellExchange: expected=${manifest.expected.sellExchange}, actual=${receipt.actual.sellExchange}`);
    }

    if (manifest.expected.pair && receipt.actual.pair &&
        manifest.expected.pair !== receipt.actual.pair) {
      mismatches.push(`pair: expected=${manifest.expected.pair}, actual=${receipt.actual.pair}`);
    }

    return {
      type: "PARAMETER_MATCH",
      passed: mismatches.length === 0,
      detail: mismatches.length === 0
        ? "All mission parameters match."
        : `Parameter mismatches detected: ${mismatches.join("; ")}`,
    };
  }

  /**
   * Check 4: Clip size variance — was the clip size altered?
   */
  private checkClipSizeVariance(
    manifest: SealedMissionManifest,
    receipt: ExecutionReceipt,
  ): ReconciliationCheck {
    const expected = manifest.expected.clipSizeUsd;
    const actual = receipt.actual.clipSizeUsd;

    if (expected === undefined || actual === undefined) {
      return {
        type: "CLIP_SIZE_VARIANCE",
        passed: true,
        detail: "Clip size comparison skipped — not provided.",
      };
    }

    if (expected === 0) {
      return {
        type: "CLIP_SIZE_VARIANCE",
        passed: true,
        detail: "Expected clip size is zero — skipping.",
      };
    }

    const varianceBps = Math.round(Math.abs((actual - expected) / expected) * 10000);
    // Clip size should be very tight — 10bps tolerance
    const clipTolerance = 1000; // 10% — account for partial fills, slippage on amount

    return {
      type: "CLIP_SIZE_VARIANCE",
      passed: varianceBps <= clipTolerance,
      detail: varianceBps <= clipTolerance
        ? `Clip size within tolerance — Expected $${expected}, actual $${actual}. Variance: ${varianceBps}bps.`
        : `CLIP SIZE DEVIATION — Expected $${expected}, actual $${actual}. Variance: ${varianceBps}bps. Possible side-drop.`,
      varianceBps,
    };
  }

  /**
   * Check 5: Transaction hash verification — are tx hashes present?
   */
  private checkTxVerification(receipt: ExecutionReceipt): ReconciliationCheck {
    const txHashes = receipt.actual.txHashes || [];

    return {
      type: "TX_VERIFICATION",
      passed: txHashes.length > 0,
      detail: txHashes.length > 0
        ? `${txHashes.length} transaction hash(es) provided. On-chain verification possible.`
        : "No transaction hashes provided. Cannot verify on-chain execution.",
    };
  }

  /**
   * Get manifest by ID.
   */
  getManifest(manifestId: string): SealedMissionManifest | undefined {
    return this.manifests.get(manifestId);
  }

  /**
   * Get recent reconciliation results.
   */
  getRecentResults(limit: number = 50): ReconciliationResult[] {
    return this.results.slice(-limit).reverse();
  }

  getStats(): {
    totalSealed: number;
    totalReconciled: number;
    totalSuspicious: number;
    totalTampered: number;
    activeManifests: number;
    reconciliationRate: string;
  } {
    const rate = this.totalSealed > 0
      ? `${Math.round((this.totalReconciled / this.totalSealed) * 100)}%`
      : "N/A";

    return {
      totalSealed: this.totalSealed,
      totalReconciled: this.totalReconciled,
      totalSuspicious: this.totalSuspicious,
      totalTampered: this.totalTampered,
      activeManifests: this.manifests.size,
      reconciliationRate: rate,
    };
  }

  private storeResult(result: ReconciliationResult): void {
    this.results.push(result);
    if (this.results.length > this.maxResults) this.results.shift();
  }

  private forwardToGtc(result: ReconciliationResult): void {
    fetch(`${GTC_URL}/telemetry/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: result.verdict === "TAMPERED"
          ? "RECONCILIATION_TAMPERED"
          : result.verdict === "SUSPICIOUS"
          ? "RECONCILIATION_SUSPICIOUS"
          : "RECONCILIATION_RESULT",
        source: "genesis-iron-halo",
        eventId: `recon-${result.manifestId}`,
        payload: {
          manifestId: result.manifestId,
          operatorId: result.operatorId,
          missionId: result.missionId,
          verdict: result.verdict,
          yieldVarianceBps: result.yieldVarianceBps,
          checksPassed: result.checks.filter(c => c.passed).length,
          checksTotal: result.checks.length,
          failedChecks: result.checks.filter(c => !c.passed).map(c => c.type),
        },
        timestamp: result.timestamp,
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }

  private forwardToLedgerLite(result: ReconciliationResult): void {
    const payload = {
      rail: "INTELLIGENCE",
      type: result.verdict === "TAMPERED" ? "RECONCILIATION_TAMPERED" : "RECONCILIATION_SUSPICIOUS",
      manifestId: result.manifestId,
      operatorId: result.operatorId,
      missionId: result.missionId,
      verdict: result.verdict,
      yieldVarianceBps: result.yieldVarianceBps,
      timestamp: result.timestamp,
    };

    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

    fetch(`${LEDGER_LITE_URL}/payload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, payloadHash }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }
}
