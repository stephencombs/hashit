import { definePlugin } from "nitro";
import { shutdownTelemetry } from "../../src/lib/telemetry/otel";

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("close", async () => {
    await shutdownTelemetry();
  });
});
