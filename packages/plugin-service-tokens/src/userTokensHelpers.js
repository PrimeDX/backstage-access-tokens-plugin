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
 * Decide whether the incoming `postMessage` envelope represents a valid
 * user-tokens mint result for the in-flight flow. Returns true only if:
 *   - origin matches the current Backstage origin
 *   - type is the expected discriminator
 *   - flowId matches the one our UI started
 *   - the message carries a non-empty token + metadata
 *
 * @param {MessageEvent} event
 * @param {{ expectedOrigin: string, expectedFlowId: string }} expectations
 */
export function isValidMintResultMessage(event, expectations) {
  if (!event || typeof event !== 'object') return false;
  if (event.origin !== expectations.expectedOrigin) return false;
  const data = event.data;
  if (!data || typeof data !== 'object') return false;
  if (data.type !== 'user-tokens-mint-result') return false;
  if (data.flowId !== expectations.expectedFlowId) return false;
  if (typeof data.token !== 'string' || data.token.length === 0) return false;
  if (!data.metadata || typeof data.metadata !== 'object') return false;
  return true;
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
