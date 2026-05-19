import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConsentCopy,
  isUserTokensConsentSession,
} from './userTokensConsentHelpers.js';

test('isUserTokensConsentSession recognizes the user-token callback URL', () => {
  assert.equal(
    isUserTokensConsentSession({
      redirectUri:
        'http://localhost:7007/api/service-tokens/personal/tokens/mint/callback',
    }),
    true,
  );

  assert.equal(
    isUserTokensConsentSession({
      redirectUri: 'http://localhost:7007/api/something-else/callback',
    }),
    false,
  );
});

test('buildConsentCopy returns softer personal-token copy', () => {
  const copy = buildConsentCopy(
    {
      clientName: 'Personal access tokens',
      redirectUri:
        'http://localhost:7007/api/service-tokens/personal/tokens/mint/callback',
    },
    'Scaffolded Backstage App',
  );

  assert.equal(copy.kind, 'user-tokens');
  assert.equal(copy.title, 'Create personal access token');
  assert.equal(copy.approveLabel, 'Create token');
  assert.equal(copy.detailLabel, 'Return URL');
  assert.match(copy.body, /signed-in user/);
  assert.doesNotMatch(
    copy.body,
    new RegExp(['act', 'on', 'your', 'behalf'].join(' '), 'i'),
  );
  assert.doesNotMatch(
    copy.title,
    new RegExp(['security', 'notice'].join(' '), 'i'),
  );
});

test('buildConsentCopy falls back to generic OAuth copy for unknown clients', () => {
  const copy = buildConsentCopy(
    {
      clientId: 'other-client',
      clientName: 'Other integration',
      redirectUri: 'http://localhost:7007/api/other/callback',
    },
    'Backstage',
  );

  assert.equal(copy.kind, 'generic');
  assert.equal(copy.appName, 'Other integration');
  assert.equal(copy.title, 'Review authorization request');
  assert.equal(copy.approveLabel, 'Authorize');
  assert.equal(copy.detailLabel, 'Callback URL');
});
