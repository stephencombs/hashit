import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockParseAttachmentUploadRequest = vi.fn();
  const mockUploadAttachment = vi.fn();
  const mockGetAttachment = vi.fn();
  const mockGetV2ThreadByIdServer = vi.fn();
  const mockNanoid = vi.fn(() => "attach_1234567890abcdef");

  return {
    mockGetAttachment,
    mockGetV2ThreadByIdServer,
    mockNanoid,
    mockParseAttachmentUploadRequest,
    mockUploadAttachment,
  };
});

vi.mock("nanoid", () => ({
  nanoid: mocks.mockNanoid,
}));

vi.mock("~/lib/server/prompt-attachments-upload", () => ({
  parseAttachmentUploadRequest: mocks.mockParseAttachmentUploadRequest,
}));

vi.mock("~/lib/server/attachments", () => ({
  uploadAttachment: mocks.mockUploadAttachment,
  getAttachment: mocks.mockGetAttachment,
}));

vi.mock("~/features/chat-v2/server/threads.server", () => ({
  getV2ThreadByIdServer: mocks.mockGetV2ThreadByIdServer,
}));

import { Route as DownloadRoute } from "~/routes/api/v2/prompt-attachments.$attachmentId";
import { Route as UploadRoute } from "~/routes/api/v2/prompt-attachments";

describe("/api/v2/prompt-attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockParseAttachmentUploadRequest.mockResolvedValue({
      formData: new FormData(),
      upload: {
        buffer: Buffer.from("file-bytes"),
        filename: "image.png",
        mimeType: "image/png",
      },
    });
    mocks.mockGetV2ThreadByIdServer.mockResolvedValue({ id: "v2_thread_1" });
    mocks.mockUploadAttachment.mockResolvedValue(undefined);
  });

  it("uploads a validated attachment scoped to a thread", async () => {
    const response = await UploadRoute.options.server.handlers.POST({
      request: new Request(
        "http://localhost/api/v2/prompt-attachments?threadId=v2_thread_1",
        { method: "POST" },
      ),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "attach_1234567890abcdef",
      url: "/api/v2/prompt-attachments/attach_1234567890abcdef?threadId=v2_thread_1",
      mimeType: "image/png",
      filename: "image.png",
      size: 10,
    });
    expect(mocks.mockGetV2ThreadByIdServer).toHaveBeenCalledWith("v2_thread_1");
    expect(mocks.mockUploadAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "attach_1234567890abcdef",
        threadId: "v2_thread_1",
        contentType: "image/png",
      }),
    );
  });

  it("rejects uploads missing a valid thread id", async () => {
    await expect(
      UploadRoute.options.server.handlers.POST({
        request: new Request("http://localhost/api/v2/prompt-attachments", {
          method: "POST",
        }),
      }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("/api/v2/prompt-attachments/$attachmentId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetV2ThreadByIdServer.mockResolvedValue({ id: "v2_thread_1" });
    mocks.mockGetAttachment.mockResolvedValue({
      contentType: "image/png",
      contentLength: 2,
      originalFilename: "image.png",
      threadId: "v2_thread_1",
      stream: Readable.from(Buffer.from("ok")),
    });
  });

  it("serves attachment bytes when thread ownership matches", async () => {
    const response = await DownloadRoute.options.server.handlers.GET({
      params: { attachmentId: "attach_1234567890" },
      request: new Request(
        "http://localhost/api/v2/prompt-attachments/attach_1234567890?threadId=v2_thread_1",
        { method: "GET" },
      ),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  it("returns 404 when attachment thread ownership does not match", async () => {
    mocks.mockGetAttachment.mockResolvedValueOnce({
      contentType: "image/png",
      threadId: "v2_other_thread",
      stream: Readable.from(Buffer.from("ok")),
    });

    const response = await DownloadRoute.options.server.handlers.GET({
      params: { attachmentId: "attach_1234567890" },
      request: new Request(
        "http://localhost/api/v2/prompt-attachments/attach_1234567890?threadId=v2_thread_1",
        { method: "GET" },
      ),
    });

    expect(response.status).toBe(404);
  });
});
