import { createApp } from "vue";
import App from "./App.vue";
import appStore from "./stores/application-store";

createApp(App).use(appStore).mount("#app");
