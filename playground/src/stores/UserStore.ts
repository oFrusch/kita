import { AsyncStore, reactive } from "@ofrusch/kita";
import { UserModel } from "../models/UserModel";

/**
 * Demonstrates the base AsyncStore: caching, request dedup, query cache, pagination, optimistic mutations.
 */
export class UserStore extends AsyncStore<UserModel> {
  static readonly id = "users";

  @reactive()
  accessor lastError: string | null = null;
}
