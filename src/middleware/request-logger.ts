import { createMiddleware } from '@tanstack/react-start'
import { logger } from '~/utils/logger'
import { metrics } from '~/utils/metrics'

export const requestLogger = createMiddleware().server(
  async ({ next, request }) => {
    const start = Date.now()
    const url = new URL(request.url)
    const label = `${request.method} ${url.pathname}`

    logger.info(`→ ${label}`)

    try {
      const result = await next()
      const duration = Date.now() - start

      metrics.record(`request:${url.pathname}`, duration)
      logger.info(`← ${label} ${result.response.status} (${duration}ms)`)

      if (process.env.NODE_ENV !== 'production') {
        result.response.headers.set('X-Response-Time', `${duration}ms`)
      }

      return result
    } catch (error) {
      const duration = Date.now() - start
      metrics.record(`request:${url.pathname}`, duration)
      logger.error(`← ${label} ERROR (${duration}ms)`, {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },
)
