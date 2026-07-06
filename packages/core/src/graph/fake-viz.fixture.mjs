// Test fixture for viz-manager: mimics the engine's UI mode — binds the
// --port on 127.0.0.1, serves 200, and exits on stdin EOF (spike ⑥ lifecycle).
import http from "node:http";

const portArg = process.argv.find((a) => a.startsWith("--port="));
const port = Number(portArg?.split("=")[1] ?? 0);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<!doctype html><title>fake viz</title>");
});
server.listen(port, "127.0.0.1");

process.stdin.resume();
process.stdin.on("end", () => process.exit(0));
process.stdin.on("close", () => process.exit(0));
