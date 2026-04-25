import { AppPageHeader } from "~/app/components/app-page-header";

export function V3HomePage() {
  return (
    <>
      <AppPageHeader title={<h1 className="text-sm font-medium">V3 Chat</h1>} />
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="mb-2 text-lg font-semibold">
            Select or create a thread
          </h2>
          <p className="text-muted-foreground text-sm">
            Basic chat powered by AI SDK and persisted as native UI messages.
          </p>
        </div>
      </div>
    </>
  );
}
