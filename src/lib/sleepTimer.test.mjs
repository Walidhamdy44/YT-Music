import test from "node:test";
import assert from "node:assert/strict";
import { scheduleSleepTimer } from "./sleepTimer.ts";

function fakeClock() {
  let now = 0;
  let sequence = 0;
  const tasks = new Map();
  return {
    now: () => now,
    setTimeout: (callback, delay) => { const id = ++sequence; tasks.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => tasks.delete(id),
    jump: (time) => { now = time; },
    fire: () => { const [id, task] = tasks.entries().next().value; tasks.delete(id); task.callback(); },
    get pending() { return tasks.size; },
  };
}

test("expires once when a suspended tab wakes after its deadline", () => {
  const clock = fakeClock();
  let pauses = 0;
  scheduleSleepTimer(60_000, () => pauses++, clock);
  clock.jump(90_000);
  clock.fire();
  assert.equal(pauses, 1);
  assert.equal(clock.pending, 0);
});

test("cancelled and replaced timers cannot pause playback", () => {
  const clock = fakeClock();
  let pauses = 0;
  const cancel = scheduleSleepTimer(60_000, () => pauses++, clock);
  cancel();
  const cancelReplacement = scheduleSleepTimer(120_000, () => pauses++, clock);
  clock.jump(60_000);
  clock.fire();
  assert.equal(pauses, 0);
  assert.equal(clock.pending, 1);
  cancelReplacement();
  assert.equal(clock.pending, 0);
});

test("an already expired deadline pauses on the next task", () => {
  const clock = fakeClock();
  clock.jump(100);
  let paused = false;
  scheduleSleepTimer(50, () => { paused = true; }, clock);
  assert.equal(paused, false);
  clock.fire();
  assert.equal(paused, true);
});
