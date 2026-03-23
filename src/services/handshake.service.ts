/**
 * GENESIS-IRON-HALO — Cryptographic Handshake Service v1.3
 *
 * "The Five-Pound Note Doctrine" + "Centurion Mutual Authentication"
 *
 * v1.0-1.2: ONE-WAY — operator proves identity to Iron Halo
 *   - DARPA calls POST /handshake/issue → gets {operatorToken, haloToken}
 *   - operatorToken goes with the operator, haloToken stays in vault
 *   - On return, operator presents operatorToken
 *   - Iron Halo combines both halves → if HMAC matches, operator is genuine
 *   - Each token is ONE-TIME USE. Replay = immediate burn.
 *
 * v1.3: MUTUAL — BOTH parties prove identity (Centurion Index signs both)
 *   Threat: Advanced adversary mirrors our endpoint. Operator delivers
 *   alpha to enemy disguised as Genesis. Game over.
 *
 *   Solution: Centurion Index (master signing authority) generates
 *   identity proofs for BOTH Iron Halo AND the operator at dispatch.
 *   Before transmitting payload, operator challenges Iron Halo via
 *   POST /mutual/verify — Iron Halo must prove it holds the Centurion
 *   secret by signing the operator's nonce. Only THEN does operator
 *   deliver its payload via POST /return.
 *
 *   Flow:
 *     1. DARPA calls /handshake/issue → gets operatorToken + haloIdentityProof
 *     2. Operator calls /mutual/verify with challengeNonce + expectedHaloProof
 *     3. Iron Halo signs nonce → operator verifies → Iron Halo IS genuine
 *     4. Operator calls /return with operatorToken → Five-Pound Note verified
 *     = MUTUAL AUTHENTICATION COMPLETE
 */

import { createHash, createHmac, randomBytes, randomUUID } from "crypto";

/** Secret key for HMAC — in production, this should be from env/vault */
const HANDSHAKE_SECRET = process.env.HANDSHAKE_SECRET || randomBytes(64).toString("hex");

/** v1.3: Centurion master signing secret — signs identity proofs for both parties */
const CENTURION_SECRET = process.env.CENTURION_SECRET || randomBytes(64).toString("hex");

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
  /** v1.3: Centurion-signed Iron Halo identity proof for this mission */
  haloIdentityProof: string;
  /** v1.3: Centurion-signed operator identity proof for this mission */
  operatorIdentityProof: string;
  /** v1.3: Centurion seal over the full mission binding */
  centurionSeal: string;
  /** v1.3: Has mutual verification been completed? */
  mutualVerified: boolean;
  /** v1.3: Counter-challenge nonce (Iron Halo challenges operator after mutual verify) */
  operatorChallenge?: string;
}

export interface HandshakeResult {
  valid: boolean;
  reason: string;
  operatorId: string;
  missionId: string;
}

const TOKEN_EXPIRY_MS = parseInt(process.env.HANDSHAKE_EXPIRY_MS || "7200000", 10); // 2 hours default

export class HandshakeService {
  private vault: Map<string, HandshakeToken> = new Map();
  private totalIssued = 0;
  private totalVerified = 0;
  private totalRejected = 0;
  private totalExpired = 0;
  private totalMutualVerified = 0;
  private totalMutualRejected = 0;

