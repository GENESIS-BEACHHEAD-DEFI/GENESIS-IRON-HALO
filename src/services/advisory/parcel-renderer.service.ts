/**
 * GENESIS-IRON-HALO v1.2 — Parcel Renderer Service
 *
 * "Cold documents — plain text, zero metadata, no trace."
 *
 * Converts AdvisoryParcel objects to and from fixed-section plain text.
 * This is the cold document requirement: no JSON in production parcels,
 * no metadata, no formatting quirks that fingerprint the source.
 *
 * Enforced size range: 200-10000 chars.
 * Outside this range triggers SIZE_ANOMALY in the firewall.
 */

import type { AdvisoryParcel, ParcelVerdict, AnalystId, FindingCategory, FindingSeverity } from "../../types";

const MIN_PARCEL_SIZE = 200;
const MAX_PARCEL_SIZE = 10000;

export class ParcelRendererService {
  /**
   * Render an AdvisoryParcel to fixed-section plain text.
   * Zero metadata. Zero formatting quirks. Cold document.
   */
  render(parcel: AdvisoryParcel): string {
    const lines: string[] = [];

    lines.push("SECTION: HEADER");
    lines.push(`PARCEL: ${parcel.parcelId}`);
    lines.push(`SUBJECT: ${parcel.operatorId}`);
    lines.push(`ANALYST: ${parcel.analystId}`);
    lines.push(`TIME: ${parcel.timestamp}`);
    lines.push(`VERSION: ${parcel.schemaVersion}`);
    lines.push("");

    lines.push("SECTION: VERDICT");
    lines.push(`VERDICT: ${parcel.verdict}`);
    lines.push(`CONFIDENCE: ${parcel.confidence.toFixed(2)}`);
    lines.push("");

    lines.push("SECTION: FINDINGS");
    for (const f of parcel.findings) {
      lines.push(`FINDING: ${f.category} | ${f.severity} | ${f.description} | ${f.evidence}`);
    }
    if (parcel.findings.length === 0) {
      lines.push("FINDING: NONE");
    }
    lines.push("");

    lines.push("SECTION: ANOMALIES");
    for (const a of parcel.anomalies) {
      lines.push(`ANOMALY: ${a.type} | ${a.detail}`);
    }
    if (parcel.anomalies.length === 0) {
      lines.push("ANOMALY: NONE");
    }
    lines.push("");

    lines.push("SECTION: MISSION_DELTA");
    lines.push(`EXPECTED: ${parcel.missionDelta.expectedPath}`);
    lines.push(`ACTUAL: ${parcel.missionDelta.actualPath}`);
    lines.push(`DEVIATION: ${parcel.missionDelta.deviation}`);
    lines.push(`REASONING: ${parcel.missionDelta.reasoning}`);
    lines.push("");

    lines.push("SECTION: CLIP_ANALYSIS");
    lines.push(`TARGET: ${parcel.clipAnalysis.targetClip}`);
    lines.push(`ACTUAL: ${parcel.clipAnalysis.actualClip}`);
    lines.push(`NOISE: ${parcel.clipAnalysis.noiseRange}`);
    lines.push(`BOUNDS: ${parcel.clipAnalysis.withinBounds}`);
    lines.push(`PATTERN: ${parcel.clipAnalysis.suspiciousPattern}`);
    lines.push("");

    // Self-sharpening: steel sharpening steel — three AIs, all data captured
    lines.push("SECTION: SELF_SHARPENING");
    if (parcel.selfSharpening) {
      lines.push(`IMPROVEMENT: ${parcel.selfSharpening.improvementSuggestion}`);
      lines.push(`ESTIMATED_GAIN: ${parcel.selfSharpening.estimatedImprovementPercent}%`);
      lines.push(`ALTERNATIVE: ${parcel.selfSharpening.alternativeApproach}`);
    } else {
      lines.push("IMPROVEMENT: NONE");
    }
    lines.push("");

    lines.push("END_PARCEL");

    return lines.join("\n");
  }

  /**
   * Parse a plain text parcel back into an AdvisoryParcel object.
   * Returns null if the text is malformed.
   */
  parse(text: string): AdvisoryParcel | null {
    try {
      const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      const getValue = (prefix: string): string => {
        const line = lines.find(l => l.startsWith(prefix));
        return line ? line.slice(prefix.length).trim() : "";
      };

      const parcelId = getValue("PARCEL:");
      const operatorId = getValue("SUBJECT:");
      const analystId = getValue("ANALYST:") as AnalystId;
      const timestamp = getValue("TIME:");
      const schemaVersion = getValue("VERSION:");
      const verdict = getValue("VERDICT:") as ParcelVerdict;
      const confidence = parseFloat(getValue("CONFIDENCE:"));

      // Parse findings
      const findings = lines
        .filter(l => l.startsWith("FINDING:") && !l.includes("NONE"))
        .map(l => {
          const parts = l.slice("FINDING:".length).split("|").map(p => p.trim());
          return {
            category: (parts[0] || "UNKNOWN") as FindingCategory,
            severity: (parts[1] || "LOW") as FindingSeverity,
            description: parts[2] || "",
            evidence: parts[3] || "",
          };
        });

      // Parse anomalies
      const anomalies = lines
        .filter(l => l.startsWith("ANOMALY:") && !l.includes("NONE"))
        .map(l => {
          const parts = l.slice("ANOMALY:".length).split("|").map(p => p.trim());
          return { type: parts[0] || "UNKNOWN", detail: parts[1] || "" };
        });

      // Parse mission delta
      const missionDelta = {
        expectedPath: getValue("EXPECTED:"),
        actualPath: getValue("ACTUAL:"),
        deviation: getValue("DEVIATION:"),
        reasoning: getValue("REASONING:"),
      };

      // Parse clip analysis
      const clipAnalysis = {
        targetClip: parseFloat(getValue("TARGET:")) || 0,
        actualClip: parseFloat(getValue("ACTUAL:")) || 0,
        noiseRange: parseFloat(getValue("NOISE:")) || 0,
        withinBounds: getValue("BOUNDS:") === "true",
        suspiciousPattern: getValue("PATTERN:"),
      };

      // Parse self-sharpening
      const improvement = getValue("IMPROVEMENT:");
      const selfSharpening = improvement && improvement !== "NONE" ? {
        improvementSuggestion: improvement,
        estimatedImprovementPercent: parseFloat(getValue("ESTIMATED_GAIN:")) || 0,
        alternativeApproach: getValue("ALTERNATIVE:"),
      } : undefined;

      if (!parcelId || !analystId || !verdict || isNaN(confidence)) {
        return null;
      }

      return {
        parcelId,
        operatorId,
        analystId,
        timestamp,
        verdict,
        confidence,
        findings,
        anomalies,
        missionDelta,
        clipAnalysis,
        selfSharpening,
        schemaVersion: schemaVersion as "1.0" || "1.0",
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if rendered parcel is within enforced size range.
   */
  isWithinSizeRange(rendered: string): { valid: boolean; size: number; min: number; max: number } {
    return {
      valid: rendered.length >= MIN_PARCEL_SIZE && rendered.length <= MAX_PARCEL_SIZE,
      size: rendered.length,
      min: MIN_PARCEL_SIZE,
      max: MAX_PARCEL_SIZE,
    };
  }
}
