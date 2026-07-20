// @ts-check
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "https://inquisoai.com",

  integrations: [
    starlight({
      title: "Inquiso",
      description:
        "Chat with any web page. Ask, summarize, assess trustworthiness, and let a transparent agent act — with your own AI keys or your browser's built-in AI. Local-first and serverless.",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "Inquiso",
      },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/theme.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/inquisoai/inquiso",
        },
      ],
      // Built-in pagefind site search is on by default; keep it.
      // No editLink: docs are generated from the `inquiso` submodule into a
      // reorganized tree, so a repo edit path can't be derived reliably.
      sidebar: [
        { label: "Documentation", link: "/docs/" },
        { label: "Guide", items: [{ autogenerate: { directory: "docs/guide" } }] },
        { label: "Design", items: [{ autogenerate: { directory: "docs/design" } }] },
        { label: "Memory Agent", items: [{ autogenerate: { directory: "docs/memory-agent" } }] },
        { label: "ADRs", items: [{ autogenerate: { directory: "docs/adr" } }] },
      ],
    }),
    sitemap(),
  ],

  adapter: cloudflare(),
});