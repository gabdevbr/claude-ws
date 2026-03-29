/**
 * Butler Event Collector.
 * Buffers workspace events (task changes, project changes, agent events)
 * and flushes them on heartbeat tick for the decision loop.
 * Cap at 100 events to prevent memory issues.
 */
import type { ButlerEvent } from './butler-types';

const MAX_BUFFER_SIZE = 100;

export function createButlerEventCollector() {
  let buffer: ButlerEvent[] = [];

  return {
    /** Push an event into the buffer */
    push(event: ButlerEvent): void {
      buffer.push(event);
      if (buffer.length > MAX_BUFFER_SIZE) {
        buffer = buffer.slice(-MAX_BUFFER_SIZE);
      }
    },

    /** Flush and return all buffered events, clearing the buffer */
    flush(): ButlerEvent[] {
      const events = [...buffer];
      buffer = [];
      return events;
    },

    /** Current buffer size */
    size(): number {
      return buffer.length;
    },

    /** Peek at events without flushing */
    peek(): ReadonlyArray<ButlerEvent> {
      return buffer;
    },
  };
}

export type ButlerEventCollector = ReturnType<typeof createButlerEventCollector>;
