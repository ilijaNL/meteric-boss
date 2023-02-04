import { Config, Storage } from './types';

type Nil = null | undefined;

export const isNil = (value: any): value is Nil => typeof value === 'undefined' || value === null;

export const passThrough = <T>(value: any): T => value;

export const createMapStorage = (): Storage => {
  const cache = new Map<string, any>();
  return {
    getItem(key) {
      const item = cache.get(key);
      return item === undefined ? null : item;
    },
    setItem(key, value) {
      cache.set(key, value);
    },
    del(key) {
      cache.delete(key);
    },
  };
};

export function parseConfig<T>(config: Config<T>) {
  const storage = config.storage ?? createMapStorage();

  const minTimeToStale = config.minTimeToStale ?? 0;
  const maxTimeToLive = Math.min(config.maxTimeToLive!, Number.MAX_SAFE_INTEGER) ?? Infinity;
  const serialize = config.serialize ?? passThrough;
  const deserialize = config.deserialize ?? passThrough;

  if (minTimeToStale >= maxTimeToLive) {
    throw new Error('minTimeToStale must be less than maxTimeToLive');
  }

  return {
    storage,
    minTimeToStale,
    maxTimeToLive,
    serialize,
    deserialize,
  };
}
