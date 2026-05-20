import { decodeEncryptionKey } from './userTokensEncryption.js';

const DEFAULT_DEFAULT_EXPIRY_DAYS = 30;
const DEFAULT_MAX_EXPIRY_DAYS = 365;

/**
 * Read and validate the `accessTokens.personal.*` configuration block.
 *
 * Refuses to load if required keys are absent or malformed so that startup
 * failures surface at plugin init rather than at first mint attempt.
 *
 * Required app-config shape (see docs/spec/user-tokens-api.md §4):
 *
 *   accessTokens:
 *     personal:
 *       enabled: true                      # optional, default true
 *       defaultExpiryDays: 30              # optional
 *       maxExpiryDays: 365                 # optional
 *       encryptionKey: '<base64 32 bytes>' # REQUIRED
 *       dcrClient:                         # optional
 *         clientId: ...
 *         clientSecret: ...
 *         redirectUri: ...
 *
 * @param {object} rootConfig Backstage's coreServices.rootConfig instance.
 * @returns {{
 *   enabled: boolean,
 *   defaultExpiryDays: number,
 *   maxExpiryDays: number,
 *   encryptionKey: Buffer,
 *   dcrClient: { clientId: string, clientSecret: string, redirectUri: string } | undefined,
 * }}
 */
export function readUserTokensConfig(rootConfig) {
  const root = rootConfig?.getOptionalConfig?.('accessTokens.personal');
  if (!root) {
    throw new Error(
      'accessTokens.personal config block is required to enable the personal-access-token capability',
    );
  }

  const enabled = root.getOptionalBoolean('enabled') ?? true;
  const defaultExpiryDays =
    root.getOptionalNumber('defaultExpiryDays') ?? DEFAULT_DEFAULT_EXPIRY_DAYS;
  const maxExpiryDays = root.getOptionalNumber('maxExpiryDays') ?? DEFAULT_MAX_EXPIRY_DAYS;

  if (
    !Number.isFinite(defaultExpiryDays) ||
    defaultExpiryDays <= 0 ||
    defaultExpiryDays > maxExpiryDays
  ) {
    throw new Error(
      `accessTokens.personal.defaultExpiryDays must be a positive number ≤ maxExpiryDays (${maxExpiryDays})`,
    );
  }
  if (!Number.isFinite(maxExpiryDays) || maxExpiryDays <= 0) {
    throw new Error('accessTokens.personal.maxExpiryDays must be a positive number');
  }

  const encryptionKey = decodeEncryptionKey(root.getOptionalString('encryptionKey'));

  let dcrClient;
  const dcrConfig = root.getOptionalConfig('dcrClient');
  if (dcrConfig) {
    dcrClient = {
      clientId: dcrConfig.getString('clientId'),
      clientSecret: dcrConfig.getString('clientSecret'),
      redirectUri: dcrConfig.getString('redirectUri'),
    };
  }

  return {
    enabled,
    defaultExpiryDays,
    maxExpiryDays,
    encryptionKey,
    dcrClient,
  };
}

/**
 * Validate that the auth-backend experimental flags this capability
 * depends on are enabled. Returns the list of missing flags; an empty
 * list means everything is in order. Pure check (no throwing) so the
 * caller can decide whether to refuse to mount or to log + skip.
 *
 * @param {object} rootConfig
 * @returns {string[]}
 */
export function missingAuthBackendFlags(rootConfig) {
  const missing = [];
  if (
    rootConfig?.getOptionalBoolean?.(
      'auth.experimentalDynamicClientRegistration.enabled',
    ) !== true
  ) {
    missing.push('auth.experimentalDynamicClientRegistration.enabled');
  }
  if (rootConfig?.getOptionalBoolean?.('auth.experimentalRefreshToken.enabled') !== true) {
    missing.push('auth.experimentalRefreshToken.enabled');
  }
  return missing;
}
