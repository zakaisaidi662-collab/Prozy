/**
 * KAIBLA - Express Server
 * 
 * Serves the frontend, integrates Ultraviolet proxy middleware,
 * and handles Wisp WebSocket upgrades for proxied traffic.
 */

import { join } from "node:path";
import { hostname } from "node:os";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import express from "express";
import wisp from "wisp-server-node";

import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicPath = join(__dirname, "..", "public");

const app = express();

// --- Static file serving ---
// Our public files take priority
app.use(express.static(publicPath));

// Ultraviolet core files (bundle, handler, sw, config, client)
app.use("/uv/", express.static(uvPath));

// Epoxy transport for bare-mux
app.use("/epoxy/", express.static(epoxyPath));

// BareMux shared worker
app.use("/baremux/", express.static(baremuxPath));

// 404 fallback
app.use((req, res) => {
    res.status(404);
    res.sendFile(join(publicPath, "404.html"));
});

// --- HTTP Server with Wisp WebSocket upgrade ---
const server = createServer();

server.on("request", (req, res) => {
    // Required headers for SharedArrayBuffer support (needed by bare-mux)
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    app(req, res);
});

server.on("upgrade", (req, socket, head) => {
    // Route wisp protocol upgrades
    if (req.url.endsWith("/wisp/")) {
        wisp.routeRequest(req, socket, head);
        return;
    }
    socket.end();
});

// --- Start server ---
let port = parseInt(process.env.PORT || "");
if (isNaN(port)) port = 8080;

server.on("listening", () => {
    const address = server.address();
    console.log("");
    console.log("  ╔══════════════════════════════════════════╗");
    console.log("  ║       🌌 KAIBLA is running       ║");
    console.log("  ╠══════════════════════════════════════════╣");
    console.log(`  ║  Local:   http://localhost:${address.port}          ║`);
    console.log(`  ║  Network: http://${hostname()}:${address.port}  ║`);
    console.log("  ╚══════════════════════════════════════════╝");
    console.log("");
});

// Graceful shutdown
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
    console.log("\n  Shutting down KAIBLA...");
    server.close();
    process.exit(0);
}

server.listen({ port });

