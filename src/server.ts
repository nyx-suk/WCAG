import http from "node:http";
import { createAuditApp } from "./api/server";
import { runAudit } from "../engine/runAudit";
import { AuditStore } from "./persistence/sqlite";
import { resetFixtureState } from "../fixtures/server";

const port = Number(process.env.PORT) || 3000;
const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
const store = await AuditStore.open();

if (process.env.RESET_ON_STARTUP === "true") {
  console.log("[api] RESET_ON_STARTUP is set: resetting database and fixture states to clean demo state...");
  store.reset();
  resetFixtureState();
}

const server = http.createServer(createAuditApp({ store, runAudit }));

server.listen(port, "0.0.0.0", () => {
  console.log(`[api] Server running on port ${port}`);
  console.log(`[api] Local dashboard: http://localhost:${port}`);
  if (publicBaseUrl) {
    console.log(`[api] Public base URL: ${publicBaseUrl}`);
  }
});

const shutdown = (): void => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
