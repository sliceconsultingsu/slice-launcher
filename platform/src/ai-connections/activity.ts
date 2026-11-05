/** When each connected AI app last used Slice and last renewed its sign-in. */
export type Activity = { lastUsedAt: string | null; renewedAt: string | null };

/** Last use is written at most this often per grant, so busy apps do not write KV on every call. */
const TOUCH_INTERVAL_MS = 5 * 60_000;
const empty: Activity = { lastUsedAt: null, renewedAt: null };

/**
 * Activity records live in the OAuth KV namespace under a Slice-owned prefix, next to the
 * library's grants. Keys use the grant's digest user ID, never an email or Access subject.
 */
export class ActivityStore {
  constructor(
    private readonly kv: KVNamespace,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(userId: string, grantId: string): Promise<Activity> {
    const stored = await this.kv.get(key(userId, grantId));
    if (!stored) return { ...empty };
    const value = JSON.parse(stored) as Partial<Activity>;
    return { lastUsedAt: value.lastUsedAt ?? null, renewedAt: value.renewedAt ?? null };
  }

  async touch(userId: string, grantId: string): Promise<void> {
    const current = await this.get(userId, grantId);
    const now = this.now();
    if (current.lastUsedAt && now.getTime() - Date.parse(current.lastUsedAt) < TOUCH_INTERVAL_MS)
      return;
    await this.put(userId, grantId, { ...current, lastUsedAt: now.toISOString() });
  }

  async renewed(userId: string, grantId: string): Promise<void> {
    const current = await this.get(userId, grantId);
    await this.put(userId, grantId, { ...current, renewedAt: this.now().toISOString() });
  }

  async remove(userId: string, grantId: string): Promise<void> {
    await this.kv.delete(key(userId, grantId));
  }

  private put(userId: string, grantId: string, value: Activity) {
    return this.kv.put(key(userId, grantId), JSON.stringify(value));
  }
}

const key = (userId: string, grantId: string) => `slice-activity:${userId}:${grantId}`;
