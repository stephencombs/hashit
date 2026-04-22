import { useSyncExternalStore } from 'react'
import type { Spec } from '@json-render/core'

type Listener = () => void

/**
 * External store for in-flight UI specs during streaming.
 *
 * Kept outside React state so patch updates don't cascade through the full
 * context/provider tree — only the message list subscriber (via
 * useSyncExternalStore) and the specific MessageRow that owns the streaming
 * message will re-render on each patch.
 *
 * After streaming ends the store continues holding the final specs so that
 * messages can render them even before a page reload delivers persisted ui-spec
 * parts from the server.
 */
export class LiveSpecStore {
  private data: Map<string, Spec[]> = new Map()
  private listeners: Set<Listener> = new Set()

  private notify(): void {
    this.listeners.forEach((l) => l())
  }

  /** Stable subscribe reference — safe to pass directly to useSyncExternalStore. */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Returns the current spec map snapshot.
   * A new Map reference is produced on every `set()` so useSyncExternalStore
   * detects changes. Entries for unchanged messages carry the same array
   * reference as before (copied via `new Map(this.data)`), which lets memo'd
   * MessageRow components bail out for non-streaming rows.
   */
  getSnapshot = (): Map<string, Spec[]> => {
    return this.data
  }

  /** Upsert a single spec at the given index for a message. */
  set(messageId: string, specIndex: number, spec: Spec): void {
    const existing = this.data.get(messageId) ?? []
    const updated = [...existing]
    updated[specIndex] = spec
    // Shallow-copy the map so unchanged entries keep their array references.
    this.data = new Map(this.data)
    this.data.set(messageId, updated)
    this.notify()
  }

  /** Wipe all specs (used on thread switch). */
  clear(): void {
    this.data = new Map()
    this.notify()
  }
}

/**
 * Subscribe to the full spec snapshot via useSyncExternalStore.
 * Components that need specs for a specific message should look up
 * `snapshot.get(messageId)` — historical message entries carry stable array
 * references so React.memo bails them out even when other entries update.
 */
export function useLiveSpecsSnapshot(store: LiveSpecStore): Map<string, Spec[]> {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
