export interface TelegramSavingsEvent {
  trajectoryId: string;
  tick: number;
  asset: string;
  direction: -1 | 1;
  stepPercent: number;
  equity: number;
  previousOptimizedImpact: number;
  previousStaticImpact: number;
  optimizedImpact: number;
  staticImpact: number;
  finalHealth: number;
  actionCount: number;
  liquidated: boolean;
}

export interface TelegramSavingsWindow {
  startTick: number;
  endTick: number;
  amountSaved: number;
  percentageSaved: number;
  optimizedDollarChange: number;
  optimizedPercentChange: number;
  staticDollarChange: number;
  staticPercentChange: number;
  marketPath: Array<{ asset: string; percentChange: number }>;
  rebalanceCount: number;
  actionCount: number;
  finalHealth: number;
  liquidated: boolean;
}

export type TelegramNotificationResult =
  | { status: "sent"; amountSaved: number; percentageSaved: number }
  | { status: "disabled"; amountSaved: number; percentageSaved: number }
  | { status: "failed"; amountSaved: number; percentageSaved: number }
  | {
      status: "skipped";
      amountSaved: number;
      percentageSaved: number;
      reason: "interval" | "no-savings" | "duplicate" | "incomplete-window";
    };

type FetchTransport = typeof fetch;

function dollarGap(event: TelegramSavingsEvent): number {
  return (event.optimizedImpact - event.staticImpact) * event.equity;
}

function signedMoney(value: number): string {
  const dollars = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${dollars}`;
}

function signedPercent(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;
}

export function buildTelegramSavingsWindow(
  events: TelegramSavingsEvent[],
): TelegramSavingsWindow {
  if (events.length !== 10) throw new Error("A savings notification requires exactly ten ticks");
  const ordered = [...events].sort((left, right) => left.tick - right.tick);
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const baselineOptimizedDollars = first.previousOptimizedImpact * first.equity;
  const baselineStaticDollars = first.previousStaticImpact * first.equity;
  const optimizedDollarChange = last.optimizedImpact * last.equity - baselineOptimizedDollars;
  const staticDollarChange = last.staticImpact * last.equity - baselineStaticDollars;
  const amountSaved = optimizedDollarChange - staticDollarChange;
  const marketFactors = new Map<string, number>();

  for (const event of ordered) {
    const previousFactor = marketFactors.get(event.asset) ?? 1;
    marketFactors.set(event.asset, previousFactor * (1 + event.direction * event.stepPercent / 100));
  }

  return {
    startTick: first.tick,
    endTick: last.tick,
    amountSaved,
    percentageSaved: amountSaved / last.equity * 100,
    optimizedDollarChange,
    optimizedPercentChange: optimizedDollarChange / last.equity * 100,
    staticDollarChange,
    staticPercentChange: staticDollarChange / last.equity * 100,
    marketPath: [...marketFactors].map(([asset, factor]) => ({ asset, percentChange: (factor - 1) * 100 })),
    rebalanceCount: ordered.filter((event) => event.actionCount > 0 && !event.liquidated).length,
    actionCount: ordered.reduce((total, event) => total + event.actionCount, 0),
    finalHealth: last.finalHealth,
    liquidated: last.liquidated,
  };
}

export function formatTelegramSavingsMessage(window: TelegramSavingsWindow): string {
  const saved = signedMoney(window.amountSaved).replace("+", "");
  const marketPath = window.marketPath
    .map(({ asset, percentChange }) => `${asset} ${signedPercent(percentChange)}`)
    .join(" · ");
  const intervention = window.liquidated
    ? "⚠️ Position liquidated and permanently closed."
    : window.rebalanceCount > 0
      ? `🧯 ${window.rebalanceCount} rebalances · ${window.actionCount} asset actions · final HF ${window.finalHealth.toFixed(2)}`
      : `🛡️ No rebalance needed · final HF ${window.finalHealth.toFixed(2)}`;
  const closing = window.staticDollarChange < 0
    ? `That is ${saved} the do-nothing strategy would have burned. Slicer kept it yours.`
    : `That is ${saved} of extra value the do-nothing strategy would have left on the table.`;

  return [
    "🚨🛟 SLICER SAVED YOUR ASS",
    "",
    `LAST 10 TICKS · T${window.startTick}–T${window.endTick}`,
    `Market path: ${marketPath}`,
    `Do nothing: ${signedMoney(window.staticDollarChange)} (${signedPercent(window.staticPercentChange)})`,
    `Slicer: ${signedMoney(window.optimizedDollarChange)} (${signedPercent(window.optimizedPercentChange)})`,
    "",
    `💰 MONEY KEPT: ${saved} (${window.percentageSaved.toFixed(2)}% of your vault)`,
    intervention,
    "",
    closing,
  ].join("\n");
}

export class TelegramSavingsNotifier {
  private readonly sent = new Set<string>();
  private readonly history = new Map<string, Map<number, TelegramSavingsEvent>>();

  constructor(
    private readonly botToken: string | undefined,
    private readonly chatId: string | undefined,
    private readonly transport: FetchTransport = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  private record(event: TelegramSavingsEvent): Map<number, TelegramSavingsEvent> {
    const trajectory = this.history.get(event.trajectoryId) ?? new Map<number, TelegramSavingsEvent>();
    trajectory.set(event.tick, event);
    for (const tick of trajectory.keys()) {
      if (tick < event.tick - 9) trajectory.delete(tick);
    }
    this.history.set(event.trajectoryId, trajectory);
    return trajectory;
  }

  async notify(event: TelegramSavingsEvent): Promise<TelegramNotificationResult> {
    const trajectory = this.record(event);
    if (event.tick % 10 !== 0) {
      return { status: "skipped", amountSaved: 0, percentageSaved: 0, reason: "interval" };
    }

    const events: TelegramSavingsEvent[] = [];
    for (let tick = event.tick - 9; tick <= event.tick; tick += 1) {
      const recorded = trajectory.get(tick);
      if (!recorded) {
        return { status: "skipped", amountSaved: 0, percentageSaved: 0, reason: "incomplete-window" };
      }
      events.push(recorded);
    }
    const window = buildTelegramSavingsWindow(events);
    const amountSaved = Math.max(0, window.amountSaved);
    const percentageSaved = Math.max(0, window.percentageSaved);
    if (amountSaved < 0.01) return { status: "skipped", amountSaved, percentageSaved, reason: "no-savings" };

    const key = `${event.trajectoryId}:${event.tick}`;
    if (this.sent.has(key)) return { status: "skipped", amountSaved, percentageSaved, reason: "duplicate" };
    if (!this.configured) return { status: "disabled", amountSaved, percentageSaved };

    try {
      const response = await this.transport(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: formatTelegramSavingsMessage(window),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return { status: "failed", amountSaved, percentageSaved };
      this.sent.add(key);
      return { status: "sent", amountSaved, percentageSaved };
    } catch {
      return { status: "failed", amountSaved, percentageSaved };
    }
  }
}
