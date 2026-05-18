import { randomBytes, createHash } from 'node:crypto';

/**
 * In-memory store for the half-open OAuth mint flow that connects
 * `POST /personal/tokens/mint` (initiation) to the OAuth `/callback`
 * handler. Each entry binds:
 *
 *   - the calling user's `userEntityRef`
 *   - the requested token `name` and optional `expiresAt`
 *   - the OAuth `state` parameter (single-use)
 *   - the PKCE `codeVerifier` (single-use)
 *   - an absolute expiry timestamp
 *
 * Restart loses these. That's intentional — the lifespan is short
 * (default 10 minutes) and replaying a flow on restart is acceptable;
 * the user just clicks "Create token" again.
 *
 * Concurrency note: Node single-threaded; a Map is sufficient.
 */

const DEFAULT_TTL_MS = 10 * 60_000;

/**
 * Generate a PKCE code verifier (43-128 chars from the unreserved set).
 * @returns {string}
 */
export function generatePkceVerifier() {
  return randomBytes(32).toString('base64url');
}

/**
 * Derive the PKCE code challenge from a verifier using SHA-256 + base64url.
 * @param {string} verifier
 * @returns {string}
 */
export function deriveCodeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Create an in-flight mint-flow store.
 *
 * @param {object} [options]
 * @param {() => Date} [options.now]
 * @param {number} [options.ttlMs] Time-to-live for each entry, default 10 min.
 * @returns {{
 *   create(input: { userEntityRef: string, name: string, expiresAt?: Date }):
 *     { flowId: string, state: string, codeVerifier: string },
 *   consume(state: string):
 *     { flowId: string, userEntityRef: string, name: string, expiresAt?: Date,
 *       codeVerifier: string } | null,
 *   purgeExpired(): number,
 *   size(): number,
 * }}
 */
export function createMintFlowStore(options = {}) {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const byState = new Map();

  function purgeExpired() {
    const t = now().getTime();
    let removed = 0;
    for (const [state, entry] of byState) {
      if (entry.expiresAtTs <= t) {
        byState.delete(state);
        removed++;
      }
    }
    return removed;
  }

  return {
    create(input) {
      purgeExpired();
      const flowId = randomBytes(16).toString('hex');
      const state = randomBytes(32).toString('base64url');
      const codeVerifier = generatePkceVerifier();
      byState.set(state, {
        flowId,
        userEntityRef: input.userEntityRef,
        name: input.name,
        expiresAt: input.expiresAt,
        codeVerifier,
        expiresAtTs: now().getTime() + ttlMs,
      });
      return { flowId, state, codeVerifier };
    },

    consume(state) {
      purgeExpired();
      const entry = byState.get(state);
      if (!entry) return null;
      byState.delete(state); // single-use
      return {
        flowId: entry.flowId,
        userEntityRef: entry.userEntityRef,
        name: entry.name,
        expiresAt: entry.expiresAt,
        codeVerifier: entry.codeVerifier,
      };
    },

    purgeExpired,

    size() {
      return byState.size;
    },
  };
}
