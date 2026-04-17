import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

const MODEL_KEY = "hashit-model"
const TEMPERATURE_KEY = "hashit-temperature"
const SYSTEM_PROMPT_KEY = "hashit-system-prompt"

const DEFAULT_MODEL = "gpt-4.1"
const DEFAULT_TEMPERATURE = 0.7

interface ModelSettingsContext {
  model: string
  setModel: (model: string) => void
  temperature: number
  setTemperature: (temperature: number) => void
  systemPrompt: string
  setSystemPrompt: (systemPrompt: string) => void
}

const ModelSettingsContext = createContext<ModelSettingsContext | null>(null)

function readStorage(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  return localStorage.getItem(key) ?? fallback
}

export function ModelSettingsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [model, setModelState] = useState(() =>
    readStorage(MODEL_KEY, DEFAULT_MODEL),
  )
  const [temperature, setTemperatureState] = useState(() => {
    const stored = readStorage(TEMPERATURE_KEY, String(DEFAULT_TEMPERATURE))
    return parseFloat(stored)
  })
  const [systemPrompt, setSystemPromptState] = useState(() =>
    readStorage(SYSTEM_PROMPT_KEY, ""),
  )

  const setModel = useCallback((next: string) => {
    localStorage.setItem(MODEL_KEY, next)
    setModelState(next)
  }, [])

  const setTemperature = useCallback((next: number) => {
    localStorage.setItem(TEMPERATURE_KEY, String(next))
    setTemperatureState(next)
  }, [])

  const setSystemPrompt = useCallback((next: string) => {
    localStorage.setItem(SYSTEM_PROMPT_KEY, next)
    setSystemPromptState(next)
  }, [])

  const value = useMemo(
    () => ({
      model,
      setModel,
      temperature,
      setTemperature,
      systemPrompt,
      setSystemPrompt,
    }),
    [model, setModel, temperature, setTemperature, systemPrompt, setSystemPrompt],
  )

  return (
    <ModelSettingsContext value={value}>{children}</ModelSettingsContext>
  )
}

export function useModelSettings() {
  const ctx = useContext(ModelSettingsContext)
  if (!ctx)
    throw new Error("useModelSettings must be used within ModelSettingsProvider")
  return ctx
}
