/**
 * GENESIS-IRON-HALO — Cryptographic Handshake Service
 *
 * "The Five-Pound Note Doctrine"
 *
 * When an operator is dispatched by DARPA, it receives one half of a
 * cryptographic token. Iron Halo holds the other half.
 * On return, the operator must present its half.
 * If the halves don't match — IMMEDIATE BURN. No questions.
 *
 * This is the authentication layer that proves:
 *   1. This operator was genuinely dispatched by DARPA (not a clone)
 *   2. The operator hasn't been tampered with in transit
 *   3. The return report hasn't been forged or replayed
 *
 * Implementation:
 *   - DARPA calls POST /handshake/issue → gets {operatorToken, haloToken}
 *   - operatorToken goes with the operator
 *   - haloToken stays in Iron Halo
 *   - On return, operator presents operatorToken
 *   - Iron Halo combines both halves → if HMAC matches, operator is genuine
 *   - Each token is ONE-TIME USE. Replay = immediate burn.
 */

import { createHash, createHmac, randomBytes, randomUUID } from "crypto";

/** Secret key for HMAC — in production, this should be from env/vault */
const HANDSHAKE_SECRET = process.env.HANDSHAKE_SECRET || randomBytes(64).toString("hex");

export interface HandshakeToken {
  operatorId: string;
  missionId: string;
  /** The operator's half — given to the operator on dispatch */
  operatorToken: string;
  /** Iron Halo's half — stays in the vault */
  haloToken: string;
  /** Combined verification hash — the expected result when both halves match */
  verificationHash: string;
  /** Issued timestamp */
  issuedAt: string;
  /** Has this token been used? (one-time only) */
  used: boolean;
  /** Expiry — tokens expire after mission timeout */
  expiresAt: string;
}

export interface HandshakeResult {
  valid: boolean;
  reason: string;
  operatorId: string;
  missionId: string;
}

const TOKEN_EXPIRY_MS = parseInt(process.env.HANDSHAKE_EXPIRY_MS || "7200000", 10); // 2 hours default

export class HandshakeService {
  private vault: Map<string, HandshakeToken> = new Map(); // keyed by operatorId+missionId
  private totalIssued = 0;
  private totalVerified = 0;
  private totalRejected = 0;
  private totalExpired = 0;

  /**
   * Issue a handshake token pair.
   * Called by DARPA when dispatching an operator.
   * Returns both halves — DARPA gives operatorToken to the operator,
   * haloToken stays in Iron Halo's vault.
   *
   * @param expiryMs — Optional per-class expiry override:
   *   RECON:         7 days  (604800000)
   *   DEEP_COVER:    30 days (2592000000)
   *   PHANTOM_STACK: 90 days (7776000000)
   *   Default:       2 hours (TOKEN_EXPIRY_MS)
   */
  issue(operatorId: string, missionId: string, expiryMs?: number): {
    operatorToken: string;
    haloToken: string;
  } {
    const key = `${operatorId}:${missionId}`;
    const effectiveExpiry = expiryMs || TOKEN_EXPIRY_MS;

    // Generate two random halves
    const operatorHalf = randomBytes(32).toString("hex");
    const haloHalf = randomBytes(32).toString("hex");

    // Compute verification hash: HMAC(operatorHalf + haloHalf, secret)
    const verificationHash = createHmac("sha256", HANDSHAKE_SECRET)
      .update(operatorHalf + haloHalf)
      .digest("hex");

    const now = new Date();
    const token: HandshakeToken = {
      operatorId,
      missionId,
      operatorToken: operatorHalf,
      haloToken: haloHalf,
      verificationHash,
      issuedAt: now.toISOString(),
      used: false,
      expiresAt: new Date(now.getTime() + effectiveExpiry).toISOString(),
    };

    this.vault.set(key, token);
    this.totalIssued++;

    console.log(
      `[IRON-HALO] HANDSHAKE_ISSUED operator=${operatorId} mission=${missionId} ` +
      `expiryMs=${effectiveExpiry} expires=${token.expiresAt}`,
    );

    return {
      operatorToken: operatorHalf,
      haloToken: haloHalf,
    };
  }

