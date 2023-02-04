import { Config } from './types';
import { isNil, parseConfig } from './helpers';

interface StaleWhileRevalidate<T> {
  (cacheKey: string, fn: () => Promise<T>): Promise<T>;
}

export function createStaleWhileRevalidateCache<T>(config: Config<T>): StaleWhileRevalidate<T> {
  const { storage, minTimeToStale, maxTimeToLive, serialize, deserialize } = parseConfig(config);

  async function persistValue(key: string, result: T) {
    try {
      await Promise.resolve(
        storage.setItem(
          key,
          serialize({
            cachedTime: Date.now().toString(),
            data: result,
          })
        )
      );
    } catch (error) {}
  }

  async function retrieveCachedValue(key: string) {
    try {
      const item = await Promise.resolve(storage.getItem(key));

      if (isNil(item)) {
        return { cachedValue: null, cachedAge: 0 };
      }

      const { data, cachedTime } = deserialize(item);
      const now = Date.now();
      const cachedAge = now - Number(cachedTime);

      if (cachedAge > maxTimeToLive) {
        await Promise.resolve(storage.del(key)).catch(() => {});
      }

      return { cachedValue: cachedAge > maxTimeToLive ? null : data, cachedAge };
    } catch (error) {
      return { cachedValue: null, cachedAge: 0 };
    }
  }

  async function revalidate(key: string, fn: () => Promise<T>) {
    try {
      const result = await fn();

      // Intentionally persisting asynchronously and not blocking since there is
      // in any case a chance for a race condition to occur when using an external
      // persistence store, like Redis, with multiple consumers. The impact is low.
      persistValue(key, result);

      return result;
    } catch (error) {
      throw error;
    }
  }

  const staleWhileRevalidate: StaleWhileRevalidate<T> = async (cacheKey, fn) => {
    const key = cacheKey;

    const { cachedValue, cachedAge } = await retrieveCachedValue(key);

    if (!isNil(cachedValue)) {
      if (cachedAge >= minTimeToStale) {
        // Non-blocking so that revalidation runs while stale cache data is returned
        // Error handled in `revalidate` by emitting an event, so only need a no-op here
        revalidate(cacheKey, fn).catch(() => {});
      }

      return cachedValue;
    }

    return revalidate(cacheKey, fn);
  };

  return staleWhileRevalidate;
}

export function createSWRFunction<TResult>(
  swr: StaleWhileRevalidate<TResult>,
  fnProps: { fn: () => Promise<TResult>; storeKey: string; refreshIntervalMs: number }
) {
  const { fn, storeKey, refreshIntervalMs } = fnProps;

  let fetchPromise: null | Promise<TResult>;

  async function exec() {
    if (!fetchPromise) {
      fetchPromise = swr(storeKey, fn);
    }

    const result = await fetchPromise;
    fetchPromise = null;
    return result;
  }

  setInterval(() => exec().catch(() => {}), refreshIntervalMs);

  return exec;
}
