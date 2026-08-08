export interface TelegramSavingsEvent {
  trajectoryId: string;
  tick: number;
  asset: string;
  direction: -1 | 1;
  stepPercent: number;
  equity: number;
  optimizedImpact: number;
  staticImpact: number;
  finalHealth: number;
  actionCount: number;
  liquidated: boolean;
}

export type TelegramNotificationResult =
  | { status: "sent"; amountSaved: number }
  | { status: "disabled"; amountSaved: number }
  | { status: "failed"; amountSaved: number }
  | { status: "skipped"; amountSaved: number; reason: "interval" | "no-savings" | "duplicate" };

type FetchTransport = typeof fetch;

function savedAmount(event: TelegramSavingsEvent): number {
  return Math.max(0, (event.optimizedImpact - event.staticImpact) * event.equity);
}

export function formatTelegramSavingsMessage(event: TelegramSavingsEvent, amountSaved = savedAmount(event)): string {
  const move = `${event.direction > 0 ? "+" : "−"}${event.stepPercent}% ${event.asset}`;
  const outcome = event.liquidated
    ? "Position liquidated"
    : event.actionCount > 0
      ? `Rebalanced with ${event.actionCount} actions`
      : "No rebalance";
  const dollars = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountSaved);
  return `Slicer tick ${event.tick}: ${move}. ${outcome}; HF ${event.finalHealth.toFixed(2)}. Saved ${dollars} vs static Aave.`;
}

export class TelegramSavingsNotifier {
  private readonly sent = new Set<string>();

  constructor(
    private readonly botToken: string | undefined,
    private readonly chatId: string | undefined,
    private readonly transport: FetchTransport = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  async notify(event: TelegramSavingsEvent): Promise<TelegramNotificationResult> {
    const amountSaved = savedAmount(event);
    if (event.tick % 10 !== 0) return { status: "skipped", amountSaved, reason: "interval" };
    if (amountSaved < 0.01) return { status: "skipped", amountSaved, reason: "no-savings" };

    const key = `${event.trajectoryId}:${event.tick}`;
    if (this.sent.has(key)) return { status: "skipped", amountSaved, reason: "duplicate" };
    if (!this.configured) return { status: "disabled", amountSaved };

    try {
      const response = await this.transport(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: formatTelegramSavingsMessage(event, amountSaved),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return { status: "failed", amountSaved };
      this.sent.add(key);
      return { status: "sent", amountSaved };
    } catch {
      return { status: "failed", amountSaved };
    }
  }
}
