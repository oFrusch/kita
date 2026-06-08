---
layout: home

hero:
  name: kita
  text: A frontend ORM for Vue 3
  tagline: Typed models, HTTP-backed stores, and a model-store registry inspired by Ember Data.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Cookbook
      link: /cookbook/pagination
    - theme: alt
      text: Playground
      link: https://kita-playground.vercel.app
    - theme: alt
      text: View on GitHub
      link: https://github.com/ofrusch/kita

features:
  - title: Frontend ORM
    details: Model and AsyncModel classes that mirror your API resources, with .save() / .delete() / relations — the same mental model as a backend ORM.
  - title: Pairs with your backend ORM
    details: API endpoints exposing typed resources land directly as typed records. No hand-rolled fetcher/setter glue per route.
  - title: Stage 3 decorators
    details: Modern @reactive() accessor syntax backed by Vue refs — no experimentalDecorators flag required.
  - title: HTTP-agnostic
    details: A duck-typed HttpClient interface. Works with axios, ky, redaxios, or any custom client that matches the shape.
  - title: Built-in helpers
    details: Request deduplication, TTL query caching, pagination, and optimistic updates ship in the box.
  - title: Opt-in SWR
    details: Stale-while-revalidate semantics on findRecord, available as a separate AsyncStoreSWR base class.
---

## Installation

```bash
pnpm add @ofrusch/kita
# or: npm install @ofrusch/kita / yarn add @ofrusch/kita
```

Peer dependency: `vue@^3.0.0`.

::: warning SPA only
kita targets client-side single-page apps. SSR and multi-app support are out of scope for `0.x` (the model-store registry is a module-level singleton). If you need SSR today, reach for [Pinia](https://pinia.vuejs.org/). See [Architecture → singleton registry](/guide/architecture#why-the-registry-is-a-module-level-singleton).
:::

## At a glance

```ts
import { AsyncModel, AsyncStore, registerModel } from "@ofrusch/kita";

class UserModel extends AsyncModel {
  static readonly id = "users";
  static { registerModel(this); }

  declare email: string;
  declare name: string;
}

class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";
}

// GET /users/u-1/ → a fully-typed UserModel instance
const user = await appStore.users.findRecord("u-1");

user.email = "new@example.com";
await user.save(); // PUT /users/u-1/
```

Continue with the [getting-started guide](/guide/getting-started).
