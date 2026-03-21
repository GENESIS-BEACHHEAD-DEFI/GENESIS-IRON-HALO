/**
 * GENESIS-IRON-HALO v1.2 — Sandboxed Decontamination Chamber
 *
 * "All returning operators are contaminated by default."
 * "Even a hint of a clone or mistiming — BURN."
 * "We take no prisoners. We protect what we love."
 *
 * THE FIVE-POUND NOTE DOCTRINE:
 * Every operator dispatched receives one half of a cryptographic token.
 * Iron Halo holds the other half. On return, if the halves don't match:
 * IMMEDIATE BURN. No questions. No exceptions.
 *
 * SEVEN OPERATOR CLASSES:
 *   PAYLOAD:         Real operators — real yield, real missions. Self-return → Standard debrief → BURN
 *   RECON:           Self-return → Standard debrief → BURN
 *   CHAOS_REGIMENT:  Self-destructs. Return = impersonator → IMMEDIATE BURN (403)
 *   DEEP_COVER:      Mothership extraction only → Standard debrief → BURN
 *   PHANTOM_STACK:   Mothership phantom ping extraction → KRYPTONITE debrief → BURN
 *   PATSY:           Honeypot — designed to be captured. NEVER returns. If marker appears → ADVERSARY DETECTED
 *   DECOY:           Legacy decoy operators (backwards compat)
 *
 * v1.2: BLACKBOARD ARCHITECTURE — Two external Value Aligned AIs as forensic advisors.
 *   AI-A (Blue Team): Forensic Analyst — records WHY it chose each path
 *   AI-B (Red Team):  Adversarial Reviewer — finds weaknesses in Blue's logic
 *   Iron Halo v1.2:   Judge — reads both parcels, makes verdict
 *
 *   THEY ARE ADVERSARIES. They never hear "Iron Halo". They never enter the core.
 *   Bidirectional anonymity enforced. Dead-drop communication. Parcel firewall.
 *   Circuit breaker. Dynamic per-mission schemas. Steel sharpening steel.
 *
 * Full security pipeline:
 *   0. CLASS CHECK        — CHAOS_REGIMENT/PATSY rejected immediately (403)
 *   1. AI INSPECTION      — Behavioural analysis. Clone detection, timing.
 *   2. HANDSHAKE VERIFY   — Cryptographic five-pound note.
 *   3. QUARANTINE          — Operator isolated, flagged if suspicious.
 *   4. ADVISORY (v1.2)    — Blue Team → Firewall → Red Team → Firewall → Judge
 *   5. DEBRIEF             — Extract intelligence (KRYPTONITE: dynamic questioning).
 *   6. SANITISE            — Strip sensitive data.
 *   7. EXTRACT             — Forward clean intel to GTC/Brighton.
 *   8. BURN                — Operator destroyed. Zero fingerprint. No mission 2.
 *
 * GOLDEN RULE (LAW): ALL operators burned after mission. No exceptions.
 *
 * Network: ISOLATED — cannot reach core systems.
 * Communication: ONE-WAY POST to GTC/Brighton only.
 *
 * Port: 8680
 */

import express from "express";
import { QuarantineService } from "./services/quarantine.service";
import { DebriefService } from "./services/debrief.service";
import { HandshakeService } from "./services/handshake.service";
import { InspectionService } from "./services/inspection.service";
import { BlackboardService } from "./services/advisory/blackboard.service";
import { DropZoneService } from "./services/advisory/dropzone.service";
import { FirewallService } from "./services/advisory/firewall.service";
import { CircuitBreakerService } from "./services/advisory/circuit-breaker.service";
import { SchemaGeneratorService } from "./services/advisory/schema-generator.service";
import { ParcelRendererService } from "./services/advisory/parcel-renderer.service";
import { DecisionMatrixService } from "./services/advisory/decision-matrix.service";
import { SimulationAnalystAdapter } from "./services/advisory/analyst-simulation.adapter";
import { ApiAnalystAdapter } from "./services/advisory/analyst-api.adapter";
import type { IAnalyst } from "./services/advisory/analyst.interface";
import type { OperatorReturnReport, HaloRecord, AdvisoryVerdict } from "./types";

const PORT = parseInt(process.env.PORT || "8680", 10);

