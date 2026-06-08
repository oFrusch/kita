# ApplicationStore

The container for your domain stores, and the Vue plugin that wires everything into the app. Import from `@ofrusch/kita`.

## `ApplicationStore`

```ts
class ApplicationStore {
  client: HttpClient;
  constructor(client: HttpClient);
  registerStore<T extends typeof Store | typeof AsyncStore>(StoreClass: T): this;
  getStore<T = Store<Model> | AsyncStore<AsyncModel>>(recordType: string): T;
  install(app: App): void;
}
```

Subclass it to declare your stores for typed access:

```ts
class AppStore extends ApplicationStore {
  declare readonly users: UserStore;
  declare readonly posts: PostStore;
}
```

You rarely instantiate it directly — use [`createStore`](#createstore) or [`createAndRegisterStore`](#createandregisterstore).

### `registerStore(StoreClass)`

Instantiates `StoreClass` with the app's client, attaches it at `this[StoreClass.id]`, and registers it in the global [registry](/guide/core-concepts#the-registry-links-models-to-stores). Returns `this` for chaining.

```ts
appStore.registerStore(UserStore).registerStore(PostStore);
appStore.users; // UserStore instance
```

### `getStore(recordType)`

Returns the registered store for a record type id. Equivalent to `appStore[recordType]`, but typed:

```ts
const users = appStore.getStore<UserStore>("users");
```

The default type parameter accepts both `Store` and `AsyncStore` subclasses.

### `install(app)`

Called by Vue when you `app.use(appStore)`. It:

1. `provide`s the store under [`KITA_STORE_KEY`](#kita_store_key) for [`useStore`](#createstore).
2. Sets `app.config.globalProperties.store` for template access and DevTools.
3. Registers the Vue DevTools plugin (dev builds only — it's [lazy-loaded](/guide/architecture) and tree-shaken out of production bundles).

```ts
createApp(App).use(appStore).mount("#app");
```

## `createStore`

```ts
function createStore<T extends typeof ApplicationStore>(
  appStoreClass: T,
  client: HttpClient,
): { appStore: InstanceType<T>; useStore: () => InstanceType<T> };
```

Creates an app store instance and a matching `useStore` inject helper, **without** registering any child stores. Use when you register stores yourself, or have none.

```ts
const { appStore, useStore } = createStore(AppStore, client);
appStore.registerStore(UserStore);
```

`useStore()` returns the store via `inject(KITA_STORE_KEY)` — call it inside `setup()`/`<script setup>`.

## `createAndRegisterStore`

```ts
function createAndRegisterStore<T extends typeof ApplicationStore>(
  appStoreClass: T,
  modelStores: Array<typeof Store | typeof AsyncStore>,
  client: HttpClient,
): { appStore: InstanceType<T>; useStore: () => InstanceType<T> };
```

Like [`createStore`](#createstore), but also registers every store in `modelStores`. The common entry point:

```ts
const { appStore, useStore } = createAndRegisterStore(
  AppStore,
  [UserStore, PostStore],
  client,
);
```

## `KITA_STORE_KEY`

```ts
const KITA_STORE_KEY: InjectionKey<ApplicationStore>;
```

The Symbol injection key the app store is provided under. `useStore` uses it internally; it's exported so advanced consumers can write their own `inject()` calls without colliding on a string key.

```ts
import { inject } from "vue";
import { KITA_STORE_KEY } from "@ofrusch/kita";

const store = inject(KITA_STORE_KEY);
```

::: tip Breaking change in 0.2.0
The provide key was the string `"store"` in 0.1.x. Update any `inject("store", …)` to `inject(KITA_STORE_KEY, …)`.
:::

## See also

- [Getting started](/guide/getting-started) · [Core concepts](/guide/core-concepts)
- [Stores](/api/stores) · [Types → HttpClient](/api/types#httpclient)
