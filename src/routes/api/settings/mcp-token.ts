import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { appSettings } from "~/db/schema";
import {
  getMCPAccessToken,
  isMCPTokenConfigured,
  resetMCPTokenCache,
} from "~/lib/mcp/auth";

export const Route = createFileRoute("/api/settings/mcp-token")({
  server: {
    handlers: {
      GET: async () => {
        const [row] = await db
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, "mcp_api_token"))
          .limit(1);

        const configured = !!row;
        let hint: string | undefined;
        if (row) {
          const v = row.value.replace(/^Bearer\s+/i, "");
          hint =
            v.length > 8
              ? `${v.slice(0, 4)}${"·".repeat(Math.min(v.length - 8, 20))}${v.slice(-4)}`
              : "·".repeat(v.length);
        }

        let authenticated = false;
        if (configured) {
          try {
            await getMCPAccessToken();
            authenticated = true;
          } catch {
            authenticated = false;
          }
        }

        return Response.json({ configured, authenticated, hint });
      },

      PUT: async ({ request }) => {
        const body = (await request.json()) as { token?: string };
        const token = body?.token?.trim();

        if (!token) {
          return Response.json({ error: "Token is required" }, { status: 400 });
        }

        await db
          .insert(appSettings)
          .values({ key: "mcp_api_token", value: token })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value: token },
          });

        resetMCPTokenCache();

        let authenticated = false;
        let error: string | undefined;
        try {
          await getMCPAccessToken();
          authenticated = true;
        } catch (e) {
          error = e instanceof Error ? e.message : "Authentication failed";
        }

        return Response.json({ authenticated, error });
      },

      DELETE: async () => {
        await db
          .delete(appSettings)
          .where(eq(appSettings.key, "mcp_api_token"));

        resetMCPTokenCache();

        return new Response(null, { status: 204 });
      },
    },
  },
});
