import express, { type Express, type Request, type Response } from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PAGES_DIR = path.resolve(__dirname, "pages");
const ASSETS_DIR = path.resolve(__dirname, "assets");

export interface FixtureServerState {
  tc2Fixed: boolean;
  tc4Fixed: boolean;
}

let serverState: FixtureServerState = {
  tc2Fixed: false,
  tc4Fixed: false,
};

let activeServer: http.Server | null = null;

export function resetFixtureState(): void {
  serverState.tc2Fixed = false;
  serverState.tc4Fixed = false;
}

export function getFixtureState(): Readonly<FixtureServerState> {
  return serverState;
}

export function setFixtureState(partial: Partial<FixtureServerState>): void {
  serverState = { ...serverState, ...partial };
}

export function createFixtureApp(): Express {
  const app = express();

  app.use(express.json());

  // Enforce no caching on all fixture responses
  app.use((_req: Request, res: Response, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).send("ok");
  });

  // TC2 state management endpoints
  app.get("/__state/tc2", (_req: Request, res: Response) => {
    res.json({ fixed: serverState.tc2Fixed });
  });

  app.post("/__state/tc2", (req: Request, res: Response) => {
    const { fixed } = req.body ?? {};
    if (typeof fixed !== "boolean") {
      res.status(400).json({ error: "Request body must contain boolean 'fixed' property" });
      return;
    }
    serverState.tc2Fixed = fixed;
    res.json({ fixed: serverState.tc2Fixed });
  });

  app.get("/__state/tc4", (_req: Request, res: Response) => {
    res.json({ fixed: serverState.tc4Fixed });
  });

  app.post("/__state/tc4", (req: Request, res: Response) => {
    const { fixed } = req.body ?? {};
    if (typeof fixed !== "boolean") {
      res.status(400).json({ error: "Request body must contain boolean 'fixed' property" });
      return;
    }
    serverState.tc4Fixed = fixed;
    res.json({ fixed: serverState.tc4Fixed });
  });

  // Reset all state to broken
  app.post("/__state/reset", (_req: Request, res: Response) => {
    resetFixtureState();
    res.json({ reset: true, fixed: serverState.tc2Fixed });
  });

  // TC1 fixture pages
  app.get("/tc1/bad", (_req: Request, res: Response) => {
    res.sendFile(path.join(PAGES_DIR, "tc1-bad.html"));
  });

  app.get("/tc1/good", (_req: Request, res: Response) => {
    res.sendFile(path.join(PAGES_DIR, "tc1-good.html"));
  });

  // TC2 fixture page reflecting dynamic state
  app.get("/tc2", (_req: Request, res: Response) => {
    const filename = serverState.tc2Fixed ? "tc2-fixed.html" : "tc2-broken.html";
    res.sendFile(path.join(PAGES_DIR, filename));
  });

  // TC3 fixture page
  app.get("/tc3", (_req: Request, res: Response) => {
    res.sendFile(path.join(PAGES_DIR, "tc3.html"));
  });
  // TC4 fixture page
  app.get("/tc4", (_req: Request, res: Response) => {
    res.sendFile(path.join(PAGES_DIR, serverState.tc4Fixed ? "tc4-fixed.html" : "tc4-broken.html"));
  });

  app.get("/assets/tc3-photo.svg", (_req: Request, res: Response) => {
    res.sendFile(path.join(ASSETS_DIR, "tc3-photo.svg"));
  });

  return app;
}

export function startFixtureServer(port?: number): http.Server {
  const listenPort = port ?? (Number(process.env.FIXTURE_PORT) || 4000);
  const app = createFixtureApp();
  const server = http.createServer(app);

  server.listen(listenPort, () => {
    console.log(`[fixtures] Server running on http://localhost:${listenPort}`);
  });

  activeServer = server;
  return server;
}

export function stopFixtureServer(server?: http.Server): Promise<void> {
  const s = server ?? activeServer;
  if (!s) return Promise.resolve();

  return new Promise((resolve, reject) => {
    s.close((err) => {
      if (err) {
        reject(err);
      } else {
        if (s === activeServer) {
          activeServer = null;
        }
        resolve();
      }
    });
  });
}

// Auto-start when executed directly via npm run fixtures
const isEntry = Boolean(
  process.argv[1] &&
    (path.resolve(process.argv[1]) === __filename ||
      pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
);

if (isEntry) {
  startFixtureServer();
}
