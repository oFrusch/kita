import { AsyncModel, registerModel } from "@ofrusch/kita";

export class UserModel extends AsyncModel {
  static readonly id = "users";
  static {
    registerModel(this);
  }

  declare name: string;
  declare email: string;

  toString(): string {
    return this.name;
  }
}