  /**
   * Issue a handshake token pair with v1.3 mutual authentication.
   * Called by DARPA when dispatching an operator.
   *
   * Returns:
   *   - operatorToken: Five-Pound Note half (existing)
   *   - haloIdentityProof: Centurion-signed proof that Iron Halo is genuine (v1.3)
   *   - operatorIdentityProof: Centurion-signed proof for operator (v1.3)
   *   - centurionSeal: Centurion signature over full mission binding (v1.3)
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
    haloIdentityProof: string;
    operatorIdentityProof: string;
    centurionSeal: string;
  } {
    const key = `${operatorId}:${missionId}`;
    const effectiveExpiry = expiryMs || TOKEN_EXPIRY_MS;

    // Generate two random halves (existing Five-Pound Note)
    const operatorHalf = randomBytes(32).toString("hex");
    const haloHalf = randomBytes(32).toString("hex");

    // Compute verification hash: HMAC(operatorHalf + haloHalf, secret)
    const verificationHash = createHmac("sha256", HANDSHAKE_SECRET)
      .update(operatorHalf + haloHalf)
      .digest("hex");

    // ── v1.3: Centurion Mutual Authentication ──
    // Generate identity proofs signed by Centurion master key
    const haloIdentityProof = createHmac("sha256", CENTURION_SECRET)
      .update(`HALO_IDENTITY:${operatorId}:${missionId}`)
      .digest("hex");

    const operatorIdentityProof = createHmac("sha256", CENTURION_SECRET)
      .update(`OPERATOR_IDENTITY:${operatorId}:${missionId}`)
      .digest("hex");

    // Centurion seal: signs the full mission binding (tamper detection)
    const centurionSeal = createHmac("sha256", CENTURION_SECRET)
      .update(`MISSION_SEAL:${operatorId}:${missionId}:${haloIdentityProof}:${operatorIdentityProof}`)
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
      haloIdentityProof,
      operatorIdentityProof,
      centurionSeal,
      mutualVerified: false,
    };

    this.vault.set(key, token);
    this.totalIssued++;

    console.log(
      `[IRON-HALO] HANDSHAKE_ISSUED operator=${operatorId} mission=${missionId} ` +
      `expiryMs=${effectiveExpiry} expires=${token.expiresAt} mutual=ARMED`,
    );

    return {
      operatorToken: operatorHalf,
      haloToken: haloHalf,
      haloIdentityProof,
      operatorIdentityProof,
      centurionSeal,
    };
  }

  /**
   * v1.3: MUTUAL VERIFICATION — Operator challenges Iron Halo to prove identity.
   *
   * "Before I deliver my alpha, prove you're Genesis."
   *
   * Flow:
   *   1. Operator sends challengeNonce + expectedHaloProof (received at dispatch)
   *   2. Iron Halo verifies expectedHaloProof matches stored haloIdentityProof
   *   3. Iron Halo signs the challengeNonce with Centurion-derived key
   *   4. Returns signed nonce + counter-challenge for the operator
   *   5. Operator verifies signature → Iron Halo IS genuine
   *
   * Only the real Iron Halo has CENTURION_SECRET → only it can produce valid signatures.
   * An adversary mirror cannot forge this without the Centurion master key.
   */
  verifyEndpointIdentity(
    operatorId: string,
    missionId: string,
    challengeNonce: string,
    expectedHaloProof: string,
  ): {
    verified: boolean;
    haloNonceSignature: string;
    operatorChallenge: string;
    reason: string;
  } {
    const key = `${operatorId}:${missionId}`;
    const storedToken = this.vault.get(key);

    // Check 1: Token exists
    if (!storedToken) {
      this.totalMutualRejected++;
      console.error(
        `[IRON-HALO] MUTUAL_REJECTED operator=${operatorId} — NO TOKEN FOUND. ` +
        `Cannot verify endpoint identity for unknown operator.`,
      );
      return {
        verified: false,
        haloNonceSignature: "",
        operatorChallenge: "",
        reason: "NO_TOKEN_FOUND — Unknown operator. Cannot verify mutual identity.",
      };
    }

    // Check 2: Token not expired
    if (new Date() > new Date(storedToken.expiresAt)) {
      this.totalMutualRejected++;
      console.error(
        `[IRON-HALO] MUTUAL_REJECTED operator=${operatorId} — TOKEN EXPIRED.`,
      );
      return {
        verified: false,
        haloNonceSignature: "",
        operatorChallenge: "",
        reason: "TOKEN_EXPIRED — Handshake expired before mutual verification.",
      };
    }

    // Check 3: Operator's expectedHaloProof matches our stored proof
    if (expectedHaloProof !== storedToken.haloIdentityProof) {
      this.totalMutualRejected++;
      console.error(
        `[IRON-HALO] MUTUAL_REJECTED operator=${operatorId} — ` +
        `HALO_PROOF_MISMATCH. Operator presented wrong identity proof. ` +
        `Possible forged dispatch credentials.`,
      );
      return {
        verified: false,
        haloNonceSignature: "",
        operatorChallenge: "",
        reason: "HALO_PROOF_MISMATCH — Operator presented incorrect identity proof. Forged credentials suspected.",
      };
    }

    // ── ALL CHECKS PASSED — Sign the nonce to prove we're genuine ──
    const haloNonceSignature = createHmac("sha256", CENTURION_SECRET)
      .update(`NONCE_RESPONSE:${operatorId}:${missionId}:${challengeNonce}`)
      .digest("hex");

    // Generate counter-challenge for the operator (verified during /return)
    const operatorChallenge = randomBytes(32).toString("hex");
    storedToken.operatorChallenge = operatorChallenge;
    storedToken.mutualVerified = true;

    this.totalMutualVerified++;

    console.log(
      `[IRON-HALO] MUTUAL_VERIFIED operator=${operatorId} mission=${missionId} — ` +
      `Iron Halo identity confirmed. Counter-challenge issued.`,
    );

    return {
      verified: true,
      haloNonceSignature,
      operatorChallenge,
      reason: "MUTUAL_VERIFIED — Iron Halo identity confirmed via Centurion signature. Counter-challenge issued.",
    };
  }

  /**
   * v1.3: Verify operator's response to mutual counter-challenge.
   * Called during /return processing to complete the mutual handshake.
   */
  verifyOperatorChallenge(
    operatorId: string,
    missionId: string,
    challengeResponse: string,
  ): boolean {
    const key = `${operatorId}:${missionId}`;
    const storedToken = this.vault.get(key);

    if (!storedToken || !storedToken.operatorChallenge) return false;

    const expectedResponse = createHmac("sha256", CENTURION_SECRET)
      .update(`CHALLENGE_RESPONSE:${operatorId}:${missionId}:${storedToken.operatorChallenge}`)
      .digest("hex");

    return challengeResponse === expectedResponse;
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
      `Five-pound note matched. Operator is genuine.` +
      (storedToken.mutualVerified ? ` Mutual auth: COMPLETE.` : ` Mutual auth: SKIPPED.`),
    );

    // Clean up — token is spent
    this.vault.delete(key);

    return {
      valid: true,
      reason: storedToken.mutualVerified
        ? "MUTUAL_VERIFIED — Both parties authenticated via Centurion. Full mutual handshake complete."
        : "VERIFIED — Cryptographic handshake confirmed. Operator is genuine.",
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
    totalMutualVerified: number;
    totalMutualRejected: number;
    activeTokens: number;
  } {
    return {
      totalIssued: this.totalIssued,
      totalVerified: this.totalVerified,
      totalRejected: this.totalRejected,
      totalExpired: this.totalExpired,
      totalMutualVerified: this.totalMutualVerified,
      totalMutualRejected: this.totalMutualRejected,
      activeTokens: this.vault.size,
    };
  }
}
