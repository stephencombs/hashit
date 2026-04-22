import { Skeleton } from "~/components/ui/skeleton";
import { InputGroup, InputGroupAddon } from "~/components/ui/input-group";
import { CornerDownLeftIcon, PaperclipIcon } from "lucide-react";

function UserBubbleSkeleton({ widthClass }: { widthClass: string }) {
  return (
    <div className="ml-auto flex w-full flex-col justify-end gap-2">
      <div className={`ml-auto rounded-lg bg-secondary px-4 py-3 ${widthClass}`}>
        <Skeleton className="h-5.5 w-full" />
      </div>
    </div>
  );
}

function AssistantBlockSkeleton({
  lines,
  withChart = false,
}: {
  lines: string[];
  withChart?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full flex-col gap-2">
        {lines.map((widthClass, index) => (
          <Skeleton key={`${widthClass}-${index}`} className={`h-5.5 ${widthClass}`} />
        ))}
      </div>
      {withChart && <Skeleton className="mt-1 h-72 w-full rounded-lg" />}
    </div>
  );
}

function PromptInputSkeleton() {
  return (
    <div className="shrink-0 pb-6 pt-3">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2 px-6">
        <InputGroup className="overflow-hidden">
          <div className="flex min-h-16 w-full flex-1 self-stretch items-start justify-start px-3 py-2">
            <Skeleton className="h-4 w-[238px] rounded-sm bg-muted/50" />
          </div>
          <InputGroupAddon align="block-end" className="justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                aria-label="Attach files"
                className="flex size-8 items-center justify-center rounded-[calc(var(--radius)-5px)] text-muted-foreground/70"
              >
                <PaperclipIcon className="size-4" />
              </button>
            </div>
            <div className="flex size-8 items-center justify-center rounded-[calc(var(--radius)-5px)] bg-primary/70 text-primary-foreground/70">
              <CornerDownLeftIcon className="size-4" />
            </div>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
}

const THREAD_SKELETON_ROWS: Array<
  | { kind: "assistant"; lines: string[]; withChart?: boolean }
  | { kind: "user"; widthClass: string }
> = [
  { kind: "user", widthClass: "w-[220px]" },
  {
    kind: "assistant",
    lines: ["w-[88%]", "w-[74%]", "w-[62%]"],
    withChart: true,
  },
];

export function ChatThreadSkeleton({ showComposer = true }: { showComposer?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col justify-start overflow-hidden py-6 [scrollbar-gutter:stable_both-edges]">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-6">
          {THREAD_SKELETON_ROWS.map((row, index) => (
              <div key={`${row.kind}-${index}`}>
                {row.kind === "assistant" ? (
                  <AssistantBlockSkeleton lines={row.lines} withChart={row.withChart} />
                ) : (
                  <UserBubbleSkeleton widthClass={row.widthClass} />
                )}
              </div>
          ))}
        </div>
      </div>
      {showComposer && <PromptInputSkeleton />}
    </div>
  );
}
