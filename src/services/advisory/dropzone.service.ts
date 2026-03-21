/**
 * GENESIS-IRON-HALO v1.2 — Drop Zone Service
 *
 * "Dead Drop Architecture (One-Way, Read-Only)"
 *
 * Drop zones are one-way: AIs write, Iron Halo reads.
 * Iron Halo retrieves on fixed schedule (not on arrival)
 * to prevent timing side-channel.
 *
 * Constraints:
 *   - Write-once: once a parcel is written, the zone is sealed
 *   - Read-once: once Iron Halo retrieves, the parcel is consumed
 *   - Zones expire after ADVISORY_ZONE_EXPIRY_MS
 *   - In-memory Map (consistent with existing Iron Halo pattern)
 */

import { randomUUID } from "crypto";
import type { DropZone, DropZoneState, AnalystId, StrippedOperatorData, AdvisoryParcel } from "../../types";

const ZONE_EXPIRY_MS = parseInt(process.env.ADVISORY_ZONE_EXPIRY_MS || "60000", 10);

export class DropZoneService {
  private zones: Map<string, DropZone> = new Map();
  private totalCreated = 0;
  private totalWritten = 0;
  private totalRetrieved = 0;
  private totalExpired = 0;

  /**
   * Create a new drop zone for an analyst.
   */
  createZone(operatorId: string, missionId: string, analystTarget: AnalystId): DropZone {
    const now = new Date();
    const zone: DropZone = {
      zoneId: randomUUID(),
      operatorId,
      missionId,
      analystTarget,
      state: "EMPTY",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ZONE_EXPIRY_MS).toISOString(),
    };

    this.zones.set(zone.zoneId, zone);
    this.totalCreated++;
    return zone;
  }

  /**
   * Write stripped operator data into a drop zone for the analyst to read.
   */
  writeInput(zoneId: string, inputData: StrippedOperatorData): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.state !== "EMPTY") return false;
    if (this.isExpired(zone)) {
      zone.state = "EXPIRED";
      return false;
    }

    zone.inputData = inputData;
    return true;
  }

  /**
   * Analyst writes an advisory parcel into the drop zone.
   * Write-once: zone is sealed after writing. No overwrites.
   */
  writeParcel(zoneId: string, parcel: AdvisoryParcel, renderedParcel?: string): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;
    if (zone.state === "WRITTEN" || zone.state === "RETRIEVED") return false; // Write-once
    if (this.isExpired(zone)) {
      zone.state = "EXPIRED";
      return false;
    }

    zone.parcel = parcel;
    zone.renderedParcel = renderedParcel;
    zone.state = "WRITTEN";
    zone.writtenAt = new Date().toISOString();
    this.totalWritten++;
    return true;
  }

  /**
   * Iron Halo retrieves the parcel from a drop zone.
   * Read-once: zone transitions to RETRIEVED after retrieval.
   */
  retrieveParcel(zoneId: string): AdvisoryParcel | null {
    const zone = this.zones.get(zoneId);
    if (!zone || zone.state !== "WRITTEN") return null;
    if (this.isExpired(zone)) {
      zone.state = "EXPIRED";
      return null;
    }

    const parcel = zone.parcel || null;
    zone.state = "RETRIEVED";
    zone.retrievedAt = new Date().toISOString();
    this.totalRetrieved++;
    return parcel;
  }

  /**
   * Mark a zone as quarantined (firewall rejection).
   */
  quarantine(zoneId: string): void {
    const zone = this.zones.get(zoneId);
    if (zone) zone.state = "QUARANTINED";
  }

  /**
   * Force-expire a zone.
   */
  expire(zoneId: string): void {
    const zone = this.zones.get(zoneId);
    if (zone) {
      zone.state = "EXPIRED";
      // Destroy data
      zone.inputData = undefined;
      zone.parcel = undefined;
      zone.renderedParcel = undefined;
    }
  }

  /**
   * Destroy a zone completely — remove from memory.
   * Called after advisory cycle completes. One-time use.
   */
  destroy(zoneId: string): void {
    const zone = this.zones.get(zoneId);
    if (zone) {
      zone.inputData = undefined;
      zone.parcel = undefined;
      zone.renderedParcel = undefined;
    }
    this.zones.delete(zoneId);
  }

  /**
   * Cleanup expired zones — periodic maintenance.
   */
  cleanup(): number {
    let cleaned = 0;
    for (const [id, zone] of this.zones) {
      if (this.isExpired(zone)) {
        zone.inputData = undefined;
        zone.parcel = undefined;
        zone.renderedParcel = undefined;
        this.zones.delete(id);
        this.totalExpired++;
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * Get a zone by ID.
   */
  get(zoneId: string): DropZone | undefined {
    return this.zones.get(zoneId);
  }

  getActiveCount(): number {
    return this.zones.size;
  }

  getStats(): {
    totalCreated: number;
    totalWritten: number;
    totalRetrieved: number;
    totalExpired: number;
    activeZones: number;
  } {
    return {
      totalCreated: this.totalCreated,
      totalWritten: this.totalWritten,
      totalRetrieved: this.totalRetrieved,
      totalExpired: this.totalExpired,
      activeZones: this.zones.size,
    };
  }

  private isExpired(zone: DropZone): boolean {
    return new Date() > new Date(zone.expiresAt);
  }
}
