import { EventEmitter } from "node:events";
import type { WsServerEvent } from "@sparstrow/shared";

class EventBus extends EventEmitter {
  publish(event: WsServerEvent): void {
    this.emit("event", event);
  }

  subscribe(listener: (event: WsServerEvent) => void): () => void {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}

export const bus = new EventBus();
bus.setMaxListeners(100);
