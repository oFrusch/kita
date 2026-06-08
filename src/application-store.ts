import type { App, InjectionKey } from "vue";
import { inject } from "vue";
import dataStorePlugin from "./devtools";
import type { HttpClient } from "./http";
import ModelStoreRegistry from "./model-store-registry";
import { AsyncModel, Model } from "./models";
import { AsyncStore, Store } from "./stores";

/**
 * Symbol-based injection key for the ApplicationStore. Used by kita's own
 * `useStore` helper. Exported so advanced consumers can write their own
 * inject() calls without colliding on a string key like `"store"`.
 */
export const KITA_STORE_KEY: InjectionKey<ApplicationStore> = Symbol(
  "@ofrusch/kita/application-store",
);

export class ApplicationStore {
  declare client: HttpClient;

  // accept any store definitions
  [key: string]: any;

  constructor(client: HttpClient) {
    this.client = client;
  }

  registerStore<T extends typeof Store<Model> | typeof AsyncStore<AsyncModel>>(StoreClass: T) {
    const storeInstance = new StoreClass(this.client, {});

    this[StoreClass.id] = storeInstance;
    ModelStoreRegistry.registerStore(StoreClass.id, storeInstance);

    return this;
  }

  getStore<T = Store<Model> | AsyncStore<AsyncModel>>(recordType: string): T {
    return this[recordType] as T;
  }

  install(app: App) {
    app.provide(KITA_STORE_KEY, this);
    // Keep globalProperties.store for Vue DevTools and template access compatibility.
    app.config.globalProperties.store = this;

    // Register the DevTools plugin.
    app.use(dataStorePlugin);
  }
}

export function createStore<T extends typeof ApplicationStore>(
  appStoreClass: T,
  client: HttpClient,
): { appStore: InstanceType<T>; useStore: () => InstanceType<T> } {
  const useStore = () => {
    return inject(KITA_STORE_KEY) as InstanceType<T>;
  };

  const appStore = new appStoreClass(client) as InstanceType<T>;

  return { appStore, useStore };
}

export function createAndRegisterStore<T extends typeof ApplicationStore>(
  appStoreClass: T,
  modelStores: Array<typeof Store<Model> | typeof AsyncStore<AsyncModel>>,
  client: HttpClient,
): {
  appStore: InstanceType<T>;
  useStore: () => InstanceType<T>;
} {
  const { appStore, useStore } = createStore(appStoreClass, client);

  modelStores.forEach((store) => appStore.registerStore(store));

  return { appStore, useStore };
}
