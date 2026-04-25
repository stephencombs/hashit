import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadV2AttachmentSource } from "./v2-session-attachments";

describe("uploadV2AttachmentSource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces V2 upload errors with server detail", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(new Blob(["image"]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: "File is too large" }, { status: 413 }),
      );

    await expect(
      uploadV2AttachmentSource({
        threadId: "thread-1",
        url: "blob:http://localhost/upload",
        mediaType: "image/png",
        filename: "image.png",
      }),
    ).rejects.toThrow("File is too large");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
