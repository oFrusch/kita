import { AsyncModel, registerModel } from "@ofrusch/kita";

export class TodoModel extends AsyncModel {
  static readonly id = "todos";
  static {
    registerModel(this);
  }

  declare title: string;
  declare done: boolean;

  toString(): string {
    return this.title;
  }
}
