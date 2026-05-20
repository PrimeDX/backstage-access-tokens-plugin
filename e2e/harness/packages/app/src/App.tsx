import { createApp } from '@backstage/frontend-defaults';
import accessTokensPlugin, {
  personalAccessTokensAuthPlugin,
} from '@primedx/plugin-access-tokens';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { navModule } from './modules/nav';

export default createApp({
  features: [personalAccessTokensAuthPlugin, catalogPlugin, accessTokensPlugin, navModule],
});
