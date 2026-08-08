import "./env.js";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "./chain.js";
import { requireEnv } from "./env.js";

const privateKey = requireEnv("MONAD_TESTNET_PRIVATE_KEY") as Hex;
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("MONAD_TESTNET_PRIVATE_KEY is invalid.");

export const account = privateKeyToAccount(privateKey);
const transport = http(requireEnv("MONAD_TESTNET_RPC_URL"), { retryCount: 5, retryDelay: 2_000 });

export const publicClient = createPublicClient({ chain: monadTestnet, transport });
export const walletClient = createWalletClient({ account, chain: monadTestnet, transport });
