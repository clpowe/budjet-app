import { ref, type Ref } from 'vue';
import type { TokenStorage } from '../types/auth.ts';

// ... (RETRY_BACKOFF, RETRY_JITTER, STORAGE_KEYS... copy all constants) ...
// ... (isNetworkError... copy from 'is-network-error' or import it) ...

// --- useNamespacedStorage -> createNamespacedStorage ---
// It's no longer a hook, just a factory function.
export function createNamespacedStorage(
  peristentStorage: TokenStorage | null,
  namespace: string,
) {
  const inMemoryStorage = createInMemoryStorage();
  const storage = peristentStorage ?? inMemoryStorage();

  const escapedNamespace = namespace.replace(/[^a-zA-Z0-9]/g, "");

  const storageKey = (key: string) => `${key}_${escapedNamespace}`;

  const storageSet = (key: string, value: string) =>
    storage.setItem(storageKey(key), value);

  const storageGet = (key: string) =>
    storage.getItem(storageKey(key));

  const storageRemove = (key: string) =>
    storage.removeItem(storageKey(key));

  return { storageSet, storageGet, storageRemove, storageKey };
}

// --- useInMemoryStorage -> createInMemoryStorage ---
// Uses `ref` instead of `useState`
function createInMemoryStorage() {
  const inMemoryStorage = ref<Record<string, string>>({});

  return () => ({
    getItem: (key) => inMemoryStorage.value[key],
    setItem: (key, value) => {
      inMemoryStorage.value = { ...inMemoryStorage.value, [key]: value };
    },
    removeItem: (key) => {
      const { [key]: _, ...rest } = inMemoryStorage.value;
      inMemoryStorage.value = rest;
    },
  }) satisfies TokenStorage;
}

// ... (browserMutex, getMutexValue, setMutexValue, etc... copy all these) ...
// ... (browserAddEventListener, browserRemoveEventListener... copy all these) ...
