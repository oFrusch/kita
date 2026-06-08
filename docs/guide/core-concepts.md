# Core concepts

kita has three moving parts: **models**, **stores**, and the **registry** that links them. Understanding how they relate makes the rest of the API obvious.

## Models describe a resource

A model is a class whose fields mirror an API resource. Use `declare` for fields the server owns — they exist at runtime but kita doesn't initialize them.

```ts
import { AsyncModel, registerModel } from "@ofrusch/kita";

class UserModel extends AsyncModel {
  static readonly id = "users";
  static { registerModel(this); }

  declare email: string;
  declare name: string;

  // Computed properties are just getters.
  get displayName() {
    return this.name || this.email;
  }
}
```

Two model bases:

- [`Model`](/api/models#model) — synchronous, in-memory only. No HTTP.
- [`AsyncModel`](/api/models#asyncmodel) — adds `save()`, `update(patch)`, and `delete()`, which route through the model's store.

Both extend [`AbstractModel`](/api/models#abstractmodel), which provides `serialize()`, `toString()`, and the `stores` accessor.

### Record identity

Records are keyed by `id`. When the same `id` comes back from the API, kita merges the new data into the **existing** object via `Object.assign` rather than replacing it — so a `ref` or `computed` holding that record keeps pointing at the same instance and stays reactive.

`isNew` is simply `!this.id`: a record with no id hasn't been persisted yet. `save()` POSTs new records and PUTs existing ones.

## Stores describe how to fetch and cache

A store owns a collection of records of one model type and the operations over them.

- [`Store`](/api/stores#store) — sync, in-memory. Good for client-only state (filters, UI selections).
- [`AsyncStore`](/api/stores#asyncstore) — HTTP CRUD with `findRecord`, `findRecords`, `save`, `delete`, request dedup, query caching, optimistic helpers, and pagination.
- [`AsyncStoreSWR`](/api/stores#asyncstoreswr) — `AsyncStore` plus stale-while-revalidate freshness tracking.

A store reaches sibling stores through `this.stores`, which is the [`ApplicationStore`](/api/application-store):

```ts
class PostStore extends AsyncStore<PostModel> {
  static readonly id = "posts";

  authorOf(post: PostModel) {
    return this.stores.users.peekRecord(post.userId);
  }
}
```

### Public vs. protected CRUD

Consumer code calls the **public** `store.save(record)` / `store.delete(record)` (or `model.save()` / `model.delete()`). The HTTP verbs underneath — `_createRecord`, `_updateRecord`, `_deleteRecord` — are `protected`, so subclasses can override them but app code can't reach around the routing logic.

## The registry links models to stores

`ModelStoreRegistry` is a module-level singleton. It's what lets `UserModel.create({ id: "1" })` find `UserStore` and push itself in — without you passing the store around.

```ts
const user = UserModel.create({ id: "u-1", email: "a@b.com" });
// internally: store = registry.getStore("users"); store._pushRecord(user)
```

This is a deliberate trade-off: a trivial developer API in exchange for global state. It's also why kita is **SPA-only** for `0.x` — two `ApplicationStore` instances would share one registry. See [Architecture → singleton registry](/guide/architecture#why-the-registry-is-a-module-level-singleton).

## Reactivity

State you want Vue to track lives behind the [`@reactive()`](/api/decorators#reactive) accessor decorator:

```ts
import { reactive, Store } from "@ofrusch/kita";

class FilterStore extends Store<FilterModel> {
  @reactive() accessor query: string = "";
  @reactive() accessor selectedTags: string[] = [];
}
```

Reads and writes go through a Vue `ref()` (one per instance, via a `WeakMap`), so `@reactive` properties drive `computed`, `watch`, and re-renders exactly like a normal ref. A store's `records` array is already reactive — you only need `@reactive` for extra custom state.

## Where to go next

- [Pairing with a backend ORM](/guide/backend-orm)
- [Architecture](/guide/architecture) — the request lifecycle, the registry, the SWR override strategy
- [API reference](/api/application-store)
