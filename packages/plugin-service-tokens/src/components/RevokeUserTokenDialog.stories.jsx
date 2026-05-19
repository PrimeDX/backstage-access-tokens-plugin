import { RevokeUserTokenDialog } from './RevokeUserTokenDialog.jsx';
import { userTokenFixtures } from '../fixtures/serviceTokens.js';

export default {
  title: 'User Tokens/Revoke Token Dialog',
  component: RevokeUserTokenDialog,
  parameters: {
    layout: 'centered',
  },
};

export const Confirmation = {
  args: {
    open: true,
    token: userTokenFixtures.active,
    onConfirm: () => {},
  },
};

export const Revoking = {
  args: {
    open: true,
    token: userTokenFixtures.active,
    revoking: true,
    onConfirm: () => {},
  },
};

export const Error = {
  args: {
    open: true,
    token: userTokenFixtures.active,
    error: 'Failed to revoke token. Try again.',
    onConfirm: () => {},
  },
};
