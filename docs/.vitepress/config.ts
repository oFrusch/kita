import { defineConfig } from "vitepress";

const GITHUB = "https://github.com/ofrusch/kita";

export default defineConfig({
  title: "kita",
  description:
    "A frontend ORM and reactive state management framework for Vue 3 — typed models, HTTP-backed stores, and a model-store registry inspired by Ember Data.",
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ["meta", { name: "theme-color", content: "#42b883" }],
    ["link", { rel: "icon", type: "image/png", href: "/favicon.png" }],
  ],

  themeConfig: {
    logo: "/logo.png",

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Cookbook", link: "/cookbook/pagination" },
      { text: "API", link: "/api/application-store" },
      {
        text: "0.2.0",
        items: [
          { text: "Changelog", link: `${GITHUB}/blob/main/CHANGELOG.md` },
          { text: "npm", link: "https://www.npmjs.com/package/@ofrusch/kita" },
        ],
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Core concepts", link: "/guide/core-concepts" },
            { text: "Pairing with a backend ORM", link: "/guide/backend-orm" },
            { text: "Architecture", link: "/guide/architecture" },
          ],
        },
      ],
      "/cookbook/": [
        {
          text: "Cookbook",
          items: [
            { text: "Pagination", link: "/cookbook/pagination" },
            { text: "Optimistic updates", link: "/cookbook/optimistic-updates" },
            { text: "Stale-while-revalidate", link: "/cookbook/swr" },
            { text: "Custom HTTP client", link: "/cookbook/custom-http-client" },
            { text: "Validation (zod / valibot)", link: "/cookbook/validation" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API reference",
          items: [
            { text: "ApplicationStore", link: "/api/application-store" },
            { text: "Stores", link: "/api/stores" },
            { text: "Models", link: "/api/models" },
            { text: "Decorators", link: "/api/decorators" },
            { text: "Utilities", link: "/api/utilities" },
            { text: "Types", link: "/api/types" },
          ],
        },
      ],
    },

    socialLinks: [{ icon: "github", link: GITHUB }],

    editLink: {
      pattern: `${GITHUB}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },

    search: { provider: "local" },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © Owen Carpenter",
    },
  },
});
