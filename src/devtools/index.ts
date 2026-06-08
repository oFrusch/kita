import { App } from "vue";
import setupDevtools from "./setup-plugin";

export default {
  install(app: App /** options = {} */) {
    // Devtools are dev-only. In production this branch is statically eliminated
    // (and `setupDevtools` + `@vue/devtools-api` tree-shaken out with it).
    if (process.env.NODE_ENV === "production") return;
    return setupDevtools(app);
  },
};
