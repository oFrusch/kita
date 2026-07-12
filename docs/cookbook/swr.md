# Stale-while-revalidate

[`AsyncStoreSWR`](/api/stores#asyncstoreswr) is an opt-in variant of `AsyncStore` that adds per-record freshness tracking to `findRecord`: return cached data immediately, then refetch in the background when it's stale.

If you don't need freshness semantics, extend [`AsyncStore`](/api/stores#asyncstore) — it has a smaller surface and simpler typing.

## Opting in

Extend `AsyncStoreSWR` instead of `AsyncStore`. Everything else is identical:

```ts
import { AsyncStoreSWR } from "@ofrusch/kita";

class UserStore extends AsyncStoreSWR<UserModel> {
  static readonly id = "users";
}
```

## `findRecord` with `staleTime`

`staleTime` is how long (ms) a record stays "fresh". The third argument is a [`FindRecordOptions`](/api/types#findrecordoptions) object:

```ts
// Fresh and < 30s old → returns instantly, no request.
// Older than 30s → returns the cached record AND refetches in the background.
// Not cached → awaits the fetch.
await users.findRecord("u-1", {}, { staleTime: 30_000 });
```

The background refetch is fire-and-forget and deduplicated by the store's request tracker, so rapid calls don't stack up network requests.

## Forcing revalidation

Pass `revalidate: true` to always kick off a background refetch, regardless of `staleTime`:

```ts
// Returns cached instantly (if present), refetches in the background.
await users.findRecord("u-1", {}, { revalidate: true });
```

The legacy boolean form (`findRecord(id, params, true)`) maps to `{ revalidate: true }` and is still supported.

## When a background refresh fails

A failed background revalidation is non-fatal by design: the caller already has the stale record, and because the freshness timestamp is only stamped on success, the record stays stale and the next `findRecord` retries. The rejection is swallowed rather than escaping as an unhandled promise rejection.

To surface it — to a logger, Sentry, a toast — override the protected `onRevalidationError` hook, which is a no-op by default:

```ts
class UserStore extends AsyncStoreSWR<UserModel> {
  static readonly id = "users";

  protected onRevalidationError(error: unknown, id: string) {
    Sentry.captureException(error, { tags: { store: "users", recordId: id } });
  }
}
```

The hook fires once per background revalidation, not once per caller — two components asking for the same stale record share one refresh, so a failure reports once, not twice. If your override throws, the error is swallowed: a broken reporter shouldn't resurrect the crash the hook is there to prevent.

This applies to the *background* path only. When there's no cached record, `findRecord` awaits the fetch and a rejection propagates to the caller as normal — the hook is not invoked.

## Manually marking stale

Drop a record's freshness timestamp so the next `findRecord` refetches — without removing it from the cache:

```ts
users.invalidateRecord("u-1");
users.isRecordStale("u-1", 30_000); // true
```

## How it works

`AsyncStoreSWR` overrides exactly two methods: `findRecord` (adds the staleTime branch) and the protected `_fetchAndCacheRecord` (stamps a timestamp after the base fetch). This is the canonical extension pattern — a `RetryStore` or `ThrottledStore` would follow the same shape. See [Architecture → AsyncStoreSWR override strategy](/guide/architecture#asyncstoreswr-override-strategy).

## See also

- [`AsyncStoreSWR`](/api/stores#asyncstoreswr) — `isRecordStale`, `invalidateRecord`, [`onRevalidationError`](/api/stores#onrevalidationerror)
- [`FindRecordOptions`](/api/types#findrecordoptions)
- Non-SWR caching: [`AsyncStore.findRecords`](/api/stores#findrecords) uses a TTL [`QueryCache`](/api/utilities#querycache) for list queries.
