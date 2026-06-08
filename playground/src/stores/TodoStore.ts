import { AsyncStoreSWR } from "@ofrusch/kita";
import { TodoModel } from "../models/TodoModel";

/**
 * Demonstrates the opt-in SWR variant — `findRecord` supports `staleTime` / `revalidate`.
 */
export class TodoStore extends AsyncStoreSWR<TodoModel> {
  static readonly id = "todos";
}
