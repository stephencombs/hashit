import { definePlugin } from "nitro";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "../../src/db";

export default definePlugin(async () => {
  if (process.env.SKIP_MIGRATIONS === "true") {
    return;
  }
  await migrate(db, { migrationsFolder: "./drizzle" });
});
