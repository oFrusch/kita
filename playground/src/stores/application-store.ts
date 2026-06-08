import { ApplicationStore, createAndRegisterStore } from "@ofrusch/kita";
import { mockClient } from "../mocks/mockClient";
import { TodoStore } from "./TodoStore";
import { UserStore } from "./UserStore";

class AppStore extends ApplicationStore {
  declare readonly users: UserStore;
  declare readonly todos: TodoStore;
}

const { appStore, useStore: _useStore } = createAndRegisterStore(
  AppStore,
  [UserStore, TodoStore],
  mockClient,
);

export const useStore = _useStore;
export default appStore;
