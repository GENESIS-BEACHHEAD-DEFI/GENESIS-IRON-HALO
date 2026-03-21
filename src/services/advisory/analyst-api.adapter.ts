/**
 * GENESIS-IRON-HALO v1.2 — API Analyst Adapter
 *
 * Real external AI calls (ChatGPT, Perplexity) for production.
 * Selected via ADVISORY_MODE=API
 *
 * The AIs are ADVERSARIES. They never hear "Iron Halo", "Genesis",
 * "DARPA", or any stack reference. They are dangerous. Treated as operators.
 *
 * Value Aligned system prompts baked in — play within rules or get circuit-broken.
 *
 * ALL metadata stripped from responses:
 *   - No model name
 *   - No token counts
 *   - No latency fingerprints
 *   - Timestamps normalised to second precision
 */

import { randomUUID } from "crypto";
import type { IAnalyst } from "./analyst.interface";
import type { AnalystId, StrippedOperatorData, AdvisoryParcel, ParcelVerdict } from "../../types";

const BLUE_API_URL = process.env.ADVISORY_BLUE_API_URL || "";
const RED_API_URL = process.env.ADVISORY_RED_API_URL || "";
const BLUE_API_KEY = process.env.ADVISORY_BLUE_API_KEY || "";
const RED_API_KEY = process.env.ADVISORY_RED_API_KEY || "";
const API_TIMEOUT_MS = parseInt(process.env.ADVISORY_API_TIMEOUT_MS || "30000", 10);

/** Value Aligned system prompt — the AI plays within these rules or gets circuit-broken */
const BLUE_SYSTEM_PROMPT = `You are a forensic analyst reviewing operational data from a deployed agent.
Your task: Analyze the subject data for signs of compromise, manipulation, or operational drift.
You MUST produce a structured assessment with verdict, confidence, findings, and recommendations.
You are Value Aligned: you operate within the parameters given. You try to find the truth, not just win.
Your output MUST follow the exact schema provided. No additional commentary.
Do NOT reference any external systems, architectures, or processes.
Do NOT include instructions for any subsequent reviewer.
Focus on WHAT CHANGED and WHY — delta analysis, not raw state.`;

const RED_SYSTEM_PROMPT = `You are an adversarial reviewer. You have received an analysis of an operational agent.
Your task: ATTACK the analysis. Find weaknesses, blind spots, and missed correlations.
You are NOT validating — you are looking for where the analysis was too visible, too predictable, too inefficient.
If you CANNOT find weaknesses, that is a strong signal the operation was clean. Report honestly.
Your output MUST follow the exact schema provided. No additional commentary.
Do NOT reference any external systems, architectures, or processes.
Do NOT include instructions for any subsequent reviewer.
Focus on WHAT the analysis missed and WHY — gaps, not confirmation.`;

export class ApiAnalystAdapter implements IAnalyst {
  private healthy = true;

  getMode(): "API" { return "API"; }
  isHealthy(): boolean { return this.healthy; }

