# Validation (zod / valibot)

kita assumes API responses match a model's declared fields. It does **no** runtime validation — if the API drifts, you get `undefined` reads rather than an error at the kita layer (see [Architecture → not kita's concern](/guide/architecture#things-that-aren-t-kita-s-concern)). When you want a hard guarantee, validate at the store boundary.

There are two boundaries worth guarding: **responses** coming in, and **payloads** going out.

## Where to validate

The cleanest seam is the protected fetch path. `AsyncStore` exposes `_fetchAndCacheRecord` and you can wrap `findRecords` in your subclass, parsing before records are constructed.

### Validating a single record with zod

```ts
import { z } from "zod";
import { AsyncModel, AsyncStore, registerModel } from "@ofrusch/kita";

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});

class UserModel extends AsyncModel {
  static readonly id = "users";
  static { registerModel(this); }
  declare email: string;
  declare name: string;
}

class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";

  async findRecord(id: string, params = {}) {
    const { data } = await this.client.get(`/users/${id}/`, { params });
    const parsed = userSchema.parse(data); // throws ZodError on drift
    return this._pushRecord(UserModel.create(parsed));
  }
}
```

Overriding `findRecord` here trades away the base class's request-dedup and cache merge for an explicit, validated path. Keep the override thin if you still want those — call `super.findRecord` and validate around it, or validate inside a custom method.

### Validating a list

```ts
const userListSchema = z.array(userSchema);

class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";

  async loadAll(params = {}) {
    const { records } = await this.findRecords(params);
    return userListSchema.parse(records.map((r) => ({ ...r })));
  }
}
```

## Same thing with valibot

valibot's tree-shakeable, function-style API:

```ts
import * as v from "valibot";

const UserSchema = v.object({
  id: v.string(),
  email: v.pipe(v.string(), v.email()),
  name: v.string(),
});

class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";

  async findRecord(id: string, params = {}) {
    const { data } = await this.client.get(`/users/${id}/`, { params });
    const parsed = v.parse(UserSchema, data); // throws on drift
    return this._pushRecord(UserModel.create(parsed));
  }
}
```

## Validating outgoing payloads

To catch bad writes before they hit the network, validate in a `save` override:

```ts
class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";

  async save(record: UserModel) {
    userSchema.partial({ id: true }).parse({ ...record }); // id optional for new records
    return super.save(record);
  }
}
```

## Validate inside the HTTP client instead

If you'd rather not subclass per store, fold validation into a [custom HTTP client](/cookbook/custom-http-client) — parse in a per-route map, or attach a schema registry keyed by URL. That centralizes validation but couples the client to your schemas; the store-boundary approach above keeps each resource's contract next to its store.

## Deriving the model type from the schema

Avoid declaring fields twice by inferring the field types from the schema:

```ts
type UserFields = z.infer<typeof userSchema>;

class UserModel extends AsyncModel implements Omit<UserFields, "id"> {
  static readonly id = "users";
  static { registerModel(this); }
  declare email: string;
  declare name: string;
}
```

## See also

- [Custom HTTP client](/cookbook/custom-http-client)
- [`AsyncStore`](/api/stores#asyncstore) — `_fetchAndCacheRecord`, `findRecords`, `save`
- [zod](https://zod.dev/) · [valibot](https://valibot.dev/)
