# Decorators

## `reactive`

```ts
function reactive(_defaultValue?: unknown): ClassAccessorDecorator;
```

A Stage 3 **accessor** decorator that backs a class field with a Vue `ref()`, making it fully reactive. Import from `@ofrusch/kita`.

```ts
import { reactive, Store } from "@ofrusch/kita";

class FilterStore extends Store<FilterModel> {
  @reactive() accessor query: string = "";
  @reactive() accessor selectedTags: string[] = [];
}
```

Reads and writes go through the ref, so reactive properties drive `computed`, `watch`, and component re-renders exactly like a normal ref.

### Usage rules

- Use the `accessor` keyword (Stage 3 decorators) — not a plain field.
- Provide the initial value with a field initializer (`= ""`, `= []`). The decorator's `init` hook captures it.
- The decorator **argument is ignored** — it exists only for backward compatibility with the legacy `@reactive(value)` form. The initial value always comes from the initializer.

### How it works

Each decorated property keeps a per-instance `Ref` in a `WeakMap` keyed by the instance. This is deliberate: a naive implementation that closes over a single `ref` in the decorator factory would **share** that ref across every instance of the class — a real bug the `WeakMap` avoids. See [Architecture → the @reactive decorator](/guide/architecture#the-reactive-decorator).

### When you need it

A store's `records` array is already reactive. Reach for `@reactive` only for **additional** custom state on a store or model — a search query, a selection, a UI flag:

```ts
class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";

  @reactive() accessor currentUser: UserModel | null = null;
}
```

### Requirements

Native Stage 3 decorators need TypeScript 5.0+ with `experimentalDecorators` **off** (the default). kita does not support the legacy `experimentalDecorators` path.

## See also

- [Core concepts → reactivity](/guide/core-concepts#reactivity)
- [Stores](/api/stores)
