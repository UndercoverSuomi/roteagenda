import assert from "node:assert/strict";
import test from "node:test";

import { createSyncQueue } from "./sync-queue.ts";

function harness({ failOn = new Set() } = {}) {
  const executed = [];
  const saves = [];
  const states = [];
  const queue = createSyncQueue({
    execute: async (op) => {
      if (failOn.has(op.n)) {
        throw new Error(`Job ${op.n} kaputt`);
      }
      executed.push(op.n);
    },
    save: (entries) => saves.push(entries.map((entry) => entry.op.n)),
    onChange: (status, failure, pendingCount) =>
      states.push({ status, failure, pendingCount }),
  });

  return { queue, executed, saves, states, failOn };
}

test("executes pushed ops serially and persists the shrinking queue", async () => {
  const { queue, executed, saves } = harness();

  queue.push("a", { n: 1 });
  queue.push("b", { n: 2 });
  await queue.flush();

  assert.deepEqual(executed, [1, 2]);
  assert.deepEqual(saves.at(-1), []);
  assert.equal(queue.pendingCount(), 0);
});

test("a failing op stops the queue, reports the label, and retry resumes", async () => {
  const { queue, executed, states, failOn } = harness({ failOn: new Set([2]) });

  queue.push("a", { n: 1 });
  queue.push("b", { n: 2 });
  queue.push("c", { n: 3 });
  await queue.flush();

  assert.deepEqual(executed, [1]);
  assert.equal(queue.pendingCount(), 2);
  const last = states.at(-1);
  assert.equal(last.status, "error");
  assert.equal(last.failure.label, "b");
  assert.match(last.failure.detail, /Job 2 kaputt/);

  failOn.delete(2);
  queue.retry();
  await queue.flush();

  assert.deepEqual(executed, [1, 2, 3]);
  assert.equal(queue.pendingCount(), 0);
});

test("discardCurrent drops the failed op and continues with the rest", async () => {
  const { queue, executed } = harness({ failOn: new Set([2]) });

  queue.push("a", { n: 1 });
  queue.push("b", { n: 2 });
  queue.push("c", { n: 3 });
  await queue.flush();
  assert.deepEqual(executed, [1]);

  queue.discardCurrent();
  await queue.flush();

  assert.deepEqual(executed, [1, 3]);
  assert.equal(queue.pendingCount(), 0);
});

test("hydrate runs restored ops before ops pushed afterwards", async () => {
  const { queue, executed } = harness();

  queue.hydrate([
    { label: "alt", op: { n: 10 } },
    { label: "alt", op: { n: 11 } },
  ]);
  queue.push("neu", { n: 12 });
  await queue.flush();

  assert.deepEqual(executed, [10, 11, 12]);
});

test("flush resolves immediately when the queue is idle", async () => {
  const { queue } = harness();
  await queue.flush();
  assert.equal(queue.pendingCount(), 0);
});

test("clear drops all pending ops and persists the empty queue", async () => {
  const { queue, executed, saves } = harness({ failOn: new Set([1]) });

  queue.push("a", { n: 1 });
  queue.push("b", { n: 2 });
  await queue.flush();
  assert.deepEqual(executed, []);
  assert.equal(queue.pendingCount(), 2);

  queue.clear();

  assert.equal(queue.pendingCount(), 0);
  assert.deepEqual(saves.at(-1), []);
});
