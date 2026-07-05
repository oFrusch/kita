import { expectTypeOf, test } from "vitest";
import { ApplicationStore, createStore } from "../src/application-store";
import type { HttpClient } from "../src/http";
import { AsyncModel } from "../src/models";
import { AsyncStore } from "../src/stores";
import { createMockClient } from "./helpers";

/**
 * Type-level tests for the optional `TClient` parameter added in #12.
 *
 * These assertions are enforced at compile time by `pnpm typecheck` (tsc
 * type-checks `tests/`). Under `vitest` they run as harmless no-ops —
 * `expectTypeOf` has no runtime effect. `RichClient` stands in for a concrete
 * client (e.g. an `AxiosInstance`) that carries members beyond the minimal
 * `HttpClient` surface — here, an axios-style `timeout`. Fixtures reuse the
 * shared `createMockClient()` helper so no test-level type assertions are needed.
 */
interface RichClient extends HttpClient {
  readonly timeout: number;
}

test("AsyncStore<T, TClient> types `this.client` as TClient", () => {
  class RichStore extends AsyncStore<AsyncModel, RichClient> {
    check() {
      expectTypeOf(this.client).toEqualTypeOf<RichClient>();
    }
  }
  const richClient: RichClient = { ...createMockClient(), timeout: 0 };
  new RichStore(richClient, { APIUrl: "rich" }).check();
});

test("AsyncStore<T> keeps the minimal HttpClient by default", () => {
  class DefaultStore extends AsyncStore<AsyncModel> {
    check() {
      expectTypeOf(this.client).toEqualTypeOf<HttpClient>();
    }
  }
  new DefaultStore(createMockClient(), { APIUrl: "default" }).check();
});

test("createStore ties the injected client to the ApplicationStore class", () => {
  class RichApp extends ApplicationStore<RichClient> {}
  class BareApp extends ApplicationStore {}

  const richClient: RichClient = { ...createMockClient(), timeout: 0 };
  const minimalClient = createMockClient();

  // A client matching the class's declared TClient is accepted.
  createStore(RichApp, richClient);

  // @ts-expect-error — a minimal client lacks RichClient's `timeout`.
  createStore(RichApp, minimalClient);

  // A bare subclass (TClient defaulted to HttpClient) accepts any conforming
  // client, including a richer one — the backward-compatible widening case.
  createStore(BareApp, richClient);

  // The default ApplicationStore still accepts the minimal client.
  createStore(ApplicationStore, minimalClient);
});
