import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
} from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import rsc from "@vitejs/plugin-rsc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  resolve: {
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
      "@opentelemetry/api",
      "@opentelemetry/exporter-trace-otlp-http",
      "@opentelemetry/otlp-transformer",
      "@opentelemetry/resources",
      "@opentelemetry/sdk-trace-node",
      "@opentelemetry/semantic-conventions",
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
