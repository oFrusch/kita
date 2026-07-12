import ModelStoreRegistry from "../model-store-registry";

export abstract class AbstractModel {
  static id = "base";

  declare readonly id: string;

  /** `!this.id` — a record with no id has never been persisted. */
  get isNew(): boolean {
    return !this.id;
  }

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
