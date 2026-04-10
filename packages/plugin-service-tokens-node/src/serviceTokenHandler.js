import { createRequire } from 'node:module';
import { serviceTokenHandlerType } from './constants.js';
import { verifyToken } from './verifyToken.js';

const require = createRequire(import.meta.url);
const { createExternalTokenHandler } = require('@backstage/backend-defaults/auth');

export function createServiceTokenHandler({ cache, db, logger }) {
  return createExternalTokenHandler({
    type: serviceTokenHandlerType,

    initialize() {
      return { cache, db, logger };
    },

    async verifyToken(token, context) {
      return verifyToken(token, context);
    },
  });
}
