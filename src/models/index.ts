import type { ApplicationStore } from "../application-store";
import ModelStoreRegistry from "../model-store-registry";
import { AsyncStore, Store } from "../stores";

abstract class AbstractModel {
  static id = "base";

  declare readonly id: string;

  toString() {
    return this.id;
  }

  constructor(params: Record<string, unknown>) {
    Object.assign(this, params);
  }

  public get stores() {
    return ModelStoreRegistry.allStores();
  }

  serialize(removeKeys: string[] = []): string {
    return JSON.stringify(this, (k, v) => {
      if (!["store", "stores", ...removeKeys].includes(k)) return v;
    });
  }
}

class Model extends AbstractModel {
  declare store: Store<this>;

  get isNew(): boolean {
    return !this.id;
  }

  static create<T extends Model, U>(
    this: new (params: Record<string, unknown>) => T,
    params?: U,
  ): T & U {
    const newRecord = new this({ ...(params as Record<string, unknown>) }) as T & U;
    Object.assign(newRecord, params);

    return newRecord;
  }
}

class AsyncModel extends AbstractModel {
  declare store: AsyncStore<this>;

  get isNew(): boolean {
    return !this.id;
  }

  get stores() {
    return ModelStoreRegistry.allStores() as ApplicationStore;
  }

  async save(): Promise<void> {
    if (!this.store) {
      throw new Error("You must define a store in the model class in order to use this function");
    }
    const data = await this.store.save(this);
    Object.assign(this, { ...data });
  }

  /**
   * Apply a partial patch and persist. Equivalent to `Object.assign(this, patch); await this.save();`.
   *
   * @example
   * await user.update({ email: "new@example.com" });
   */
  async update(patch: Record<string, unknown>): Promise<void> {
    Object.assign(this, patch);
    await this.save();
  }

  async delete(): Promise<void> {
    if (!this.store) {
      throw new Error("You must define a store in the model class in order to use this function");
    }
    await this.store.delete(this);
  }

  static create<T extends AsyncModel, U>(
    this: new (params: Record<string, unknown>) => T,
    params?: U,
  ): T & U {
    const newRecord = new this({ ...(params as Record<string, unknown>) }) as T & U;
    Object.assign(newRecord, params);
    const modelType = (newRecord.constructor as any).id;
    newRecord.store = ModelStoreRegistry.getStore(modelType) as AsyncStore<T>;

    try {
      newRecord.store._pushRecord(newRecord);
    } catch (e) {
      console.error(`No store found for model of type ${modelType}`);
    }

    return newRecord;
  }
}

/**
 * Register a model class with the ModelStoreRegistry.
 * Call this in a static initialization block in your model class.
 *
 * @example
 * ```typescript
 * export default class UserModel extends AsyncModel {
 *   static readonly id = "users";
 *   static { registerModel(this); }
 * }
 * ```
 */
function registerModel<T extends typeof AsyncModel | typeof Model>(modelClass: T): void {
  ModelStoreRegistry.registerModel(modelClass);
}

/**
 * @deprecated Use `registerModel(this)` in a `static {}` initialization block instead.
 * `connectToStore` will be removed in a future major release.
 *
 * @example
 * // Old (deprecated):
 * @connectToStore
 * class UserModel extends AsyncModel { … }
 *
 * // New:
 * class UserModel extends AsyncModel {
 *   static { registerModel(this); }
 * }
 */
function connectToStore<T extends typeof AsyncModel>(cls: T) {
  ModelStoreRegistry.registerModel(cls);
}

export { AbstractModel, AsyncModel, connectToStore, Model, registerModel };
