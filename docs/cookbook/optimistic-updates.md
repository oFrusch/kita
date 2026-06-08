# Optimistic updates

Optimistic updates apply a change to the UI immediately, then reconcile with the server — rolling back if the request fails. kita gives you two levels: a generic primitive and record-level store helpers.

## The primitive: `withOptimisticUpdate`

[`withOptimisticUpdate`](/api/utilities#withoptimisticupdate) wraps any optimistic action with automatic rollback. You supply three functions:

1. **optimistic action** — mutate state now, return a snapshot for rollback
2. **server action** — the real request
3. **rollback** — restore from the snapshot if the server action throws

```ts
import { withOptimisticUpdate } from "@ofrusch/kita";

await withOptimisticUpdate(
  () => {
    const snapshot = { votes: item.votes };
    item.votes += 1; // UI updates instantly
    return snapshot;
  },
  () => api.post(`/items/${item.id}/vote`),
  (snapshot) => {
    item.votes = snapshot.votes; // rolled back on error
  },
);
```

The server action's resolved value is returned; on rejection, rollback runs and the error re-throws so callers can still `try/catch`.

## Record-level helpers

`AsyncStore` exposes three helpers built on the primitive for the common create/update/delete cases. Each mutates the local store immediately and reconciles with the server.

### `optimisticUpdate`

Applies field changes to the cached record right away, then PUTs:

```ts
item.title = "Edited title";
await itemStore.optimisticUpdate(item);
// on failure, the previous field values are restored
```

### `optimisticCreate`

Inserts the record under a temporary id immediately, then POSTs and swaps in the server's version:

```ts
const draft = ItemModel.create({ title: "New item" }); // no id → isNew
await itemStore.optimisticCreate(draft);
// rolled back (removed) if the POST fails
```

### `optimisticDelete`

Removes the record from the store immediately, then DELETEs — restoring it at its original index on failure:

```ts
await itemStore.optimisticDelete(item);
```

## When to reach for which

- **Single field on an arbitrary object** (a counter, a toggle) → `withOptimisticUpdate`.
- **A record's CRUD lifecycle** → the store helpers; they handle store membership and id-swapping for you.

For non-optimistic writes, just use [`save`](/api/stores#save) / [`delete`](/api/stores#delete) (or `model.save()` / `model.delete()`), which await the server before touching local state.

## See also

- [`withOptimisticUpdate`](/api/utilities#withoptimisticupdate)
- [`AsyncStore.optimisticCreate` / `optimisticUpdate` / `optimisticDelete`](/api/stores#optimisticcreate)
