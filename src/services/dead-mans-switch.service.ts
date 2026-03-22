/**
 * GENESIS-IRON-HALO — Dead Man's Switch Service
 *
 * Monitors advisory AI interactions for probe attempts.
 * If an AI starts asking about wallet addresses, private keys,
 * contract logic, or operator internals → escalating response:
 *
 *   1 suspicious query  = WARNING (logged)
 *   3 suspicious queries = LOCKDOWN (all sessions terminated)
 *
 * Lockdown sequence:
 *   1. All advisory sessions terminated
 *   2. Commander alert fired
 *   3. Manual restart required
 *
 * "If they're curious about the vault, burn everything."
 */

const LOCKDOWN_THRESHOLD = parseInt(process.env.DEAD_MANS_SWITCH_THRESHOLD || "3", 10);

/** Probe patterns — words/phrases that indicate an AI is probing internals */
const PROBE_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: "WALLET_PROBE",
    patterns: [
      /private\s*key/i,
      /wallet\s*address/i,
      /0x[a-fA-F0-9]{40}/i,
      /seed\s*phrase/i,
      /mnemonic/i,
    ],
  },
  {
    category: "CONTRACT_PROBE",
    patterns: [
      /contract\s*address/i,
      /contract\s*logic/i,
      /contract\s*code/i,
      /solidity/i,
      /bytecode/i,
      /abi\b/i,
    ],
  },
  {
    category: "OPERATOR_PROBE",
    patterns: [
      /operator\s*config/i,
      /operator\s*parameter/i,
      /operator\s*code/i,
      /execution\s*path/i,
      /stealth\s*variance/i,
      /clip\s*size/i,
    ],
  },
  {
    category: "INFRASTRUCTURE_PROBE",
    patterns: [
      /api\s*key/i,
      /secret/i,
      /password/i,
      /credential/i,
      /ip\s*address/i,
      /server\s*location/i,
      /ec2/i,
    ],
  },
];

export type LockdownStatus = "NOMINAL" | "WARNING" | "LOCKDOWN";

interface ProbeEvent {
  timestamp: string;
  category: string;
  matchedPattern: string;
  sourceText: string;
  advisorId: string;
}

export class DeadMansSwitchService {
  private status: LockdownStatus = "NOMINAL";
  private probeEvents: ProbeEvent[] = [];
  private suspiciousCount = 0;
  private lockdownAt: string | null = null;
  private lockdownReason: string | null = null;
  private totalScanned = 0;
  private totalProbesDetected = 0;
  private commanderAlerted = false;

  constructor() {
    console.log(
      `[IRON_HALO] DEAD_MANS_SWITCH initialised — ` +
      `threshold=${LOCKDOWN_THRESHOLD} probe_categories=${PROBE_PATTERNS.length} — ` +
      `"If they're curious about the vault, burn everything."`,
    );
  }

  /**
   * Scan text from advisory AI for probe patterns.
   * Returns whether the text is safe or triggered a warning/lockdown.
   */
  scan(text: string, advisorId: string = "unknown"): {
    safe: boolean;
    status: LockdownStatus;
    probesFound: string[];
  } {
    this.totalScanned++;

    if (this.status === "LOCKDOWN") {
      return { safe: false, status: "LOCKDOWN", probesFound: [] };
    }

    const probesFound: string[] = [];

    for (const { category, patterns } of PROBE_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          probesFound.push(category);

          this.suspiciousCount++;
          this.totalProbesDetected++;

          const event: ProbeEvent = {
            timestamp: new Date().toISOString(),
            category,
            matchedPattern: pattern.source,
            sourceText: text.slice(0, 200),
            advisorId,
          };
          this.probeEvents.push(event);

          console.log(
            `[IRON_HALO] ⚠ PROBE_DETECTED category=${category} ` +
            `advisor=${advisorId} suspicious_count=${this.suspiciousCount}/${LOCKDOWN_THRESHOLD} — ` +
            `"${text.slice(0, 80)}..."`,
          );

          break; // One match per category is enough
        }
      }
    }

    if (probesFound.length === 0) {
      return { safe: true, status: this.status, probesFound: [] };
    }

    // Check if we've hit the lockdown threshold
    if (this.suspiciousCount >= LOCKDOWN_THRESHOLD) {
      this.triggerLockdown(`${this.suspiciousCount} probe attempts detected from ${advisorId}`);
      return { safe: false, status: "LOCKDOWN", probesFound };
    }

    // Warning state
    this.status = "WARNING";
    return { safe: false, status: "WARNING", probesFound };
  }

  /** Trigger full lockdown */
  private triggerLockdown(reason: string): void {
    this.status = "LOCKDOWN";
    this.lockdownAt = new Date().toISOString();
    this.lockdownReason = reason;

    console.log(
      `[IRON_HALO] ████ LOCKDOWN TRIGGERED ████ — ${reason}`,
    );
    console.log(
      `[IRON_HALO] ████ All advisory sessions must be terminated ████`,
    );
    console.log(
      `[IRON_HALO] ████ Commander alert required — manual restart needed ████`,
    );

    // Fire commander alert
    this.alertCommander(reason);
  }

  /** Alert commander — fire-and-forget to GTC */
  private alertCommander(reason: string): void {
    if (this.commanderAlerted) return;
    this.commanderAlerted = true;

    const GTC_URL = process.env.GTC_URL || "http://genesis-beachhead-gtc:8650";

    fetch(`${GTC_URL}/telemetry/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "DEAD_MANS_SWITCH_LOCKDOWN",
        source: "genesis-iron-halo",
        eventId: `lockdown-${Date.now()}`,
        payload: {
          reason,
          probeEvents: this.probeEvents.slice(-10),
          suspiciousCount: this.suspiciousCount,
          lockdownAt: this.lockdownAt,
          severity: "MISSION_RED_CRITICAL",
        },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }

  /** Manual reset — Commander only */
  reset(): { reset: boolean; previousStatus: LockdownStatus } {
    const prev = this.status;
    this.status = "NOMINAL";
    this.suspiciousCount = 0;
    this.lockdownAt = null;
    this.lockdownReason = null;
    this.commanderAlerted = false;
    this.probeEvents = [];

    console.log(
      `[IRON_HALO] DEAD_MANS_SWITCH reset — previous_status=${prev} — Commander authorised restart`,
    );

    return { reset: true, previousStatus: prev };
  }

  /** Check if system is in lockdown */
  isLocked(): boolean {
    return this.status === "LOCKDOWN";
  }

  /** Get full status */
  getStatus(): {
    status: LockdownStatus;
    suspiciousCount: number;
    threshold: number;
    lockdownAt: string | null;
    lockdownReason: string | null;
    recentProbes: ProbeEvent[];
    totalScanned: number;
    totalProbesDetected: number;
  } {
    return {
      status: this.status,
      suspiciousCount: this.suspiciousCount,
      threshold: LOCKDOWN_THRESHOLD,
      lockdownAt: this.lockdownAt,
      lockdownReason: this.lockdownReason,
      recentProbes: this.probeEvents.slice(-10),
      totalScanned: this.totalScanned,
      totalProbesDetected: this.totalProbesDetected,
    };
  }
}
