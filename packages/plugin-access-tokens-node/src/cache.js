export function createTokenCache({ ttlSeconds }) {
  const store = new Map();

  return {
    get(hash) {
      const entry = store.get(hash);
      if (!entry) {
        return null;
      }

      if (Date.now() > entry.expiresAt) {
        store.delete(hash);
        return null;
      }

      return {
        subject: entry.subject,
        scopes: entry.scopes ?? [],
      };
    },
    set(hash, data) {
      store.set(hash, {
        subject: data.subject,
        scopes: data.scopes ?? [],
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
    },
    invalidate(hash) {
      store.delete(hash);
    },
    clear() {
      store.clear();
    },
  };
}
