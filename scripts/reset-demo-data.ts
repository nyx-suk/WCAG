import { AuditStore } from "../src/persistence/sqlite";
import { resetFixtureState } from "../fixtures/server";

async function main(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH ?? "data/auditor.sqlite";
  console.log(`[demo:reset] Opening store at ${dbPath}...`);
  const store = await AuditStore.open(dbPath);
  store.reset();
  store.close();

  resetFixtureState();
  console.log("[demo:reset] Demo data and fixture states successfully reset to clean initial state.");
}

main().catch((err) => {
  console.error("[demo:reset] Failed to reset demo data:", err);
  process.exit(1);
});
