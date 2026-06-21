// Intentionally minimal: the UI talks to the core over HTTP/WS only.
// Exposed marker lets the web app detect it's running inside the shell.
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("sparstrowDesktop", { version: "0.1.0" });
