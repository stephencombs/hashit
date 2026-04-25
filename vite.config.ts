import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
} from "vite";
import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import tailwindcss from "@tailwindcss/vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      tasks: `${rootDir}tasks`,
    },
    conditions: [...defaultClientConditions],
    tsconfigPaths: true,
  },
  ssr: {
    resolve: {
      conditions: [...defaultServerConditions],
      // Externalized deps execute in Node, so resolve them with Node's
      // runtime conditions instead of Vite's "module" condition.
      externalConditions: ["node"],
    },
    external: [
      "@modelcontextprotocol/sdk",
      "pg",
      "pg-native",
      "protobufjs",
      "shiki",
      "shiki/wasm",
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      rsc: {
        enabled: true,
      },
    }),
    rsc(),
    nitro(),
    viteReact(),
  ],
});
