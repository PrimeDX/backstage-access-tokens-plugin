---
'@primedx/plugin-access-tokens-node': patch
---

Include `src/resolveTokenScopes.js` in the npm publish manifest. The file is imported by `module.js` and `index.js` but was omitted from `package.json` `files`, causing `ERR_MODULE_NOT_FOUND` for npm consumers since the initial release.
