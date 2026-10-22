import test from "node:test";
import assert from "node:assert/strict";
import { startFixtureServer, stopFixtureServer, resetFixtureState } from "../fixtures/server";

const TEST_PORT = 4099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

test("fixtures server endpoints and state toggling", async (t) => {
  resetFixtureState();
  const server = startFixtureServer(TEST_PORT);

  // Allow server to begin listening
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.after(async () => {
    await stopFixtureServer(server);
  });

  // 1. /health check
  const healthRes = await fetch(`${BASE_URL}/health`);
  assert.equal(healthRes.status, 200);
  assert.equal(await healthRes.text(), "ok");
  assert.equal(healthRes.headers.get("cache-control"), "no-store");

  // 2. /tc1/bad and /tc1/good
  const tc1BadRes = await fetch(`${BASE_URL}/tc1/bad`);
  assert.equal(tc1BadRes.status, 200);
  const tc1BadHtml = await tc1BadRes.text();
  assert.match(tc1BadHtml, /Weekly Tech Digest/);
  assert.match(tc1BadHtml, /Open newsletter signup/);

  const tc1GoodRes = await fetch(`${BASE_URL}/tc1/good`);
  assert.equal(tc1GoodRes.status, 200);
  const tc1GoodHtml = await tc1GoodRes.text();
  assert.match(tc1GoodHtml, /Weekly Tech Digest/);
  assert.match(tc1GoodHtml, /Open newsletter signup/);

  // 3. /tc2 initial state (broken)
  const stateRes1 = await fetch(`${BASE_URL}/__state/tc2`);
  assert.equal(stateRes1.status, 200);
  const state1 = await stateRes1.json();
  assert.deepEqual(state1, { fixed: false });

  const tc2BrokenRes = await fetch(`${BASE_URL}/tc2`);
  assert.equal(tc2BrokenRes.status, 200);
  const tc2BrokenHtml = await tc2BrokenRes.text();
  assert.match(tc2BrokenHtml, /<div id="add-to-cart"/);
  assert.match(tc2BrokenHtml, /ProSound Studio Wireless Headphones/);

  // 4. Toggle TC2 state to fixed
  const updateRes = await fetch(`${BASE_URL}/__state/tc2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed: true }),
  });
  assert.equal(updateRes.status, 200);
  const updateJson = await updateRes.json();
  assert.deepEqual(updateJson, { fixed: true });

  const tc2FixedRes = await fetch(`${BASE_URL}/tc2`);
  assert.equal(tc2FixedRes.status, 200);
  const tc2FixedHtml = await tc2FixedRes.text();
  assert.match(tc2FixedHtml, /<button type="button" id="add-to-cart"/);
  assert.match(tc2FixedHtml, /ProSound Studio Wireless Headphones/);

  // 5. Reset state
  const resetRes = await fetch(`${BASE_URL}/__state/reset`, { method: "POST" });
  assert.equal(resetRes.status, 200);

  const tc2ResetRes = await fetch(`${BASE_URL}/tc2`);
  const tc2ResetHtml = await tc2ResetRes.text();
  assert.match(tc2ResetHtml, /<div id="add-to-cart"/);

  const tc4BrokenRes = await fetch(`${BASE_URL}/tc4`);
  assert.equal(tc4BrokenRes.status, 200);
  assert.match(await tc4BrokenRes.text(), /onclick/);

  const tc4UpdateRes = await fetch(`${BASE_URL}/__state/tc4`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixed: true }),
  });
  assert.equal(tc4UpdateRes.status, 200);
  assert.deepEqual(await tc4UpdateRes.json(), { fixed: true });

  const tc4FixedRes = await fetch(`${BASE_URL}/tc4`);
  assert.match(await tc4FixedRes.text(), /<button type="button" id="next-step"/);
});
