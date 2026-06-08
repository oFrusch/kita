# Pairing with a backend ORM

kita is designed to mirror a backend ORM resource on the client. When your backend already enforces a model (via Lucid, Prisma, Sequelize, Django, etc.), you describe the *same model* on the frontend in ~10 lines, and the serialized shape flows straight through.

## A matched pair

```ts
// backend (AdonisJS Lucid)
export default class User extends BaseModel {
  @column({ isPrimary: true }) declare id: string;
  @column() declare email: string;
  @column() declare displayName: string;
  @hasMany(() => Post) declare posts: HasMany<typeof Post>;
}

// frontend (kita)
export class UserModel extends AsyncModel {
  static readonly id = "users";
  static { registerModel(this); }

  declare email: string;
  declare displayName: string;

  get posts() {
    return this.stores.posts.records.filter((p) => p.userId === this.id);
  }
}
```

The route `GET /users/:id` returning the Lucid model's `.toJSON()` lands as a fully-typed `UserModel` via `users.findRecord(id)`. Saving works in reverse — `user.displayName = "…"; await user.save();` issues a `PUT /users/:id/` with the serialized fields.

## Relations

kita intentionally ships **no** `@hasMany` / `@belongsTo`. You get the registry, so you wire relations yourself with a getter that reads sibling stores:

```ts
class PostModel extends AsyncModel {
  static readonly id = "posts";
  static { registerModel(this); }

  declare userId: string;

  get author() {
    return this.stores.users.peekRecord(this.userId);
  }
}
```

`peekRecord` reads the local cache without fetching. If the related record may not be loaded yet, fetch it:

```ts
get author() {
  return this.stores.users.findRecord(this.userId); // returns a Promise
}
```

You decide how clever to be — memoize, cache, or fetch eagerly in the parent's load.

## Serialization

`AbstractModel.serialize()` JSON-stringifies the record, dropping the internal `store` / `stores` back-references. Pass extra keys to omit:

```ts
user.serialize();                 // all own fields except store/stores
user.serialize(["password"]);     // also drop password
```

`AsyncStore.save()` calls `serialize()` for you on the request body, so you rarely call it directly.

## What kita leaves to you

Pairing cleanly with a backend means kita deliberately stays out of concerns your backend (or another library) already owns:

- **Schema validation** — assume responses match declared fields, or validate at the boundary. See [Validation](/cookbook/validation).
- **Authentication** — bake it into your [HTTP client](/cookbook/custom-http-client) (an axios interceptor, a fetch wrapper).
- **Persistence across reloads** — records live in memory; layer offline/restore on top if you need it.

See [Architecture → things that aren't kita's concern](/guide/architecture#things-that-aren-t-kita-s-concern) for the reasoning.
