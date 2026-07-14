import type { Store } from "../stores";
import { AbstractModel } from "./abstract-model";

export class Model extends AbstractModel {
  declare store: Store<this>;

  static create<T extends Model, U>(
    this: new (params: Record<string, unknown>) => T,
    params?: U,
  ): T & U {
    const newRecord = new this({ ...(params as Record<string, unknown>) }) as T & U;
    Object.assign(newRecord, params);

    return newRecord;
  }
}
