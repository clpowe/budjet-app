import { describe, it, expect } from 'vitest';
import { createNamespacedStorage } from '../../shared/utils/auth-helpers';
import type { TokenStorage } from '../../shared/types/auth';

const makeFakeStorage = () => {
  const backing: Record<string, string | undefined> = {};
  const storage: TokenStorage = {
    getItem: (key) => backing[key],
    setItem: (key, value) => {
      backing[key] = value;
    },
    removeItem: (key) => {
      delete backing[key];
    },
  };
  return { backing, storage };
};

describe('createNamespacedStorage', () => {
  it('escapes the namespace and prefixes keys for the provided storage', () => {
    const { backing, storage } = makeFakeStorage();
    const storageApi = createNamespacedStorage(storage, 'my app!');

    storageApi.storageSet('token', 'abc123');

    expect(backing['token_myapp']).toBe('abc123');
    expect(storageApi.storageGet('token')).toBe('abc123');
    storageApi.storageRemove('token');
    expect(backing['token_myapp']).toBeUndefined();
    expect(storageApi.storageKey('token')).toBe('token_myapp');
  });

  it('falls back to in-memory storage when no storage is provided', () => {
    const storageApi = createNamespacedStorage(null, 'ns');

    storageApi.storageSet('foo', 'bar');
    expect(storageApi.storageGet('foo')).toBe('bar');
    storageApi.storageRemove('foo');
    expect(storageApi.storageGet('foo')).toBeUndefined();
  });
});
