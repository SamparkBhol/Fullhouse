export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(prefix: string, limit?: number): Promise<Map<string, T>>;
  deleteAll(): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export function doStore(storage: DurableObjectStorage): Store {
  return {
    get: <T>(key: string) => storage.get<T>(key),
    put: (key, value) => storage.put(key, value),
    delete: (key) => storage.delete(key),
    list: <T>(prefix: string, limit?: number) => storage.list<T>(limit ? { prefix, limit } : { prefix }),
    deleteAll: () => storage.deleteAll(),
    getAlarm: () => storage.getAlarm(),
    setAlarm: (at) => storage.setAlarm(at),
    deleteAlarm: () => storage.deleteAlarm(),
  };
}

export class MemoryStore implements Store {
  readonly data = new Map<string, unknown>();
  alarm: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    const v = this.data.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }
  async list<T>(prefix: string, limit?: number): Promise<Map<string, T>> {
    const keys = [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
    const out = new Map<string, T>();
    for (const k of keys.slice(0, limit ?? keys.length)) out.set(k, structuredClone(this.data.get(k)) as T);
    return out;
  }
  async deleteAll(): Promise<void> {
    this.data.clear();
  }
  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }
  async setAlarm(at: number): Promise<void> {
    this.alarm = at;
  }
  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }
}
