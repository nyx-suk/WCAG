import http from "node:http";
import { createAuditApp } from "./api/server";
import { runAudit } from "../engine/runAudit";
import { AuditStore } from "./persistence/sqlite";

const port = Number(process.env.PORT) || 3000;
const store = await AuditStore.open();
const server = http.createServer(createAuditApp({ store, runAudit }));

server.listen(port, () => {
  console.log(`[api] Server running on http://localhost:${port}`);
});

const shutdown = (): void => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
