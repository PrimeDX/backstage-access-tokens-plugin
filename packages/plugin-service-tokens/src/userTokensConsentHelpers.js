const USER_TOKENS_MINT_CALLBACK_PATH =
  '/api/service-tokens/personal/tokens/mint/callback';

const DEFAULT_APP_TITLE = 'Backstage';

export function isUserTokensConsentSession(session) {
  return (
    typeof session?.redirectUri === 'string' &&
    session.redirectUri.includes(USER_TOKENS_MINT_CALLBACK_PATH)
  );
}

export function buildConsentCopy(session, appTitle = DEFAULT_APP_TITLE) {
  if (isUserTokensConsentSession(session)) {
    return {
      kind: 'user-tokens',
      appName: session.clientName ?? 'Personal access tokens',
      title: 'Create personal access token',
      subtitle: `Create a token for your ${appTitle} account`,
      body:
        'This creates a token for your signed-in user. Scripts can exchange it for short-lived Backstage API tokens until it expires or you revoke it.',
      detailLabel: 'Return URL',
      detailValue: session.redirectUri,
      approveLabel: 'Create token',
      approvingLabel: 'Creating token...',
      cancelLabel: 'Cancel',
      approvedTitle: 'Token approved',
      rejectedTitle: 'Token canceled',
    };
  }

  const appName = session?.clientName ?? session?.clientId ?? 'Application';
  return {
    kind: 'generic',
    appName,
    title: 'Review authorization request',
    subtitle: `${appName} wants access to your ${appTitle} account`,
    body:
      `Review this request before continuing. If you approve, ${appName} can receive a token for your ${appTitle} account.`,
    detailLabel: 'Callback URL',
    detailValue: session?.redirectUri,
    approveLabel: 'Authorize',
    approvingLabel: 'Authorizing...',
    cancelLabel: 'Cancel',
    approvedTitle: 'Authorization approved',
    rejectedTitle: 'Authorization canceled',
  };
}
