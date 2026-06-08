import type { ApplicationStore } from "../application-store";
import ModelStoreRegistry from "../model-store-registry";
import type { AsyncStore } from "../stores";
import { AbstractModel } from "./abstract-model";

export class AsyncModel extends AbstractModel {
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

    // Only register records that already have an identity. An id-less draft
    // (e.g. `Model.create({ title })` before save) has nothing to key on — it
    // gets pushed under its real id by `save()` / `_createRecord`. Pushing it
    // here would pollute the lookup map under an `undefined` key and leave a
    // duplicate behind once the server assigns the real id.
    if (newRecord.id != null) {
      try {
        newRecord.store._pushRecord(newRecord);
      } catch (e) {
        console.error(`No store found for model of type ${modelType}`);
      }
    }

    return newRecord;
  }
}
