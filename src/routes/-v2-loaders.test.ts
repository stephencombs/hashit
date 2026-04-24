import { describe, expect, it, vi } from "vitest";
import { loadV2ThreadRouteData } from "./v2.chat.$threadId";
import { loadV2LayoutData } from "./v2";

describe("v2 route loaders", () => {
  it("preloads the v2 thread list in the layout loader", async () => {
    const ensureQueryData = vi.fn(async (options: { queryKey: unknown[] }) => options);

    await loadV2LayoutData({
      context: {
        queryClient: { ensureQueryData: ensureQueryData as never },
      },
    });

    expect(ensureQueryData).toHaveBeenCalledTimes(1);
    const firstCall = ensureQueryData.mock.calls[0]?.[0] as {
      queryKey: unknown[];
    };
    expect(firstCall.queryKey).toEqual([
      "v2",
      "threads",
      "list",
    ]);
  });

  it("preloads session and messages in the thread loader", async () => {
    const ensureQueryData = vi.fn(async (options: { queryKey: unknown[] }) => options);

    await loadV2ThreadRouteData({
      params: { threadId: "thread-123" },
      context: {
        queryClient: { ensureQueryData: ensureQueryData as never },
      },
    });

    expect(ensureQueryData).toHaveBeenCalledTimes(3);
    const firstCall = ensureQueryData.mock.calls[0]?.[0] as {
      queryKey: unknown[];
    };
    const secondCall = ensureQueryData.mock.calls[1]?.[0] as {
      queryKey: unknown[];
    };
    const thirdCall = ensureQueryData.mock.calls[2]?.[0] as {
      queryKey: unknown[];
    };
    expect(firstCall.queryKey).toEqual([
      "v2",
      "threads",
      "session",
      "thread-123",
    ]);
    expect(secondCall.queryKey).toEqual([
      "v2",
      "messages",
      "thread-123",
      "list",
    ]);
    expect(thirdCall.queryKey).toEqual([
      "v2",
      "attachments",
      "summary",
      "thread-123",
    ]);
  });
});
