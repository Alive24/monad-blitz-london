import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTelegramSavingsWindow,
  formatTelegramInterventionMessage,
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
  actionCount = 0,
  preHealth = 1.68,
): TelegramSavingsEvent {
  return {
    trajectoryId: "trajectory-test",
    tick,
    asset: "WETH",
    direction: -1,
    stepPercent: 10,
    equity: 500_000,
    previousOptimizedImpact,
    previousStaticImpact,
    optimizedImpact,
    staticImpact,
    preHealth,
    finalHealth: 1.75,
    actionCount,
    liquidated: false,
  };
}

test("builds a cumulative five-tick window with dollars and percentage", () => {
  const events = Array.from({ length: 5 }, (_, index) => {
    const tick = index + 1;
    return savingsEvent(
      tick,
      -0.006 * tick,
      -0.01 * tick,
      -0.006 * index,
      -0.01 * index,
      tick % 3 === 0 ? 6 : 0,
    );
  });
  const window = buildTelegramSavingsWindow(events);

  assert.equal(Math.round(window.amountSaved), 10_000);
  assert.equal(window.percentageSaved, 2);
  assert.equal(window.rebalanceCount, 1);
  assert.equal(window.actionCount, 6);
  assert.equal(window.marketPath[0]?.percentChange.toFixed(2), "-40.95");

  const message = formatTelegramSavingsMessage(window);
  assert.match(message, /SLICER SAVED YOUR ASS/);
  assert.match(message, /LAST 5 TICKS · T1–T5/);
  assert.match(message, /MONEY KEPT: \$10,000 \(2\.00% of your vault\)/);
  assert.match(message, /Do nothing: −\$25,000 \(−5\.00%\)/);
  assert.match(message, /Slicer: −\$15,000 \(−3\.00%\)/);
});

test("alerts only after five ticks without an intervention", async () => {
  const messages: string[] = [];
  const transport = async (_input: string | URL | Request, init?: RequestInit) => {
    messages.push((JSON.parse(String(init?.body)) as { text: string }).text);
    return new Response("{}", { status: 200 });
  };
  const notifier = new TelegramSavingsNotifier("token", "chat", transport as typeof fetch);

  for (let tick = 1; tick <= 9; tick += 1) {
    const actionCount = tick === 1 || tick === 2 || tick === 8 || tick === 9 ? 6 : 0;
    await notifier.notify(savingsEvent(
      tick,
      -0.006 * tick,
      -0.01 * tick,
      -0.006 * (tick - 1),
      -0.01 * (tick - 1),
      actionCount,
      1.62,
    ));
  }

  const interventionMessages = messages.filter((message) => message.includes("SLICER STEPPED IN"));
  assert.equal(interventionMessages.length, 2);
  assert.equal(interventionMessages[0], formatTelegramInterventionMessage(savingsEvent(1, -0.006, -0.01, 0, 0, 6, 1.62)));
  assert.equal(interventionMessages[1], formatTelegramInterventionMessage(savingsEvent(8, -0.048, -0.08, -0.042, -0.07, 6, 1.62)));
  assert.match(interventionMessages[0]!, /intervention alert after a quiet period/);
  assert.match(interventionMessages[0]!, /HF rescued: 1\.62 → 1\.75/);
  assert.match(interventionMessages[0]!, /Next alert: the cumulative dollars and percentage saved at T5/);
  assert.match(interventionMessages[1]!, /T8 · intervention alert after a quiet period/);
});

test("stays quiet when prior intervention history is missing after restart", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  };
  const notifier = new TelegramSavingsNotifier("token", "chat", transport as typeof fetch);

  const result = await notifier.notify(savingsEvent(8, -0.048, -0.08, -0.042, -0.07, 6, 1.62));

  assert.equal(result.status, "skipped");
  assert.equal(calls, 0);
});

test("anchors the five-tick summary to the first intervention", async () => {
  const messages: string[] = [];
  const transport = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { text: string };
    messages.push(body.text);
    return new Response("{}", { status: 200 });
  };
  const notifier = new TelegramSavingsNotifier("token", "chat", transport as typeof fetch);

  for (let tick = 1; tick <= 8; tick += 1) {
    await notifier.notify(savingsEvent(
      tick,
      -0.006 * tick,
      -0.01 * tick,
      -0.006 * (tick - 1),
      -0.01 * (tick - 1),
      tick === 4 ? 6 : 0,
    ));
    if (tick === 5) {
      assert.equal(messages.length, 1);
      assert.doesNotMatch(messages[0]!, /LAST 5 TICKS/);
    }
  }

  assert.equal(messages.length, 2);
  assert.match(messages[0]!, /T4 · intervention alert after a quiet period/);
  assert.match(messages[0]!, /Next alert: the cumulative dollars and percentage saved at T8/);
  assert.match(messages[1]!, /LAST 5 TICKS · T4–T8/);
  assert.match(messages[1]!, /MONEY KEPT: \$10,000 \(2\.00% of your vault\)/);
});

test("does not send periodic summaries before an intervention", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  };
  const notifier = new TelegramSavingsNotifier("token", "chat", transport as typeof fetch);

  for (let tick = 1; tick <= 10; tick += 1) {
    await notifier.notify(savingsEvent(
      tick,
      -0.006 * tick,
      -0.01 * tick,
      -0.006 * (tick - 1),
      -0.01 * (tick - 1),
    ));
  }

  assert.equal(calls, 0);
});

test("does not send an anchored summary when it produced no savings", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  };
  const notifier = new TelegramSavingsNotifier("token", "chat", transport as typeof fetch);
  let result;

  for (let tick = 1; tick <= 5; tick += 1) {
    result = await notifier.notify(savingsEvent(
      tick,
      -0.01 * tick,
      -0.006 * tick,
      -0.01 * (tick - 1),
      -0.006 * (tick - 1),
      tick === 1 ? 6 : 0,
    ));
  }

  assert.equal(result?.status, "skipped");
  assert.equal(result && "reason" in result ? result.reason : undefined, "no-savings");
  assert.equal(calls, 1);
});
