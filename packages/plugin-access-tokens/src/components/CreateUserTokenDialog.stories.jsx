import { CreateUserTokenDialog } from './CreateUserTokenDialog.jsx';
import { userTokenFixtures } from '../fixtures/accessTokens.js';

const mintedResult = {
  token: 'sess-abc.long-random-refresh-token-value',
  metadata: {
    ...userTokenFixtures.active,
    prefix: 'sess-abc.',
  },
};

export default {
  title: 'User Tokens/Create Token Dialog',
  component: CreateUserTokenDialog,
  parameters: {
    layout: 'centered',
  },
};

export const Closed = {
  args: {
    open: false,
    onSubmit: async () => ({ authorizeUrl: '#' }),
  },
};

export const OpenEmpty = {
  args: {
    open: true,
    onSubmit: async () => ({ authorizeUrl: '#' }),
  },
};

export const OpenSubmitting = {
  args: {
    open: true,
    initialSubmitting: true,
    onSubmit: async () => ({ authorizeUrl: '#' }),
  },
};

export const ResultShowOnce = {
  args: {
    open: true,
    prefilledResult: mintedResult,
    onSubmit: async () => ({ authorizeUrl: '#' }),
  },
};
