import { createPublicClient, createWalletClient, http, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "./chain.js";
import { env } from "./env.js";

export const account = privateKeyToAccount(env.privateKey);

const baseTransport = http(env.rpcUrl, { retryCount: 5, retryDelay: 2_000, timeout: 20_000 });
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const scheduled = requestQueue.then(async () => {
    const wait = Math.max(0, lastRequestAt + 1_100 - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return work();
  });
  requestQueue = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

const transport: Transport = (options) => {
  const base = baseTransport(options);
  return {
    ...base,
    request: (args) => enqueue(async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await base.request(args);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes("requests limited") || attempt >= 5) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
        }
      }
    }),
  };
};

export const publicClient = createPublicClient({ chain: monadTestnet, transport });
export const walletClient = createWalletClient({ account, chain: monadTestnet, transport });
