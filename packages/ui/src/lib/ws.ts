import type { WsServerEvent } from "@sparstrow/shared";

type EventListener = (event: WsServerEvent) => void;
type StatusListener = (connected: boolean) => void;

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 5000;

/**
 * Singleton WebSocket hub for /ws. Lazily connects on first subscription and
 * auto-reconnects with exponential backoff (500ms doubling, capped at 5s).
 */
class WsHub {
  private socket: WebSocket | null = null;
  private listeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private connected = false;
  private started = false;
  private backoffMs = INITIAL_BACKOFF_MS;
  private reconnectTimer: number | null = null;

  get isConnected(): boolean {
    return this.connected;
  }

  /** Subscribe to server events. Returns an unsubscribe function. */
  subscribe(fn: EventListener): () => void {
    this.listeners.add(fn);
    this.ensureStarted();
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Subscribe to connection status changes. Returns an unsubscribe function. */
  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    this.ensureStarted();
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  private ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  private connect(): void {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.setConnected(true);
    };

    socket.onmessage = (msg: MessageEvent) => {
      let event: WsServerEvent;
      try {
        event = JSON.parse(String(msg.data)) as WsServerEvent;
      } catch {
        return; // ignore malformed frames
      }
      for (const fn of this.listeners) fn(event);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setConnected(false);
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    for (const fn of this.statusListeners) fn(value);
  }
}

export const wsHub = new WsHub();
