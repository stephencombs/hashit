import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const SERVERS_KEY = "hashit-mcp-servers";
const TOOLS_KEY = "hashit-mcp-tools";

interface McpSettingsContext {
  selectedServers: string[];
  enabledTools: Record<string, string[]>;
  toggleServer: (name: string, toolNames?: string[]) => void;
  toggleTool: (serverName: string, toolName: string) => void;
  toggleAllTools: (serverName: string, allToolNames: string[]) => void;
  reset: () => void;
}

const McpSettingsContext = createContext<McpSettingsContext | null>(null);

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function McpSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedServers, setSelectedServers] = useState<string[]>(() =>
    readJson<string[]>(SERVERS_KEY, []),
  );
  const [enabledTools, setEnabledTools] = useState<Record<string, string[]>>(
    () => readJson<Record<string, string[]>>(TOOLS_KEY, {}),
  );

  const toggleServer = useCallback((name: string, toolNames?: string[]) => {
    setSelectedServers((prev) => {
      const next = prev.includes(name)
        ? prev.filter((s) => s !== name)
        : [...prev, name];
      writeJson(SERVERS_KEY, next);

      if (!prev.includes(name) && toolNames) {
        setEnabledTools((prevTools) => {
          const updated = { ...prevTools, [name]: toolNames };
          writeJson(TOOLS_KEY, updated);
          return updated;
        });
      }

      if (prev.includes(name)) {
        setEnabledTools((prevTools) => {
          const { [name]: _, ...rest } = prevTools;
          writeJson(TOOLS_KEY, rest);
          return rest;
        });
      }

      return next;
    });
  }, []);

  const toggleTool = useCallback((serverName: string, toolName: string) => {
    setEnabledTools((prev) => {
      const current = prev[serverName] ?? [];
      const next = current.includes(toolName)
        ? current.filter((t) => t !== toolName)
        : [...current, toolName];
      const updated = { ...prev, [serverName]: next };
      writeJson(TOOLS_KEY, updated);
      return updated;
    });
  }, []);

  const toggleAllTools = useCallback(
    (serverName: string, allToolNames: string[]) => {
      setEnabledTools((prev) => {
        const current = prev[serverName] ?? [];
        const allEnabled = allToolNames.length === current.length;
        const next = allEnabled ? [] : allToolNames;
        const updated = { ...prev, [serverName]: next };
        writeJson(TOOLS_KEY, updated);
        return updated;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    localStorage.removeItem(SERVERS_KEY);
    localStorage.removeItem(TOOLS_KEY);
    setSelectedServers([]);
    setEnabledTools({});
  }, []);

  const value = useMemo(
    () => ({
      selectedServers,
      enabledTools,
      toggleServer,
      toggleTool,
      toggleAllTools,
      reset,
    }),
    [
      selectedServers,
      enabledTools,
      toggleServer,
      toggleTool,
      toggleAllTools,
      reset,
    ],
  );

  return <McpSettingsContext value={value}>{children}</McpSettingsContext>;
}

export function useMcpSettings() {
  const ctx = useContext(McpSettingsContext);
  if (!ctx)
    throw new Error("useMcpSettings must be used within McpSettingsProvider");
  return ctx;
}