const app = express();
app.use(express.json());

const quarantine = new QuarantineService();
const debrief = new DebriefService();
const handshake = new HandshakeService();
const inspection = new InspectionService();

// ── v1.2: Blackboard Architecture — Two adversary AIs as forensic advisors ──
const ADVISORY_ENABLED = process.env.ADVISORY_ENABLED === "true";
const ADVISORY_MODE = process.env.ADVISORY_MODE || "SIMULATION";

const analyst: IAnalyst = ADVISORY_MODE === "API" ? new ApiAnalystAdapter() : new SimulationAnalystAdapter();
const dropzoneService = new DropZoneService();
const firewallService = new FirewallService();
const circuitBreakerService = new CircuitBreakerService();
const schemaGeneratorService = new SchemaGeneratorService();
const parcelRendererService = new ParcelRendererService();
const decisionMatrixService = new DecisionMatrixService();

const blackboard = ADVISORY_ENABLED
  ? new BlackboardService(
      dropzoneService, firewallService, circuitBreakerService,
      schemaGeneratorService, parcelRendererService, decisionMatrixService, analyst,
    )
  : null;

// In-memory store of completed records (last N for /state visibility)
const completedRecords: HaloRecord[] = [];
const MAX_COMPLETED_HISTORY = 500;

// Immediate burns — operators that never made it past inspection/handshake
const burnLog: Array<{
  operatorId: string;
  missionId: string;
  operatorClass?: string;
  reason: string;
  burnedAt: string;
}> = [];
const MAX_BURN_LOG = 500;

// Adversary detection log — PATSY markers that arrived at Iron Halo
// Each entry = the enemy cloned our PATSY and sent it back. We map them.
const adversaryLog: Array<{
  operatorId: string;
  missionId: string;
  patsyMarker: string;
  sourceIp?: string;
  detectedAt: string;
  metadata: Record<string, unknown>;
}> = [];
const MAX_ADVERSARY_LOG = 200;

// In-memory store of return reports (keyed by halo record ID, for debrief)
const reportStore: Map<string, OperatorReturnReport> = new Map();

// Background processing loop
const PROCESS_INTERVAL_MS = parseInt(process.env.HALO_PROCESS_INTERVAL_MS || "2000", 10);
let processTimer: ReturnType<typeof setInterval> | null = null;

// Periodic handshake token purge
const PURGE_INTERVAL_MS = parseInt(process.env.HALO_PURGE_INTERVAL_MS || "300000", 10); // 5 min

async function processNextOperator(): Promise<void> {
  const record = quarantine.getNextForDebrief();
  if (!record) return;

  const report = reportStore.get(record.id);
  if (!report) {
    console.error(`[IRON-HALO] No report found for record ${record.id} — skipping`);
    quarantine.release(record.id);
    return;
  }

  try {
    // ── v1.2: ADVISORY PHASE — Blue Team → Firewall → Red Team → Firewall → Judge ──
    let advisoryVerdict: AdvisoryVerdict | undefined;

    if (ADVISORY_ENABLED && blackboard) {
      record.stage = "ADVISORY";
      record.timestamps.advisoryStarted = new Date().toISOString();

      advisoryVerdict = await blackboard.runAdvisory(record, report);
      record.timestamps.advisoryCompleted = new Date().toISOString();
      record.advisoryVerdict = advisoryVerdict;

      // QUARANTINE_BURN verdict → skip debrief, burn immediately
      if (advisoryVerdict.action === "QUARANTINE_BURN") {
        immediateBurn(
          record.operatorId, record.missionId,
          `ADVISORY_CONTAMINATED: ${advisoryVerdict.reasoning}`,
          record.operatorClass,
        );
        quarantine.release(record.id);
        reportStore.delete(record.id);
        return;
      }
    }

    const processed = await debrief.processOperator(record, report, advisoryVerdict);
    quarantine.advance(record.id, processed);

    completedRecords.push(processed);
    if (completedRecords.length > MAX_COMPLETED_HISTORY) {
      completedRecords.shift();
    }

    quarantine.release(record.id);
    reportStore.delete(record.id);
  } catch (err) {
    console.error(
      `[IRON-HALO] PROCESS_ERROR operator=${record.operatorId}: ` +
      `${err instanceof Error ? err.message : "Unknown"}`,
    );
  }
}

