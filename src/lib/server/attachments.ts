import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  type ContainerClient,
} from "@azure/storage-blob";

const ORIGINAL_FILENAME_METADATA_KEY = "original_filename";
const THREAD_ID_METADATA_KEY = "thread_id";

export interface AttachmentMeta {
  contentType: string;
  originalFilename?: string;
  size?: number;
}

export interface UploadAttachmentInput {
  id: string;
  contentType: string;
  originalFilename: string;
  body: Buffer | Uint8Array | Blob;
  size: number;
  threadId?: string;
}

let containerPromise: Promise<ContainerClient> | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildBlobServiceClient(): BlobServiceClient {
  const accountName = requireEnv("AZURE_BLOB_ACCOUNT_NAME");
  const accountKey = requireEnv("AZURE_BLOB_ACCOUNT_KEY");
  const endpoint = requireEnv("AZURE_BLOB_ENDPOINT");

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  return new BlobServiceClient(endpoint, credential);
}

async function resolveContainer(): Promise<ContainerClient> {
  const containerName = requireEnv("AZURE_BLOB_CONTAINER");
  const service = buildBlobServiceClient();
  const container = service.getContainerClient(containerName);
  await container.createIfNotExists();
  return container;
}

export function getAttachmentContainer(): Promise<ContainerClient> {
  if (!containerPromise) {
    containerPromise = resolveContainer().catch((err) => {
      containerPromise = null;
      throw err;
    });
  }
  return containerPromise;
}

export async function uploadAttachment(
  input: UploadAttachmentInput,
): Promise<void> {
  const container = await getAttachmentContainer();
  const blob = container.getBlockBlobClient(input.id);
  const metadata: Record<string, string> = {
    [ORIGINAL_FILENAME_METADATA_KEY]: encodeURIComponent(input.originalFilename),
  };
  if (input.threadId) {
    metadata[THREAD_ID_METADATA_KEY] = encodeURIComponent(input.threadId);
  }

  const data =
    input.body instanceof Blob
      ? Buffer.from(await input.body.arrayBuffer())
      : Buffer.isBuffer(input.body)
        ? input.body
        : Buffer.from(input.body);

  await blob.uploadData(data, {
    blobHTTPHeaders: {
      blobContentType: input.contentType,
      blobCacheControl: "public, max-age=31536000, immutable",
    },
    metadata,
  });
}

export interface AttachmentDownload {
  contentType: string;
  contentLength?: number;
  originalFilename?: string;
  threadId?: string;
  stream: NodeJS.ReadableStream;
}

export async function getAttachment(
  id: string,
): Promise<AttachmentDownload | null> {
  const container = await getAttachmentContainer();
  const blob = container.getBlockBlobClient(id);

  let download;
  try {
    download = await blob.download();
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }

  if (!download.readableStreamBody) return null;

  const originalFilenameRaw =
    download.metadata?.[ORIGINAL_FILENAME_METADATA_KEY] ?? undefined;
  const originalFilename = originalFilenameRaw
    ? safeDecode(originalFilenameRaw)
    : undefined;
  const threadIdRaw = download.metadata?.[THREAD_ID_METADATA_KEY] ?? undefined;
  const threadId = threadIdRaw ? safeDecode(threadIdRaw) : undefined;

  return {
    contentType: download.contentType ?? "application/octet-stream",
    contentLength: download.contentLength ?? undefined,
    originalFilename,
    threadId,
    stream: download.readableStreamBody,
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const candidate = err as { statusCode?: number; code?: string };
  return candidate.statusCode === 404 || candidate.code === "BlobNotFound";
}
