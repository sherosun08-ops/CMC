// Unified event bus — decoupled publish/subscribe for all modules

type EventHandler = (payload: { event: string; data: unknown; userId?: string; timestamp: Date }) => void | Promise<void>;

class EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private globalHandlers: Set<EventHandler> = new Set();

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  onAny(handler: EventHandler): void {
    this.globalHandlers.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  async emit(event: string, data: unknown, userId?: string): Promise<void> {
    const payload = { event, data, userId, timestamp: new Date() };
    const errors: Error[] = [];

    // Fire specific event handlers
    const specificHandlers = this.handlers.get(event);
    if (specificHandlers) {
      for (const handler of specificHandlers) {
        try {
          await handler(payload);
        } catch (err) {
          errors.push(err as Error);
        }
      }
    }

    // Fire global handlers
    for (const handler of this.globalHandlers) {
      try {
        await handler(payload);
      } catch (err) {
        errors.push(err as Error);
      }
    }

    if (errors.length > 0) {
      console.error(`EventBus: ${errors.length} handler(s) failed for event "${event}"`, errors);
    }
  }

  removeAll(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
  }
}

export const eventBus = new EventBus();
export default eventBus;