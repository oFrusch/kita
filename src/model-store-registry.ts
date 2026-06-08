import { AsyncModel, Model } from "./models";
import { AsyncStore, Store } from "./stores";

class ModelStoreRegistry {
  private readonly stores: Record<string, Store<Model> | AsyncStore<AsyncModel>> = {};
  private readonly models: Record<string, typeof Model | typeof AsyncModel> = {};

  public registerStore(storeId: string, store: Store<any> | AsyncStore<any>) {
    this.stores[storeId] = store;
  }

  public getStore(storeId: string): Store<Model> | AsyncStore<AsyncModel> {
    return this.stores[storeId];
  }

  public registerModel<T extends typeof Model | typeof AsyncModel>(model: T) {
    this.models[model.id] = model;
  }

  public getModel(modelId: string): typeof Model | typeof AsyncModel {
    return this.models[modelId];
  }

  public allStores(): Record<string, Store<Model> | AsyncStore<AsyncModel>> {
    return this.stores;
  }
}

export type { ModelStoreRegistry };

export default new ModelStoreRegistry();
