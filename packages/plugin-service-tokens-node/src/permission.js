import { createPermission } from '@backstage/plugin-permission-common';

export const serviceTokensAdminPermission = createPermission({
  name: 'service-tokens.admin',
  attributes: {},
});
