import { describe, expect, it, vi } from "vitest";
import { loadV2ThreadRouteData } from "./v2.chat.$threadId";
import { loadV2LayoutData } from "./v2";

describe("v2 route loaders", () => {
  it("preloads the v2 thread list in the layout loader", async () => {
    const ensureQueryData = vi.fn(async () => []);

    await loadV2LayoutData({
      context: {
        queryClient: { ensureQueryData },
      },
    });

    expect(ensureQueryData).toHaveBeenCalledTimes(1);
    expect(ensureQueryData.mock.calls[0]?.[0]?.queryKey).toEqual([
      "v2",
      "threads",
      "list",
    ]);
  });

  it("preloads session and messages in the thread loader", async () => {
    const ensureQueryData = vi.fn(async () => ({}));

    await loadV2ThreadRouteData({
      params: { threadId: "thread-123" },
      context: {
        queryClient: { ensureQueryData },
      },
    });

    expect(ensureQueryData).toHaveBeenCalledTimes(2);
    expect(ensureQueryData.mock.calls[0]?.[0]?.queryKey).toEqual([
      "v2",
      "threads",
      "session",
      "thread-123",
    ]);
    expect(ensureQueryData.mock.calls[1]?.[0]?.queryKey).toEqual([
      "v2",
      "messages",
      "thread-123",
      "list",
    ]);
  });
});
