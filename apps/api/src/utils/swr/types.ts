export interface Storage {
  getItem(key: string): unknown | null | Promise<unknown | null>;
  setItem(key: string, value: unknown): void | Promise<void>;
  del(key: string): void | Promise<void>;
}

export interface Item<T> {
  data: T;
  cachedTime: string;
}

export interface Config<T> {
  minTimeToStale?: number;
  maxTimeToLive?: number;
  storage?: Storage;
  serialize?: (value: Item<T>) => any;
  deserialize?: (value: any) => Item<T>;
}