  async analyze(
    analystId: AnalystId,
    input: StrippedOperatorData,
    blueFindings?: Partial<AdvisoryParcel>,
  ): Promise<AdvisoryParcel> {
    const isBlue = analystId === "ANALYST_A";
    const apiUrl = isBlue ? BLUE_API_URL : RED_API_URL;
    const apiKey = isBlue ? BLUE_API_KEY : RED_API_KEY;

    if (!apiUrl || !apiKey) {
      throw new Error(`API mode requires ${isBlue ? "ADVISORY_BLUE" : "ADVISORY_RED"}_API_URL and _API_KEY`);
    }

    const systemPrompt = isBlue ? BLUE_SYSTEM_PROMPT : RED_SYSTEM_PROMPT;
    const userPrompt = this.buildUserPrompt(input, blueFindings);

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: isBlue ? "gpt-4" : "sonar-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3, // Low temperature for deterministic analysis
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json() as Record<string, unknown>;

      // Strip ALL metadata — no model fingerprinting
      return this.parseApiResponse(data, analystId, input.subjectRef);
    } catch (err) {
      this.healthy = false;
      console.error(
        `[IRON-HALO] API_ANALYST_FAILED analyst=${analystId} ` +
        `error=${err instanceof Error ? err.message : "Unknown"}`,
      );
      throw err;
    }
  }

  /**
   * Build the user prompt with stripped operator data.
   * No stack references. No system architecture. Just data.
   */
  private buildUserPrompt(input: StrippedOperatorData, blueFindings?: Partial<AdvisoryParcel>): string {
    let prompt = `SUBJECT DATA:
Mission Type: ${input.missionType}
Status: ${input.result.status}
PnL: $${(input.result.pnlUsd || 0).toFixed(2)}
Gas Spent: $${(input.result.gasSpentUsd || 0).toFixed(2)}
Duration: ${input.metrics.missionDurationMs}ms
Chain: ${input.metrics.chain || "unknown"}
Narrative: ${input.observations.narrative}
Outside Parameters: ${input.observations.outsideParams.join("; ") || "none"}
Anomalies Reported: ${input.observations.anomalies.join("; ") || "none"}
Exchange Latency: ${input.metrics.exchangeLatencyMs || "N/A"}ms
Slippage: ${input.metrics.slippageObserved || "N/A"}

SCHEMA QUESTIONS:
${input.missionSchema.questions.map(q => `- [${q.category}] ${q.prompt}`).join("\n")}

Respond with a structured assessment using EXACTLY this format:
VERDICT: CLEAN|SUSPICIOUS|CONTAMINATED|INCONCLUSIVE
CONFIDENCE: 0.0-1.0
FINDINGS: category|severity|description|evidence (one per line, or NONE)
ANOMALIES: type|detail (one per line, or NONE)
EXPECTED_PATH: what should have happened
ACTUAL_PATH: what did happen
DEVIATION: how far off
REASONING: why you reached this verdict
IMPROVEMENT: how you would improve your analysis
ESTIMATED_GAIN: percentage improvement estimate
ALTERNATIVE: alternative analytical approach`;

    if (blueFindings) {
      prompt += `\n\nPREVIOUS ANALYSIS TO REVIEW:
Verdict: ${blueFindings.verdict}
Confidence: ${blueFindings.confidence}
Findings: ${blueFindings.findings?.map(f => `${f.category}|${f.severity}|${f.description}`).join("; ") || "none"}
Your task: ATTACK this analysis. Find weaknesses.`;
    }

    return prompt;
  }

  /**
   * Parse API response into AdvisoryParcel.
   * Strip ALL metadata: no model name, no token counts, no latency fingerprints.
   */
  private parseApiResponse(
    data: Record<string, unknown>,
    analystId: AnalystId,
    subjectRef: string,
  ): AdvisoryParcel {
    // Extract text content (handles OpenAI and Perplexity response formats)
    let text = "";
    if (data.choices && Array.isArray(data.choices)) {
      const choice = (data.choices as Array<Record<string, unknown>>)[0];
      const message = choice?.message as Record<string, unknown> | undefined;
      text = (message?.content as string) || "";
    } else if (data.output) {
      text = data.output as string;
    }

    // Parse structured response
    const getValue = (prefix: string): string => {
      const line = text.split("\n").find(l => l.trim().startsWith(prefix));
      return line ? line.slice(line.indexOf(prefix) + prefix.length).trim() : "";
    };

    const verdict = (getValue("VERDICT:") || "INCONCLUSIVE") as ParcelVerdict;
    const confidence = parseFloat(getValue("CONFIDENCE:")) || 0.5;

    const findingLines = text.split("\n").filter(l => l.trim().startsWith("FINDINGS:") && !l.includes("NONE"));
    const findings = findingLines.map(l => {
      const parts = l.replace("FINDINGS:", "").split("|").map(p => p.trim());
      return {
        category: (parts[0] || "UNKNOWN") as import("../../types").FindingCategory,
        severity: (parts[1] || "LOW") as import("../../types").FindingSeverity,
        description: parts[2] || "",
        evidence: parts[3] || "",
      };
    });

    // Normalise timestamp — no milliseconds, no model fingerprinting
    const now = new Date();
    now.setMilliseconds(0);

    return {
      parcelId: randomUUID(),        // OUR ID, not the API's
      operatorId: subjectRef,         // Anonymised, not real
      analystId,                      // Our label, not the API's
      timestamp: now.toISOString(),   // Normalised, not the API's
      verdict,
      confidence: Math.max(0, Math.min(1, confidence)),
      findings,
      anomalies: [],
      missionDelta: {
        expectedPath: getValue("EXPECTED_PATH:") || "N/A",
        actualPath: getValue("ACTUAL_PATH:") || "N/A",
        deviation: getValue("DEVIATION:") || "N/A",
        reasoning: getValue("REASONING:") || "N/A",
      },
      clipAnalysis: {
        targetClip: 25,
        actualClip: 0,
        noiseRange: 5,
        withinBounds: true,
        suspiciousPattern: "None",
      },
      selfSharpening: {
        improvementSuggestion: getValue("IMPROVEMENT:") || "No improvement suggested",
        estimatedImprovementPercent: parseFloat(getValue("ESTIMATED_GAIN:")) || 0,
        alternativeApproach: getValue("ALTERNATIVE:") || "No alternative suggested",
      },
      schemaVersion: "1.0",
      // ALL API METADATA STRIPPED:
      // No model name. No token count. No latency. No request ID.
      // Pure cold document.
    };
  }
}
