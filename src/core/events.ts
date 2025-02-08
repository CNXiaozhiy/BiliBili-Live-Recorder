// events.ts

type Listener<T = any> = (args: T) => void;

export class EventEmitter<EventTypes> {
  private listenersMap: Map<EventTypes, Listener[]> = new Map();

  on(event: EventTypes, listener: Listener): this {
    if (!this.listenersMap.has(event)) {
      this.listenersMap.set(event, []);
    }
    this.listenersMap.get(event)!.push(listener);
    return this;
  }

  off(event: EventTypes | 'all', listener?: Listener): this {
    if (event === 'all') {
      this.listenersMap.clear();
    } else if (listener) {
      if (this.listenersMap.has(event)) {
        const listeners = this.listenersMap.get(event)!;
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    }

    return this;
  }

  emit(event: EventTypes, args?: any): void {
    if (this.listenersMap.has(event)) {
      this.listenersMap.get(event)!.forEach(listener => listener(args));
    }
  }
}