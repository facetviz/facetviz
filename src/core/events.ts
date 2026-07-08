/** Minimal typed event emitter used for chart/series/point event callbacks. */

export type Listener<T = unknown> = (payload: T) => void;

export class EventEmitter {
  private handlers = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener: Listener): void {
    this.handlers.get(event)?.delete(listener);
  }

  emit(event: string, payload?: unknown): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const listener of set) listener(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
