import { useLocation, useNavigate } from "@tanstack/react-router";
import { Chat } from "~/components/Chat";
import { AppPageHeader } from "~/components/app-page-header";

export function HomePage() {
  const navigate = useNavigate({ from: "/" });
  const location = useLocation();
  const historyState = location.state as unknown as
    | Record<string, unknown>
    | undefined;
  const newChatResetNonce =
    typeof historyState?.__newChatNavNonce === "number"
      ? historyState.__newChatNavNonce
      : "initial";

  const handleThreadCreated = (threadId: string) => {
    void navigate({
      to: "/chat/$threadId",
      params: { threadId },
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <>
      <AppPageHeader
        title={<h1 className="text-sm font-medium">New Chat</h1>}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Chat
          key={`new-chat-${newChatResetNonce}`}
          onThreadCreated={handleThreadCreated}
        />
      </div>
    </>
  );
}
