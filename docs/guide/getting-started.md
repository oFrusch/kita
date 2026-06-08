# Getting started

kita gives you a backend-ORM mental model on the Vue client: **model classes that mirror your API resources, with stores that fetch, cache, mutate, and relate records.** The shape your backend serializes is the shape your frontend model consumes.

This guide wires up a minimal app end to end. For the ideas behind the pieces, read [Core concepts](/guide/core-concepts) next.

## Install

```bash
pnpm add @ofrusch/kita
# or: npm install @ofrusch/kita / yarn add @ofrusch/kita
```

Peer dependency: `vue@^3.0.0`. TypeScript 5.0+ is recommended for native Stage 3 decorators.

## 1. Define a model

A model describes *what a resource is*. Register it so `Model.create()` and `model.save()` can find its store automatically.

```ts
import { AsyncModel, registerModel } from "@ofrusch/kita";

export class UserModel extends AsyncModel {
  static readonly id = "users";
  static {
    registerModel(this);
  }

  declare email: string;
  declare name: string;
}
```

The `static { registerModel(this) }` block runs once when the class is first evaluated. (`connectToStore` is the deprecated predecessor — see [Models](/api/models#connecttostore-deprecated).)

## 2. Define a store

A store describes *how to fetch, cache, and mutate* the resource. The `id` ties it to the model of the same `id`.

```ts
import { AsyncStore, reactive } from "@ofrusch/kita";
import { UserModel } from "./UserModel";

export class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";

  @reactive()
  accessor currentUser: UserModel | null = null;

  async login(email: string, password: string) {
    const res = await this.client.post("/auth/login/", { email, password });
    this.currentUser = UserModel.create(res.data);
    return this.currentUser;
  }
}
```

By default the store derives its API path from `id` (`users` → `/users/`). Override it by passing `APIUrl` — see [AsyncStore](/api/stores#asyncstore).

## 3. Wire up the application store

The [`ApplicationStore`](/api/application-store) is a container for your domain stores and a Vue plugin.

```ts
import axios from "axios";
import { ApplicationStore, createAndRegisterStore } from "@ofrusch/kita";
import { UserStore } from "./stores/UserStore";

class AppStore extends ApplicationStore {
  declare readonly users: UserStore;
}

const client = axios.create({ baseURL: "/api" });

const { appStore, useStore } = createAndRegisterStore(AppStore, [UserStore], client);

export default appStore;
export { useStore };
```

Any client matching the [`HttpClient`](/api/types#httpclient) shape works — see [Custom HTTP client](/cookbook/custom-http-client).

## 4. Install on the Vue app

```ts
import { createApp } from "vue";
import App from "./App.vue";
import appStore from "./stores/application-store";

const app = createApp(App);
app.use(appStore);
app.mount("#app");
```

## 5. Use it in components

```ts
import { computed } from "vue";
import { useStore } from "./stores/application-store";

const { users } = useStore();

const currentUser = computed(() => users.currentUser);

async function handleLogin() {
  await users.login("a@b.com", "password");
}
```

`useStore()` injects the app store via a Symbol key ([`KITA_STORE_KEY`](/api/application-store#kita_store_key)), so it never collides with other `provide`/`inject` keys.

## Next steps

- [Core concepts](/guide/core-concepts) — models, stores, the registry, record identity
- [Pairing with a backend ORM](/guide/backend-orm) — mapping Lucid/Prisma/Sequelize models
- [Cookbook](/cookbook/pagination) — pagination, optimistic updates, SWR, validation