function startProcessing(): void {
  if (processTimer) return;
  processTimer = setInterval(() => processNextOperator(), PROCESS_INTERVAL_MS);
  console.log(`[IRON-HALO] Processing loop started — interval=${PROCESS_INTERVAL_MS}ms`);

  // Periodic purge of expired handshake tokens
  setInterval(() => handshake.purgeExpired(), PURGE_INTERVAL_MS);
}

function immediateBurn(operatorId: string, missionId: string, reason: string, operatorClass?: string): void {
  burnLog.push({
    operatorId,
    missionId,
    operatorClass,
    reason,
    burnedAt: new Date().toISOString(),
  });
  if (burnLog.length > MAX_BURN_LOG) burnLog.shift();

  console.error(
    `[IRON-HALO] ██ IMMEDIATE BURN ██ operator=${operatorId} mission=${missionId} ` +
    `class=${operatorClass || "UNKNOWN"} — ${reason}`,
  );
}

// ── POST /handshake/issue — DARPA issues handshake tokens before dispatch ──
// Called by DARPA/Mothership when deploying an operator. Returns both halves.
app.post("/handshake/issue", (req, res) => {
  const { operatorId, missionId, expiryMs } = req.body;

  if (!operatorId || !missionId) {
    res.status(400).json({ issued: false, reason: "Required: operatorId, missionId" });
    return;
  }

  const tokens = handshake.issue(operatorId, missionId, expiryMs);

  res.status(200).json({
    issued: true,
    operatorId,
    missionId,
    operatorToken: tokens.operatorToken,
    // haloToken stays in Iron Halo — NEVER sent to the operator
    message: "Handshake issued. Give operatorToken to operator. haloToken stays in vault.",
  });
});

