type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getMinLevel(): number {
  const env =
    typeof process !== 'undefined' ? process.env.NODE_ENV : 'production'
  return env === 'production' ? LOG_LEVELS.warn : LOG_LEVELS.debug
}

function getContext(): string {
  return typeof window === 'undefined' ? 'SERVER' : 'CLIENT'
}

function log(level: LogLevel, message: string, data?: unknown) {
  if (LOG_LEVELS[level] < getMinLevel()) return

  const timestamp = new Date().toISOString()
  const ctx = getContext()

  if (typeof window !== 'undefined') {
    console[level](`[${ctx}] [${level.toUpperCase()}]`, message, data ?? '')
    return
  }

  const isDev =
    typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

  if (isDev) {
    console[level](`[${timestamp}] [${ctx}] [${level.toUpperCase()}]`, message, data ?? '')
  } else {
    console.log(
      JSON.stringify({
        timestamp,
        level,
        context: ctx,
        message,
        ...(data !== undefined && { data }),
        service: 'hashit',
      }),
    )
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
}
