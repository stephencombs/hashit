import { defineConfig } from "nitro";
import evlog from "evlog/nitro/v3";

export default defineConfig({
  experimental: {
    asyncContext: true,
    tasks: true,
  },
  plugins: [
    "./server/plugins/00.migrate.ts",
    "./server/plugins/evlog-drain.ts",
    "./server/plugins/otlp-tracing.ts",
  ],
  tasks: {
    "automations:tick": {
      handler: "./tasks/automations/tick.ts",
      description: "Poll and execute due automations",
    },
    "dashboard:generate": {
      handler: "./tasks/dashboard/generate.ts",
      description: "Generate dashboard widgets in the background",
    },
    "dashboard:check": {
      handler: "./tasks/dashboard/check.ts",
      description: "Check if dashboard needs regeneration",
    },
  },
  scheduledTasks: {
    "* * * * *": ["automations:tick"],
    "0 0 * * *": ["dashboard:check"],
  },
  modules: [
    evlog({
      env: { service: "hashit" },
      exclude: ["/health"],
    }),
  ],
});