// ── POST /return — Operator returns from mission ──
// THE ONLY ENTRY POINT. Full security pipeline runs here.
app.post("/return", (req, res) => {
  const body = req.body;
  const report = body as OperatorReturnReport & { operatorToken?: string };

  // ── Field validation ──
  if (!report.operatorId || !report.missionId || !report.missionType) {
    res.status(400).json({
      accepted: false,
      reason: "Missing required fields: operatorId, missionId, missionType",
    });
    return;
  }

  if (!report.result || !report.result.status) {
    res.status(400).json({ accepted: false, reason: "Missing: result.status" });
    return;
  }

  if (!report.observations || !report.observations.missionNarrative) {
    res.status(400).json({ accepted: false, reason: "Missing: observations.missionNarrative" });
    return;
  }

  if (!report.operatorMeta || typeof report.operatorMeta.missionDurationMs !== "number") {
    res.status(400).json({ accepted: false, reason: "Missing: operatorMeta.missionDurationMs" });
    return;
  }

  // ════════════════════════════════════════════════
  // GATE 0: CHAOS_REGIMENT EARLY REJECTION
  // This class self-destructs. If it's trying to "return" — it's an impersonator.
  // No inspection. No handshake. IMMEDIATE BURN. 403.
  // ════════════════════════════════════════════════
  if (report.operatorClass === "CHAOS_REGIMENT") {
    immediateBurn(
      report.operatorId,
      report.missionId,
      "CHAOS_REGIMENT operators self-destruct. Return = impersonator. IMMEDIATE BURN.",
      "CHAOS_REGIMENT",
    );

    res.status(403).json({
      accepted: false,
      burned: true,
      operatorClass: "CHAOS_REGIMENT",
      reason: "CHAOS_REGIMENT operators self-destruct on mission. This class NEVER returns. " +
        "If you're trying to return — you're an impersonator. BURNED.",
    });
    return;
  }

  // ════════════════════════════════════════════════
  // GATE 0B: PATSY EARLY REJECTION
  // No PATSY ever comes home. They're designed to be captured.
  // If operatorClass explicitly says PATSY — immediate burn.
  // (PATSY marker detection happens in inspection for clones that
  //  don't declare themselves as PATSY but carry the marker.)
  // ════════════════════════════════════════════════
  if (report.operatorClass === "PATSY") {
    immediateBurn(
      report.operatorId,
      report.missionId,
      "PATSY operators are designed to be captured. They never return. IMMEDIATE BURN.",
      "PATSY",
    );

    res.status(403).json({
      accepted: false,
      burned: true,
      operatorClass: "PATSY",
      reason: "PATSY operators are honeypots — designed to be captured and cloned. " +
        "This class NEVER returns. BURNED.",
    });
    return;
  }

  // ════════════════════════════════════════════════
  // GATE 1: AI INSPECTION — Before anything else
  // "Even a hint of a clone or mistiming — BURN"
  // Now class-aware: KRYPTONITE verdict for PHANTOM_STACK
  // ════════════════════════════════════════════════
  const inspectionResult = inspection.inspect(report);

  // ── ADVERSARY_DETECTED: PATSY marker found — enemy cloned our operator ──
  if (inspectionResult.verdict === "ADVERSARY_DETECTED") {
    // Log EVERYTHING about this clone for adversary pipeline mapping
    adversaryLog.push({
      operatorId: report.operatorId,
      missionId: report.missionId,
      patsyMarker: report.patsyMarker || "UNKNOWN",
      detectedAt: new Date().toISOString(),
      metadata: {
        operatorClass: report.operatorClass,
        missionType: report.missionType,
        chain: report.operatorMeta.chain,
        walletAddress: report.operatorMeta.walletAddress,
        missionDurationMs: report.operatorMeta.missionDurationMs,
        narrative: report.observations.missionNarrative,
        inspectionScore: inspectionResult.score,
      },
    });
    if (adversaryLog.length > MAX_ADVERSARY_LOG) adversaryLog.shift();

    immediateBurn(
      report.operatorId,
      report.missionId,
      `ADVERSARY_DETECTED: PATSY marker found. Enemy cloned our operator. Pipeline mapped. BURN the clone.`,
      report.operatorClass,
    );

    // Forward adversary detection to GTC for Brighton analysis
    fetch(`${process.env.GTC_URL || "http://genesis-beachhead-gtc:8650"}/telemetry/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "ADVERSARY_DETECTED_PATSY_CLONE",
        source: "genesis-iron-halo",
        eventId: report.missionId,
        payload: adversaryLog[adversaryLog.length - 1],
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});

    res.status(403).json({
      accepted: false,
      burned: true,
      adversaryDetected: true,
      reason: "ADVERSARY DETECTED — Known PATSY marker found on returning operator. " +
        "Enemy captured and cloned our honeypot. Their pipeline is now being mapped. " +
        "Clone BURNED.",
      inspectionScore: inspectionResult.score,
    });
    return;
  }

  if (inspectionResult.verdict === "CONTAMINATED") {
    immediateBurn(
      report.operatorId,
      report.missionId,
      `AI_INSPECTION: ${inspectionResult.recommendation} Score: ${inspectionResult.score}/100`,
      report.operatorClass,
    );

    res.status(403).json({
      accepted: false,
      burned: true,
      operatorClass: report.operatorClass,
      reason: "CONTAMINATED — AI inspection failed. Operator burned immediately.",
      inspectionScore: inspectionResult.score,
      checks: inspectionResult.checks.filter(c => !c.passed),
    });
    return;
  }

  // ════════════════════════════════════════════════
  // GATE 2: CRYPTOGRAPHIC HANDSHAKE
  // "The Five-Pound Note — if halves don't match, BURN"
  // (Legacy operators without operatorClass skip handshake check
  //  if they also have no token — backwards compat)
  // ════════════════════════════════════════════════
  const operatorToken = body.operatorToken as string;

  if (!operatorToken) {
    immediateBurn(
      report.operatorId,
      report.missionId,
      "NO_HANDSHAKE_TOKEN — Operator returned without cryptographic token.",
      report.operatorClass,
    );

    res.status(403).json({
      accepted: false,
      burned: true,
      reason: "NO_TOKEN — Operator returned without handshake token. Immediate burn.",
    });
    return;
  }

  const handshakeResult = handshake.verify(
    report.operatorId,
    report.missionId,
    operatorToken,
  );

  if (!handshakeResult.valid) {
    immediateBurn(
      report.operatorId,
      report.missionId,
      `HANDSHAKE_FAILED: ${handshakeResult.reason}`,
      report.operatorClass,
    );

    res.status(403).json({
      accepted: false,
      burned: true,
      reason: `HANDSHAKE_FAILED — ${handshakeResult.reason}`,
    });
    return;
  }

  // ════════════════════════════════════════════════
  // GATES PASSED — Admit to quarantine for debrief
  // KRYPTONITE verdict → KRYPTONITE contamination level
  // ════════════════════════════════════════════════
  const contaminationLevel = inspectionResult.verdict === "KRYPTONITE" ? "KRYPTONITE" as const : "STANDARD" as const;
  const record = quarantine.admit(report, contaminationLevel);

  // Apply inspection flag to quarantine record
  if (inspectionResult.verdict === "SUSPICIOUS") {
    record.flagged = true;
    record.flagReason = `AI_SUSPICIOUS: score=${inspectionResult.score}/100 — ${inspectionResult.checks.filter(c => !c.passed).map(c => c.name).join(", ")}`;
  }

  reportStore.set(record.id, report);

  console.log(
    `[IRON-HALO] ADMITTED operator=${report.operatorId} mission=${report.missionId} ` +
    `class=${report.operatorClass || "LEGACY"} haloId=${record.id} ` +
    `handshake=VERIFIED inspection=${inspectionResult.verdict} ` +
    `contamination=${contaminationLevel} score=${inspectionResult.score}/100 flagged=${record.flagged}`,
  );

  res.status(200).json({
    accepted: true,
    haloId: record.id,
    stage: record.stage,
    operatorClass: report.operatorClass || "LEGACY",
    contaminationLevel,
    handshake: "VERIFIED",
    inspection: inspectionResult.verdict,
    inspectionScore: inspectionResult.score,
    flagged: record.flagged,
    flagReason: record.flagReason || null,
    message: inspectionResult.verdict === "KRYPTONITE"
      ? "PHANTOM_STACK operator admitted. KRYPTONITE debrief protocol active."
      : "Operator passed all gates. Admitted to quarantine for debrief.",
  });
});

// ── GET /kryptonite — KRYPTONITE status: all PHANTOM_STACK operators in processing ──
app.get("/kryptonite", (_req, res) => {
  const kryptoniteRecords = quarantine.getKryptoniteRecords();
  const completedKryptonite = completedRecords.filter(r => r.contaminationLevel === "KRYPTONITE");
  const inspectionStats = inspection.getStats();

  res.json({
    protocol: "KRYPTONITE",
    description: "PHANTOM_STACK debrief protocol — dynamic questioning, cross-validation, strict sanitise, UNVERIFIED tags",
    active: kryptoniteRecords.map(r => ({
      haloId: r.id,
      operatorId: r.operatorId,
      missionId: r.missionId,
      stage: r.stage,
      quarantinedAt: r.timestamps.quarantined,
      extractedByMothership: r.extractedByMothership,
    })),
    recentCompleted: completedKryptonite.slice(-20).reverse().map(r => ({
      haloId: r.id,
      operatorId: r.operatorId,
      missionId: r.missionId,
      processingMs: r.processingMs,
      unverified: r.extractedIntel?.unverified,
      crossValidationTags: r.extractedIntel?.crossValidationTags,
      timestamps: r.timestamps,
    })),
    stats: {
      totalKryptoniteInspected: inspectionStats.totalKryptonite,
      activeInQuarantine: kryptoniteRecords.length,
      totalCompleted: completedKryptonite.length,
    },
  });
});

// ── POST /patsy/register — Mothership registers a PATSY marker with Iron Halo ──
// Called when Mothership deploys a PATSY. Iron Halo stores the marker so it can
// detect if the enemy clones the PATSY and sends it back.
app.post("/patsy/register", (req, res) => {
  const { marker } = req.body;
  if (!marker) {
    res.status(400).json({ registered: false, reason: "Required: marker" });
    return;
  }
  inspection.registerPatsyMarker(marker);
  console.log(`[IRON-HALO] PATSY_MARKER_REGISTERED marker=${marker.slice(0, 16)}...`);
  res.status(200).json({ registered: true, message: "PATSY marker registered. Adversary detection armed." });
});

// ── GET /adversary — Adversary detection log: PATSY clones that arrived ──
app.get("/adversary", (_req, res) => {
  const inspectionStats = inspection.getStats();

  res.json({
    protocol: "ADVERSARY_MAPPING",
    description: "PATSY honeypot clones detected at Iron Halo. Each entry = enemy captured and cloned our operator.",
    totalDetected: inspectionStats.totalAdversaryDetected,
    knownPatsyMarkers: inspectionStats.knownPatsyMarkers,
    recentDetections: adversaryLog.slice(-50).reverse(),
    message: inspectionStats.totalAdversaryDetected > 0
      ? `██ ${inspectionStats.totalAdversaryDetected} adversary clone(s) detected. Their pipeline is being mapped. They think they are winning.`
      : "No adversary clones detected yet. PATSYs deployed and waiting to be captured.",
  });
});

// ── GET /health ──
app.get("/health", (_req, res) => {
  const debriefStats = debrief.getStats();
  const handshakeStats = handshake.getStats();
  const inspectionStats = inspection.getStats();

  res.json({
    service: "genesis-iron-halo",
    version: "1.2",
    status: quarantine.getQueueSize() > 50 ? "AMBER" : "GREEN",
    role: "SANDBOXED_DECONTAMINATION_CHAMBER",
    doctrine: "Contaminated by default. Five-pound note doctrine. We protect what we love.",
    operatorClasses: ["PAYLOAD", "DECOY", "RECON", "CHAOS_REGIMENT", "DEEP_COVER", "PHANTOM_STACK", "PATSY"],
    security: {
      handshake: handshakeStats,
      inspection: inspectionStats,
      immediateBurns: burnLog.length,
    },
    quarantine: {
      queueSize: quarantine.getQueueSize(),
      inQuarantine: quarantine.getQuarantineCount(),
      kryptoniteActive: quarantine.getKryptoniteRecords().length,
      flagged: quarantine.getFlaggedCount(),
    },
    debrief: debriefStats,
    advisory: ADVISORY_ENABLED && blackboard
      ? {
          enabled: true,
          mode: ADVISORY_MODE,
          state: blackboard.getState(),
        }
      : { enabled: false },
    completedHistory: completedRecords.length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── GET /state — Full Iron Halo state ──
app.get("/state", (_req, res) => {
  const debriefStats = debrief.getStats();
  const handshakeStats = handshake.getStats();
  const inspectionStats = inspection.getStats();
  const allInQueue = quarantine.getAll();

  res.json({
    security: {
      handshake: handshakeStats,
      inspection: inspectionStats,
      recentBurns: burnLog.slice(-20).reverse(),
    },
    quarantine: {
      queue: allInQueue.map(r => ({
        haloId: r.id,
        operatorId: r.operatorId,
        missionId: r.missionId,
        missionType: r.missionType,
        operatorClass: r.operatorClass,
        contaminationLevel: r.contaminationLevel,
        stage: r.stage,
        flagged: r.flagged,
        flagReason: r.flagReason,
        quarantinedAt: r.timestamps.quarantined,
      })),
      queueSize: allInQueue.length,
    },
    debrief: debriefStats,
    recentCompleted: completedRecords.slice(-20).reverse().map(r => ({
      haloId: r.id,
      operatorId: r.operatorId,
      missionId: r.missionId,
      missionType: r.missionType,
      operatorClass: r.operatorClass,
      contaminationLevel: r.contaminationLevel,
      stage: r.stage,
      flagged: r.flagged,
      processingMs: r.processingMs,
      pnlUsd: r.extractedIntel?.result.pnlUsd,
      unverified: r.extractedIntel?.unverified,
      timestamps: r.timestamps,
    })),
    totalProcessed: completedRecords.length,
    timestamp: new Date().toISOString(),
  });
});

// ── GET /record/:id ──
app.get("/record/:id", (req, res) => {
  const id = req.params.id;
  const inQueue = quarantine.get(id);
  if (inQueue) { res.json({ found: true, location: "quarantine", record: inQueue }); return; }
  const completed = completedRecords.find(r => r.id === id);
  if (completed) { res.json({ found: true, location: "completed", record: completed }); return; }
  res.status(404).json({ found: false, id });
});

// ── GET /flagged ──
app.get("/flagged", (_req, res) => {
  const flaggedInQueue = quarantine.getAll().filter(r => r.flagged);
  const flaggedCompleted = completedRecords.filter(r => r.flagged);

  res.json({
    inQuarantine: flaggedInQueue.map(r => ({
      haloId: r.id, operatorId: r.operatorId, missionId: r.missionId,
      operatorClass: r.operatorClass, reason: r.flagReason, stage: r.stage,
    })),
    completed: flaggedCompleted.slice(-50).map(r => ({
      haloId: r.id, operatorId: r.operatorId, missionId: r.missionId,
      operatorClass: r.operatorClass, reason: r.flagReason, pnlUsd: r.extractedIntel?.result.pnlUsd,
    })),
    totalFlagged: quarantine.getFlaggedCount(),
  });
});

// ── GET /burns — Immediate burn log ──
app.get("/burns", (_req, res) => {
  res.json({
    totalBurns: burnLog.length,
    recentBurns: burnLog.slice(-50).reverse(),
    inspectionStats: inspection.getStats(),
    handshakeStats: handshake.getStats(),
  });
});

// ════════════════════════════════════════════════
// v1.2: BLACKBOARD ARCHITECTURE ENDPOINTS
// ════════════════════════════════════════════════

// ── GET /advisory/state — Blackboard system state ──
app.get("/advisory/state", (_req, res) => {
  if (!ADVISORY_ENABLED || !blackboard) {
    res.json({
      enabled: false,
      message: "Blackboard Architecture disabled. Set ADVISORY_ENABLED=true to enable.",
    });
    return;
  }

  const state = blackboard.getState();
  const firewallStats = firewallService.getStats();
  const dropzoneStats = dropzoneService.getStats();
  const matrixStats = decisionMatrixService.getStats();
  const schemaStats = schemaGeneratorService.getStats();

  res.json({
    ...state,
    firewall: firewallStats,
    dropzones: dropzoneStats,
    decisionMatrix: matrixStats,
    schemas: schemaStats,
    message: `Blackboard Architecture ACTIVE. Mode: ${state.mode}. ` +
      `Two adversary AIs. Bidirectional anonymity. Iron Halo judges. ` +
      `Steel sharpening steel — three AIs, all data captured, full picture.`,
  });
});

// ── GET /advisory/history — Recent advisory verdicts ──
app.get("/advisory/history", (req, res) => {
  if (!ADVISORY_ENABLED || !blackboard) {
    res.json({ enabled: false, history: [] });
    return;
  }

  const limit = parseInt(req.query.limit as string || "50", 10);
  res.json({
    enabled: true,
    history: blackboard.getHistory(limit),
    message: "Full advisory history — Blue+Red verdicts, self-sharpening, circuit breaker state.",
  });
});

// ── POST /advisory/reset — Reset circuit breakers (manual override) ──
app.post("/advisory/reset", (_req, res) => {
  if (!ADVISORY_ENABLED || !blackboard) {
    res.status(400).json({ reset: false, reason: "Advisory system not enabled" });
    return;
  }

  blackboard.resetCircuitBreakers();

  res.json({
    reset: true,
    message: "Both analyst circuit breakers reset to CLOSED. Adversary AIs restored.",
    state: blackboard.getState(),
  });
});

// ── GET /advisory/firewall — Recent firewall violations ──
app.get("/advisory/firewall", (req, res) => {
  const limit = parseInt(req.query.limit as string || "50", 10);
  res.json({
    enabled: ADVISORY_ENABLED,
    stats: firewallService.getStats(),
    recentViolations: firewallService.getRecentViolations(limit),
    message: "Parcel firewall — 7 rules, content inspection before delivery.",
  });
});

// ════════════════════════════════════════════════
// RED TEAM INTEGRATION — Receives decontaminated attack reports
// from Red Aggressor Force via Blackboard protocol.
// Treated as KRYPTONITE — logged to GTC, danger alerts forwarded.
// ════════════════════════════════════════════════

app.post("/red-team/ingest", (req, res) => {
  const body = req.body;

  if (!body || !body.campaignId) {
    res.status(400).json({ accepted: false, reason: "Required: campaignId" });
    return;
  }

  // Log to GTC as RED_TEAM_REPORT event
  const GTC_URL_RT = process.env.GTC_URL || "http://genesis-beachhead-gtc:8650";
  fetch(`${GTC_URL_RT}/telemetry/append`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "RED_TEAM_REPORT",
      source: "genesis-iron-halo-red-team",
      eventId: `red-team-${body.campaignId}`,
      payload: {
        campaignId: body.campaignId,
        type: body.type,
        dangerLevel: body.dangerLevel,
        findingCount: body.findings?.length || 0,
        scoreCount: body.scores?.length || 0,
        completedAt: body.completedAt,
      },
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});

  // If danger detected → additional alert event
  if (body.dangerLevel === "DANGER_HIGH" || body.dangerLevel === "DANGER_MEDIUM") {
    fetch(`${GTC_URL_RT}/telemetry/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "RED_TEAM_DANGER_ALERT",
        source: "genesis-iron-halo-red-team",
        eventId: `red-team-danger-${body.campaignId}`,
        payload: {
          campaignId: body.campaignId,
          dangerLevel: body.dangerLevel,
          findings: body.findings,
        },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});

    console.error(
      `[IRON-HALO] ██ RED TEAM DANGER ██ campaign=${body.campaignId} ` +
      `level=${body.dangerLevel} findings=${body.findings?.length || 0}`,
    );
  }

  console.log(
    `[IRON-HALO] RED_TEAM_REPORT_RECEIVED campaign=${body.campaignId} ` +
    `type=${body.type} danger=${body.dangerLevel}`,
  );

  res.status(200).json({
    accepted: true,
    campaignId: body.campaignId,
    message: "Red team report received and logged. KRYPTONITE handling applied.",
  });
});

