/**
 * Frontend helpers for the user-tokens settings page. These are pure
 * functions so they can be unit-tested without a DOM.
 */

/**
 * Format an ISO timestamp for display. Returns 'Never' for null/undefined.
 */
export function formatUserTokenDate(value) {
  if (!value) return 'Never';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/**
 * Decode a `#user-tokens-mint=<base64url-payload>` fragment string and
 * validate its shape. Returns the parsed payload on success, null
 * otherwise. The page uses this to detect a post-OAuth redirect and
 * open the show-once dialog in result mode.
 *
 * Same-tab flow replaced the older cross-window handoff after Backstage's
 * Content-Security-Policy was found to drop inline-script-based responses;
 * see docs/spec/user-tokens-architecture.md §2.3.
 *
 * @param {string} hash Either the raw URL fragment including `#` or
 *   just the encoded portion. Anything else returns null.
 * @returns {{ type: 'user-tokens-mint-result', flowId: string, token: string,
 *             metadata: { id: string, name: string, createdAt: string,
 *                          expiresAt: string, prefix: string } } | null}
 */
export function parseMintResultFragment(hash) {
  if (typeof hash !== 'string' || hash.length === 0) return null;
  const prefix = '#user-tokens-mint=';
  const encoded = hash.startsWith(prefix) ? hash.slice(prefix.length) : null;
  if (!encoded) return null;
  let payload;
  try {
    const standard = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standard.padEnd(
      standard.length + ((4 - (standard.length % 4)) % 4),
      '=',
    );
    payload = JSON.parse(
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8'),
    );
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (payload.type !== 'user-tokens-mint-result') return null;
  if (typeof payload.flowId !== 'string' || payload.flowId.length === 0) return null;
  if (typeof payload.token !== 'string' || payload.token.length === 0) return null;
  if (!payload.metadata || typeof payload.metadata !== 'object') return null;
  return payload;
}

/**
 * Validate the mint form's name input. Returns an error string or null.
 * Mirrors the server-side rules (see userTokensRouter.validateMintInput).
 */
export function validateUserTokenName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'Name is required';
  }
  if (name.length > 100) {
    return 'Name must be 100 characters or fewer';
  }
  if (!/^[A-Za-z0-9 _.\-:/]+$/.test(name.trim())) {
    return 'Name contains disallowed characters';
  }
  return null;
}

/**
 * Validate the optional expiry input. Accepts either an empty string
 * (meaning "no override") or an ISO-parseable value strictly in the
 * future. Returns an error string or null.
 */
export function validateUserTokenExpiry(value, now = Date.now()) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Expiry must be a valid date';
  }
  if (parsed.getTime() <= now) {
    return 'Expiry must be in the future';
  }
  return null;
}

/**
 * Default expiry value (30 days from now) suitable for a
 * `<input type="datetime-local">`.
 */
export function defaultUserTokenExpiry(now = Date.now()) {
  return new Date(now + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}
