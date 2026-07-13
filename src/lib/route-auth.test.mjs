import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimiter, readBearerToken, RouteError } from "./route-auth.ts";

test("readBearerToken extracts the token and rejects malformed headers", () => {
  assert.equal(readBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(readBearerToken("bearer lowercase-scheme"), "lowercase-scheme");
  assert.equal(readBearerToken("Bearer   padded-token  "), "padded-token");

  assert.equal(readBearerToken(null), null);
  assert.equal(readBearerToken(""), null);
  assert.equal(readBearerToken("Bearer"), null);
  assert.equal(readBearerToken("Bearer "), null);
  assert.equal(readBearerToken("Basic dXNlcjpwYXNz"), null);
  assert.equal(readBearerToken("abc.def.ghi"), null);
});

test("rate limiter allows up to the maximum and then throws 429", () => {
  const enforce = createRateLimiter(60_000, 3);

  enforce("user-a");
  enforce("user-a");
  enforce("user-a");

  assert.throws(
    () => enforce("user-a"),
    (error) => error instanceof RouteError && error.status === 429,
  );

  // Andere Nutzer haben ein eigenes Kontingent.
  enforce("user-b");
});

test("rate limiter frees the quota once the window has passed", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const enforce = createRateLimiter(60_000, 2);

  enforce("user-a");
  enforce("user-a");
  assert.throws(() => enforce("user-a"), RouteError);

  // Direkt vor Fensterende bleibt gesperrt, danach ist wieder frei.
  t.mock.timers.setTime(1_000_000 + 59_999);
  assert.throws(() => enforce("user-a"), RouteError);
  t.mock.timers.setTime(1_000_000 + 60_000);
  enforce("user-a");
});

test("rate limiter evicts users whose entries have all expired", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const enforce = createRateLimiter(60_000, 1);

  enforce("user-a");
  assert.throws(() => enforce("user-a"), RouteError);

  // Nach Ablauf des Fensters zählt der alte Eintrag nicht mehr —
  // weder für das Limit noch als Speicherleiche.
  t.mock.timers.setTime(120_000);
  enforce("user-b");
  enforce("user-a");
});
