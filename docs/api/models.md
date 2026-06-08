# Models

A model is a class whose fields mirror an API resource. Import from `@ofrusch/kita`. Each model has a `static readonly id` matching its store's id.

[[toc]]

## `AbstractModel`

```ts
abstract class AbstractModel {
  static id: string; // "base"
  readonly id: string;
  constructor(params: Record<string, unknown>);
  get stores(): ApplicationStore;
  toString(): string;
  serialize(removeKeys?: string[]): string;
}
```

The shared base of [`Model`](#model) and [`AsyncModel`](#asyncmodel). The constructor `Object.assign`s `params` onto the instance.

- **`stores`** — the global [`ApplicationStore`](/api/application-store), for reaching sibling stores from a model getter.
- **`toString()`** — returns `id`; used by the DevTools tree labels.
- **`serialize(removeKeys?)`** — `JSON.stringify` of the record, always dropping the internal `store` / `stores` back-references, plus any keys in `removeKeys`.

```ts
user.serialize();             // own fields, minus store/stores
user.serialize(["password"]); // also omit password
```

## `Model`

```ts
class Model extends AbstractModel {
  store: Store<this>;
  get isNew(): boolean;
  static create<T, U>(params?: U): T & U;
}
```

A synchronous model — no HTTP. Pair with [`Store`](/api/stores#store).

- **`isNew`** — `!this.id`; true until the record has an id.
- **`create(params)`** — constructs an instance and merges `params`. Uses polymorphic `this`, so `FilterModel.create({ q: "x" })` returns `FilterModel & { q: string }`.

```ts
class FilterModel extends Model {
  static readonly id = "filters";
}
const f = FilterModel.create({ q: "vue" });
```

## `AsyncModel`

```ts
class AsyncModel extends AbstractModel {
  store: AsyncStore<this>;
  get isNew(): boolean;
  get stores(): ApplicationStore;
  save(): Promise<void>;
  update(patch: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  static create<T, U>(params?: U): T & U;
}
```

An HTTP-backed model. Pair with [`AsyncStore`](/api/stores#asyncstore).

### `create(params)`

Constructs the record, merges `params`, looks up its store from the [registry](/guide/core-concepts#the-registry-links-models-to-stores), and pushes itself in. Returns `T & U` via polymorphic `this`. Logs an error (doesn't throw) if no store is registered for the model's id.

```ts
const user = UserModel.create({ id: "u-1", email: "a@b.com" });
// → UserModel & { id: string; email: string }, pushed into UserStore
```

### `save()`

Persists via the store (`store.save(this)` — POST when `isNew`, else PUT) and merges the server response back onto the instance. Throws if the model has no store.

```ts
user.email = "new@example.com";
await user.save();
```

### `update(patch)`

Convenience for `Object.assign(this, patch); await this.save()`:

```ts
await user.update({ email: "new@example.com" });
```

### `delete()`

Deletes via `store.delete(this)`. Throws if the model has no store.

```ts
await user.delete();
```

## `registerModel`

```ts
function registerModel<T extends typeof AsyncModel | typeof Model>(modelClass: T): void;
```

Registers a model class in the global registry so `create()` and `save()` can resolve its store. Call it in a `static {}` initialization block:

```ts
class UserModel extends AsyncModel {
  static readonly id = "users";
  static { registerModel(this); }
}
```

## `connectToStore` (deprecated)

```ts
function connectToStore<T extends typeof AsyncModel>(cls: T): void;
```

::: warning Deprecated
Use [`registerModel(this)`](#registermodel) in a `static {}` block instead. `connectToStore` will be removed in a future major release.
:::

The legacy decorator form of registration, kept for backward compatibility.

## See also

- [Core concepts](/guide/core-concepts) · [Pairing with a backend ORM](/guide/backend-orm)
- [Stores](/api/stores) · [Decorators](/api/decorators)
