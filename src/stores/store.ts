import { ref } from "vue";
import { Model } from "../models";
import { AbstractStore } from "./abstract-store";

export class Store<T extends Model> extends AbstractStore<T> {
  // eslint-disable-next-line
  constructor(..._args: any[]) {
    super();

    this._records = ref([]);
    this._recordsById = new Map();
  }

  public findRecord(id: string) {
    return this._recordsById.get(id);
  }

  public peekRecord(id: string): T | undefined {
    return this._recordsById.get(id);
  }

  public _pushRecord(record: T) {
    const existing = this._recordsById.get(record.id);

    if (existing) {
      Object.assign(existing, record);
      return existing;
    }

    this._recordsById.set(record.id, record);
    this.records.push(record);
    return record;
  }

  public _removeRecord(record: T) {
    this._recordsById.delete(record.id);
    this.records = this.records.filter((r) => r.id !== record.id);
  }

  public _updateRecord(record: T) {
    return this._pushRecord(record);
  }

  public _deleteRecord(record: T) {
    this._recordsById.delete(record.id);
    this.records = this.records.filter((r) => r.id !== record.id);
  }

  protected reset() {
    this._records.value = [];
    this._recordsById.clear();
  }
}
