import { Ref } from "vue";
import { AbstractModel } from "../models";

/**
 * Options for findRecords with query caching support.
 */
export interface FindRecordsOptions {
  /** Whether to use cached results (default: true) */
  cache?: boolean;
  /** Cache TTL in milliseconds (default: 60000 = 1 minute) */
  cacheTTL?: number;
  /** Whether to replace the store contents (default: false) */
  replaceStore?: boolean;
}

export abstract class AbstractStore<T extends AbstractModel> {
  static readonly id: string;

  declare protected _records: Ref<T[]>;
  declare protected _recordsById: Map<string, T>;

  public get records() {
    return this._records.value;
  }

  public set records(value) {
    this._records.value = value;
  }

  protected abstract reset(): void;

  abstract findRecord(id: string): T | undefined;

  abstract _pushRecord(record: T): void;

  abstract _deleteRecord(record: T): void;

  abstract _updateRecord(record: T): T;
}