// ── Start ──
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[IRON-HALO] Genesis Iron Halo v1.2 listening on port ${PORT}`);
  console.log(`[IRON-HALO] Role: SANDBOXED_DECONTAMINATION_CHAMBER`);
  console.log(`[IRON-HALO] Network: ISOLATED — cannot reach core systems`);
  console.log(`[IRON-HALO] Security: HANDSHAKE (five-pound note) + AI INSPECTION (clone/timing)`);
  console.log(`[IRON-HALO] Operator Classes: PAYLOAD | DECOY | RECON | CHAOS_REGIMENT | DEEP_COVER | PHANTOM_STACK | PATSY`);
  console.log(`[IRON-HALO] CHAOS_REGIMENT: 403 immediate burn on return (self-destruct class)`);
  console.log(`[IRON-HALO] PHANTOM_STACK: KRYPTONITE debrief protocol (dynamic questioning)`);
  console.log(`[IRON-HALO] PATSY: Honeypot adversary mapping — marker detection = enemy pipeline exposed`);
  console.log(`[IRON-HALO] PAYLOAD: Real operators, real yield — standard debrief pipeline`);
  if (ADVISORY_ENABLED) {
    console.log(`[IRON-HALO] ██ BLACKBOARD ARCHITECTURE v1.2 ACTIVE ██`);
    console.log(`[IRON-HALO] Mode: ${ADVISORY_MODE} — Two adversary AIs as forensic advisors`);
    console.log(`[IRON-HALO] AI-A (Blue Team): Forensic Analyst — records WHY it chose each path`);
    console.log(`[IRON-HALO] AI-B (Red Team): Adversarial Reviewer — attacks Blue's logic`);
    console.log(`[IRON-HALO] They are ADVERSARIES. They never hear "Iron Halo". Bidirectional anonymity.`);
    console.log(`[IRON-HALO] Parcel Firewall: 7 rules. Circuit Breaker: per-analyst. Dead-Drop: one-way.`);
    console.log(`[IRON-HALO] Self-sharpening: Steel sharpening steel — three AIs, all data, full picture.`);
    console.log(`[IRON-HALO] Pipeline: CLASS_CHECK → INSPECT → HANDSHAKE → QUARANTINE → ADVISORY → DEBRIEF → SANITISE → EXTRACT → BURN`);
  } else {
    console.log(`[IRON-HALO] Advisory: DISABLED (set ADVISORY_ENABLED=true to activate Blackboard Architecture)`);
    console.log(`[IRON-HALO] Pipeline: CLASS_CHECK → INSPECT → HANDSHAKE → QUARANTINE → DEBRIEF → SANITISE → EXTRACT → BURN`);
  }
  console.log(`[IRON-HALO] GOLDEN RULE: ALL operators burned. No mission 2. No exceptions.`);

  startProcessing();
});
