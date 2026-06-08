import { App } from "vue";
import setupDevtools from "./setup-plugin";

export default {
  install(app: App /** options = {} */) {
    return setupDevtools(app);
  },
};