  /**
   * Verify an operator's handshake token on return.
   * The five-pound note test — if the halves don't match, IMMEDIATE BURN.
   */
  verify(operatorId: string, missionId: string, operatorToken: string): HandshakeResult {
    const key = `${operatorId}:${missionId}`;
    const storedToken = this.vault.get(key);

    // ── Check 1: Token exists ──
    if (!storedToken) {
      this.totalRejected++;
      console.error(
        `[IRON-HALO] HANDSHAKE_REJECTED operator=${operatorId} — NO TOKEN FOUND. ` +
        `Unknown operator or forged identity. IMMEDIATE BURN.`,
      );
      return {
        valid: false,
        reason: "NO_TOKEN_FOUND — Unknown operator. Never dispatched or forged identity.",
        operatorId,
        missionId,
      };
    }

    // ── Check 2: Token not already used (replay protection) ──
    if (storedToken.used) {
      this.totalRejected++;
      console.error(
        `[IRON-HALO] HANDSHAKE_REJECTED operator=${operatorId} — REPLAY DETECTED. ` +
        `Token already used at ${storedToken.issuedAt}. IMMEDIATE BURN.`,
      );
      return {
        valid: false,
        reason: "REPLAY_DETECTED — Token already used. Possible clone or replay attack.",
        operatorId,
        missionId,
      };
    }

    // ── Check 3: Token not expired ──
    if (new Date() > new Date(storedToken.expiresAt)) {
      this.totalExpired++;
      this.totalRejected++;
      this.vault.delete(key);
      console.error(
        `[IRON-HALO] HANDSHAKE_REJECTED operator=${operatorId} — TOKEN EXPIRED. ` +
        `Issued ${storedToken.issuedAt}, expired ${storedToken.expiresAt}. BURN.`,
      );
      return {
        valid: false,
        reason: "TOKEN_EXPIRED — Operator took too long to return. Possible compromise.",
        operatorId,
        missionId,
      };
    }

    // ── Check 4: The five-pound note — do the halves match? ──
    const expectedHash = createHmac("sha256", HANDSHAKE_SECRET)
      .update(operatorToken + storedToken.haloToken)
      .digest("hex");

    if (expectedHash !== storedToken.verificationHash) {
      this.totalRejected++;
      console.error(
        `[IRON-HALO] HANDSHAKE_REJECTED operator=${operatorId} — ` +
        `CRYPTOGRAPHIC MISMATCH. The five-pound note doesn't match. ` +
        `CLONE OR TAMPERED OPERATOR. IMMEDIATE BURN.`,
      );
      this.vault.delete(key);
      return {
        valid: false,
        reason: "CRYPTO_MISMATCH — Operator token does not match. Clone or tampered operator.",
        operatorId,
        missionId,
      };
    }

    // ── VALID — Mark as used, one-time only ──
    storedToken.used = true;
    this.totalVerified++;

    console.log(
      `[IRON-HALO] HANDSHAKE_VERIFIED operator=${operatorId} mission=${missionId} — ` +
      `Five-pound note matched. Operator is genuine.`,
    );

    // Clean up — token is spent
    this.vault.delete(key);

    return {
      valid: true,
      reason: "VERIFIED — Cryptographic handshake confirmed. Operator is genuine.",
      operatorId,
      missionId,
    };
  }

  /**
   * Purge expired tokens from the vault.
   */
  purgeExpired(): number {
    const now = new Date();
    let purged = 0;

    for (const [key, token] of this.vault) {
      if (now > new Date(token.expiresAt)) {
        this.vault.delete(key);
        this.totalExpired++;
        purged++;
      }
    }

    if (purged > 0) {
      console.log(`[IRON-HALO] Purged ${purged} expired handshake tokens`);
    }

    return purged;
  }

  getStats(): {
    totalIssued: number;
    totalVerified: number;
    totalRejected: number;
    totalExpired: number;
    activeTokens: number;
  } {
    return {
      totalIssued: this.totalIssued,
      totalVerified: this.totalVerified,
      totalRejected: this.totalRejected,
      totalExpired: this.totalExpired,
      activeTokens: this.vault.size,
    };
  }
}
