import type { FastifyInstance } from "fastify";
import { WS_PATH } from "@sparstrow/shared";
import { bus } from "../events/bus.js";

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get(WS_PATH, { websocket: true }, (socket) => {
    const unsubscribe = bus.subscribe((event) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    });
    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });
}
