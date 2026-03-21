/**
 * GENESIS-IRON-HALO — Sandboxed Decontamination Chamber
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
 * Full security pipeline:
 *   1. AI INSPECTION      — Behavioural analysis before anything else.
 *                           Clone detection, timing analysis, data consistency.
 *                           CONTAMINATED verdict = immediate burn, no debrief.
 *   2. HANDSHAKE VERIFY   — Cryptographic challenge-response.
 *                           Five-pound note must match. Replay = burn.
 *   3. QUARANTINE          — Operator isolated, validated, flagged if suspicious.
 *   4. DEBRIEF             — Extract all intelligence.
 *   5. SANITISE            — Strip sensitive data.
 *   6. EXTRACT             — Forward clean intel to GTC/Brighton.
 *   7. BURN                — Operator destroyed. Zero fingerprint. No reuse.
 *
 * Intel never dies. Operator is disposable. Knowledge is immortal.
 * Nothing gets past Iron Halo unless we want it to.
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
import type { OperatorReturnReport, HaloRecord } from "./types";

const PORT = parseInt(process.env.PORT || "8680", 10);

const app = express();
app.use(express.json());

const quarantine = new QuarantineService();
const debrief = new DebriefService();
const handshake = new HandshakeService();
const inspection = new InspectionService();

// In-memory store of completed records (last N for /state visibility)
const completedRecords: HaloRecord[] = [];
const MAX_COMPLETED_HISTORY = 500;

// Immediate burns — operators that never made it past inspection/handshake
const burnLog: Array<{
  operatorId: string;
  missionId: string;
  reason: string;
  burnedAt: string;
}> = [];
const MAX_BURN_LOG = 500;

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
    const processed = await debrief.processOperator(record, report);
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

function immediateBurn(operatorId: string, missionId: string, reason: string): void {
  burnLog.push({
    operatorId,
    missionId,
    reason,
    burnedAt: new Date().toISOString(),
  });
  if (burnLog.length > MAX_BURN_LOG) burnLog.shift();

  console.error(
    `[IRON-HALO] ██ IMMEDIATE BURN ██ operator=${operatorId} mission=${missionId} — ${reason}`,
  );
}

// ── POST /handshake/issue — DARPA issues handshake tokens before dispatch ──
// Called by DARPA when deploying an operator. Returns both halves.
app.post("/handshake/issue", (req, res) => {
  const { operatorId, missionId } = req.body;

  if (!operatorId || !missionId) {
    res.status(400).json({ issued: false, reason: "Required: operatorId, missionId" });
    return;
  }

  const tokens = handshake.issue(operatorId, missionId);

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
  // GATE 1: AI INSPECTION — Before anything else
  // "Even a hint of a clone or mistiming — BURN"
  // ════════════════════════════════════════════════
  const inspectionResult = inspection.inspect(report);

  if (inspectionResult.verdict === "CONTAMINATED") {
    immediateBurn(
      report.operatorId,
      report.missionId,
      `AI_INSPECTION: ${inspectionResult.recommendation} Score: ${inspectionResult.score}/100`,
    );

    res.status(403).json({
      accepted: false,
      burned: true,
      reason: "CONTAMINATED — AI inspection failed. Operator burned immediately.",
      inspectionScore: inspectionResult.score,
      checks: inspectionResult.checks.filter(c => !c.passed),
    });
    return;
  }

  // ════════════════════════════════════════════════
  // GATE 2: CRYPTOGRAPHIC HANDSHAKE
  // "The Five-Pound Note — if halves don't match, BURN"
  // ════════════════════════════════════════════════
  const operatorToken = body.operatorToken as string;

  if (!operatorToken) {
    immediateBurn(
      report.operatorId,
      report.missionId,
      "NO_HANDSHAKE_TOKEN — Operator returned without cryptographic token.",
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
  // ════════════════════════════════════════════════
  const record = quarantine.admit(report);

  // Apply inspection flag to quarantine record
  if (inspectionResult.verdict === "SUSPICIOUS") {
    record.flagged = true;
    record.flagReason = `AI_SUSPICIOUS: score=${inspectionResult.score}/100 — ${inspectionResult.checks.filter(c => !c.passed).map(c => c.name).join(", ")}`;
  }

  reportStore.set(record.id, report);

  console.log(
    `[IRON-HALO] ADMITTED operator=${report.operatorId} mission=${report.missionId} ` +
    `haloId=${record.id} handshake=VERIFIED inspection=${inspectionResult.verdict} ` +
    `score=${inspectionResult.score}/100 flagged=${record.flagged}`,
  );

  res.status(200).json({
    accepted: true,
    haloId: record.id,
    stage: record.stage,
    handshake: "VERIFIED",
    inspection: inspectionResult.verdict,
    inspectionScore: inspectionResult.score,
    flagged: record.flagged,
    flagReason: record.flagReason || null,
    message: "Operator passed all gates. Admitted to quarantine for debrief.",
  });
});

// ── GET /health ──
app.get("/health", (_req, res) => {
  const debriefStats = debrief.getStats();
  const handshakeStats = handshake.getStats();
  const inspectionStats = inspection.getStats();

  res.json({
    service: "genesis-iron-halo",
    status: quarantine.getQueueSize() > 50 ? "AMBER" : "GREEN",
    role: "SANDBOXED_DECONTAMINATION_CHAMBER",
    doctrine: "Contaminated by default. Five-pound note doctrine. We protect what we love.",
    security: {
      handshake: handshakeStats,
      inspection: inspectionStats,
      immediateBurns: burnLog.length,
    },
    quarantine: {
      queueSize: quarantine.getQueueSize(),
      inQuarantine: quarantine.getQuarantineCount(),
      flagged: quarantine.getFlaggedCount(),
    },
    debrief: debriefStats,
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
      stage: r.stage,
      flagged: r.flagged,
      processingMs: r.processingMs,
      pnlUsd: r.extractedIntel?.result.pnlUsd,
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
      reason: r.flagReason, stage: r.stage,
    })),
    completed: flaggedCompleted.slice(-50).map(r => ({
      haloId: r.id, operatorId: r.operatorId, missionId: r.missionId,
      reason: r.flagReason, pnlUsd: r.extractedIntel?.result.pnlUsd,
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

// ── Start ──
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[IRON-HALO] Genesis Iron Halo listening on port ${PORT}`);
  console.log(`[IRON-HALO] Role: SANDBOXED_DECONTAMINATION_CHAMBER`);
  console.log(`[IRON-HALO] Network: ISOLATED — cannot reach core systems`);
  console.log(`[IRON-HALO] Security: HANDSHAKE (five-pound note) + AI INSPECTION (clone/timing)`);
  console.log(`[IRON-HALO] Pipeline: INSPECT → HANDSHAKE → QUARANTINE → DEBRIEF → SANITISE → EXTRACT → BURN`);
  console.log(`[IRON-HALO] Doctrine: Contaminated by default. We take no prisoners. We protect what we love.`);

  startProcessing();
});
