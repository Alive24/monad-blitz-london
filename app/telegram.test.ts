import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTelegramSavingsWindow,
  formatTelegramSavingsMessage,
  TelegramSavingsNotifier,
  type TelegramSavingsEvent,
} from "./telegram.js";

function savingsEvent(
  tick: number,
  optimizedImpact: number,
  staticImpact: number,
  previousOptimizedImpact = 0,
  previousStaticImpact = 0,
): TelegramSavingsEvent {
  return {
    trajectoryId: "trajectory-test",
    tick,
    asset: "WETH",
    direction: -1,
    stepPercent: 5,
    equity: 500_000,
    previousOptimizedImpact,
    previousStaticImpact,
    optimizedImpact,
    staticImpact,
    finalHealth: 1.75,
    actionCount: tick % 3 === 0 ? 6 : 0,
    liquidated: false,
  };
}

test("builds a cumulative ten-tick window with dollars and percentage", () => {
  const events = Array.from({ length: 10 }, (_, index) => {
    const tick = index + 1;
    return savingsEvent(tick, -0.006 * tick, -0.01 * tick, -0.006 * index, -0.01 * index);
  });
  const window = buildTelegramSavingsWindow(events);

  assert.equal(Math.round(window.amountSaved), 20_000);
  assert.equal(window.percentageSaved, 4);
  assert.equal(window.rebalanceCount, 3);
  assert.equal(window.actionCount, 18);
  assert.equal(window.marketPath[0]?.percentChange.toFixed(2), "-40.13");

  const message = formatTelegramSavingsMessage(window);
  assert.match(message, /SLICER SAVED YOUR ASS/);
  assert.match(message, /LAST 10 TICKS · T1–T10/);
  assert.match(message, /MONEY KEPT: \$20,000 \(4\.00% of your vault\)/);
  assert.match(message, /Static Aave: −\$50,000 \(−10\.00%\)/);
  assert.match(message, /Slicer: −\$30,000 \(−6\.00%\)/);
});

test("tick twenty reports only ticks eleven through twenty", async () => {
  const messages: string[] = [];
  const transport = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { text: string };
    messages.push(body.text);
    return new Response("{}", { status: 200 });
  };
  const notifier = new TelegramSavingsNotifier("token", "chat", transport as typeof fetch);

  for (let tick = 1; tick <= 10; tick += 1) {
    await notifier.notify(savingsEvent(tick, -0.006 * tick, -0.01 * tick, -0.006 * (tick - 1), -0.01 * (tick - 1)));
  }
  for (let tick = 11; tick <= 20; tick += 1) {
    const offset = tick - 10;
    await notifier.notify(savingsEvent(
      tick,
      -0.06 - 0.002 * offset,
      -0.10 - 0.006 * offset,
      -0.06 - 0.002 * (offset - 1),
      -0.10 - 0.006 * (offset - 1),
    ));
  }

  assert.equal(messages.length, 2);
  assert.match(messages[1]!, /LAST 10 TICKS · T11–T20/);
  assert.match(messages[1]!, /MONEY KEPT: \$20,000 \(4\.00% of your vault\)/);
  assert.doesNotMatch(messages[1]!, /\$40,000/);
});

test("can build the next ten-tick window after a server restart", async () => {
  const messages: string[] = [];
  const transport = async (_input: string | URL | Request, init?: RequestInit) => {
    messages.push((JSON.parse(String(init?.body)) as { text: string }).text);
    return new Response("{}", { status: 200 });
  };
  const restartedNotifier = new TelegramSavingsNotifier("token", "chat", transport as typeof fetch);

  for (let tick = 11; tick <= 20; tick += 1) {
    const offset = tick - 10;
    await restartedNotifier.notify(savingsEvent(
      tick,
      -0.06 - 0.002 * offset,
      -0.10 - 0.006 * offset,
      -0.06 - 0.002 * (offset - 1),
      -0.10 - 0.006 * (offset - 1),
    ));
  }

  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /LAST 10 TICKS · T11–T20/);
  assert.match(messages[0]!, /MONEY KEPT: \$20,000 \(4\.00% of your vault\)/);
});

test("does not notify when the last ten ticks produced no savings", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  };
  const notifier = new TelegramSavingsNotifier("token", "chat", transport as typeof fetch);
  let result;

  for (let tick = 1; tick <= 10; tick += 1) {
    result = await notifier.notify(savingsEvent(
      tick,
      -0.01 * tick,
      -0.006 * tick,
      -0.01 * (tick - 1),
      -0.006 * (tick - 1),
    ));
  }

  assert.equal(result?.status, "skipped");
  assert.equal(result && "reason" in result ? result.reason : undefined, "no-savings");
  assert.equal(calls, 0);
});
