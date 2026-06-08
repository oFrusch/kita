import ModelStoreRegistry from "../model-store-registry";
import { AsyncModel } from "./async-model";
import { Model } from "./model";

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

export { AbstractModel } from "./abstract-model";
export { AsyncModel } from "./async-model";
export { Model } from "./model";
export { connectToStore, registerModel };
