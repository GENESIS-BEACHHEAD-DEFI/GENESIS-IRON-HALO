/**
 * GENESIS-IRON-HALO v1.2 — Analyst Interface
 *
 * Abstraction for external AI advisors (Blue Team + Red Team).
 *
 * Two implementations:
 *   - SimulationAnalystAdapter: Deterministic rule-based analysis (testing/default)
 *   - ApiAnalystAdapter: Real ChatGPT/Perplexity API calls (production)
 *
 * Selected via ADVISORY_MODE env var ("SIMULATION" | "API").
 *
 * The analyst NEVER sees:
 *   - Real operatorId (receives anonymised subjectRef)
 *   - System architecture (stripped before delivery)
 *   - The other analyst's existence (bidirectional anonymity)
 */

import type { AnalystId, StrippedOperatorData, AdvisoryParcel } from "../../types";

export interface IAnalyst {
  /**
   * Analyze stripped operator data and produce an advisory parcel.
   *
   * For Blue Team (ANALYST_A): receives raw stripped data
   * For Red Team (ANALYST_B): receives stripped data + sanitised Blue findings
   */
  analyze(
    analystId: AnalystId,
    input: StrippedOperatorData,
    /** Red Team only: sanitised Blue parcel to attack */
    blueFindings?: Partial<AdvisoryParcel>,
  ): Promise<AdvisoryParcel>;

  /** Get analyst mode name */
  getMode(): "SIMULATION" | "API";

  /** Health check — is the analyst available? */
  isHealthy(): boolean;
}
