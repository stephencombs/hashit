import { AppPageHeader } from "~/app/components/app-page-header";

export function V2HomePage() {
  return (
    <>
      <AppPageHeader title={<h1 className="text-sm font-medium">V2 Chat</h1>} />
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="mb-2 text-lg font-semibold">
            Select or create a thread
          </h2>
          <p className="text-muted-foreground text-sm">
            This V2 surface is isolated from the current chat UI and uses a
            collection-first data model with TanStack DB live queries.
          </p>
        </div>
      </div>
    </>
  );
}
