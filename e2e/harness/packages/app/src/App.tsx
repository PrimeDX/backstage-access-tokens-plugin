import { createApp } from '@backstage/frontend-defaults';
import serviceTokensPlugin from '@primedx/plugin-service-tokens';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { navModule } from './modules/nav';

export default createApp({
  features: [catalogPlugin, serviceTokensPlugin, navModule],
});
