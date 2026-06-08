# kita playground

A Vue 3 + Vite app for testing kita changes locally. Edits to `../src/` HMR into this app instantly — no build step.

## Run it

From the kita repo root:

```bash
pnpm play
```

…or from this directory:

```bash
pnpm dev
```

Either opens a browser at <http://localhost:5174>.

## What it demonstrates

| Feature | Where to look |
|---|---|
| `@reactive` decorator | `src/stores/UserStore.ts` (the `lastError` accessor) |
| Model + Store registration via `static { registerModel(this) }` | `src/models/UserModel.ts`, `src/models/TodoModel.ts` |
| `createAndRegisterStore` + Vue plugin install | `src/stores/application-store.ts`, `src/main.ts` |
| `AsyncStore.createPaginatedQuery` + `loadMore` | `src/components/UserList.vue` |
| `AsyncStore.findRecord` cache hits | `UserList.vue` — clicking a user a second time skips the network |
| `AsyncStoreSWR` (opt-in stale-while-revalidate) | `src/stores/TodoStore.ts` |
| `optimisticUpdate` (instant UI + rollback) | `src/components/TodoEditor.vue` toggle handler |
| `optimisticDelete` | `TodoEditor.vue` delete handler |
| `AsyncModel.save()` (POST when new, PUT when existing) | `TodoEditor.vue` `addTodo` |
| Vue DevTools panel | Open DevTools → Inspectors → "Data Store" |

## Files

```
playground/
├── index.html
├── vite.config.ts          # SWC for Stage 3 decorators + alias @ofrusch/kita → ../src
├── tsconfig.json           # paths → ../src for editor IntelliSense
└── src/
    ├── main.ts
    ├── App.vue
    ├── mocks/
    │   └── mockClient.ts   # in-memory HttpClient with 200ms latency
    ├── models/
    │   ├── UserModel.ts
    │   └── TodoModel.ts
    ├── stores/
    │   ├── UserStore.ts          # AsyncStore<UserModel>
    │   ├── TodoStore.ts          # AsyncStoreSWR<TodoModel>
    │   └── application-store.ts
    └── components/
        ├── UserList.vue
        ├── TodoEditor.vue
        └── DevtoolsHint.vue
```

## Extending the playground

When you add a new feature to kita, mirror it here so it's easy to manually verify and so future contributors have a reference. Two common patterns:

### Add a new model + store

1. Create `src/models/FooModel.ts` extending `AsyncModel` (or `Model` for sync-only).
2. Create `src/stores/FooStore.ts` extending `AsyncStore<FooModel>` (or `AsyncStoreSWR<FooModel>` for SWR).
3. Add `FooStore` to the array in `src/stores/application-store.ts` and add a declared field on `AppStore`.
4. Extend `src/mocks/mockClient.ts` to handle `/foos/` routes (look at the user/todo handlers for the pattern).

### Add a new demo component

1. Create `src/components/FooDemo.vue`.
2. Import `useStore` from `../stores/application-store` and access `foos` (or whatever your store is called).
3. Add it to `src/App.vue` inside a new `<section>` so it lives alongside the other demos.

## How the workspace link works

The vite config has:

```ts
resolve: {
  alias: {
    "@ofrusch/kita": resolve(__dirname, "../src/index.ts"),
  },
}
```

So when playground code says `import { AsyncStore } from "@ofrusch/kita"`, vite resolves it to the kita source directly — no dist/, no transpile-and-link cycle. The pnpm workspace dep (`"@ofrusch/kita": "workspace:^"`) handles type/module resolution for tools that don't read vite's alias (notably `vue-tsc` and editor LSPs), with `tsconfig.json#paths` providing the same hop at the type level.

## Notes on the mock client

The mock satisfies the `HttpClient` interface kita expects (`get` / `post` / `put` / `delete` returning `{ data }`). Each method takes a decorative `<T>` and casts the concrete return to `HttpResponse<T>` — this is the standard pattern for implementing the generic contract; axios's own type defs do the same.

The 200ms latency is intentional. It makes loading states observable when clicking around, and gives you time to see optimistic updates flash before the server confirms.
