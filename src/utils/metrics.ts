interface TimingStats {
  count: number
  avg: number
  p50: number
  p95: number
  min: number
  max: number
}

class MetricsCollector {
  private timings = new Map<string, number[]>()

  record(name: string, durationMs: number) {
    const bucket = this.timings.get(name)
    if (bucket) {
      bucket.push(durationMs)
    } else {
      this.timings.set(name, [durationMs])
    }
  }

  /** Wrap an async operation and automatically record its duration. */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now()
    try {
      return await fn()
    } finally {
      this.record(name, Date.now() - start)
    }
  }

  getStats(name: string): TimingStats | null {
    const raw = this.timings.get(name)
    if (!raw || raw.length === 0) return null

    const sorted = [...raw].sort((a, b) => a - b)
    return {
      count: sorted.length,
      avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      p50: sorted[Math.floor(sorted.length * 0.5)]!,
      p95: sorted[Math.floor(sorted.length * 0.95)]!,
      min: sorted[0]!,
      max: sorted[sorted.length - 1]!,
    }
  }

  getAllStats(): Record<string, TimingStats> {
    const out: Record<string, TimingStats> = {}
    for (const [name] of this.timings) {
      const stats = this.getStats(name)
      if (stats) out[name] = stats
    }
    return out
  }

  reset() {
    this.timings.clear()
  }
}

export const metrics = new MetricsCollector()
