import { config } from "dotenv";
import { getAddress, type Address, type Hex } from "viem";

config({ path: ".env.local", quiet: true });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

function address(name: string): Address {
  return getAddress(required(name));
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

const privateKey = required("MONAD_TESTNET_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("MONAD_TESTNET_PRIVATE_KEY must be a 32-byte 0x-prefixed hex value");
}

export const env = {
  host: process.env.APP_HOST?.trim() || "127.0.0.1",
  port: Number(process.env.APP_PORT || 4174),
  rpcUrl: required("MONAD_TESTNET_RPC_URL"),
  privateKey: privateKey as Hex,
  poolAddress: address("AAVE_POOL_ADDRESS"),
  vaultAddress: address("MANAGED_VAULT_ADDRESS"),
  telegramBotToken: optional("TELEGRAM_BOT_TOKEN"),
  telegramChatId: optional("TELEGRAM_CHAT_ID"),
  assets: {
    WETH: { address: address("ASSET_WETH_ADDRESS"), decimals: 18 },
    wstETH: { address: address("ASSET_WSTETH_ADDRESS"), decimals: 18 },
    USDC: { address: address("ASSET_USDC_ADDRESS"), decimals: 6 },
    AUSD: { address: address("ASSET_AUSD_ADDRESS"), decimals: 6 },
    USDe: { address: address("ASSET_USDE_ADDRESS"), decimals: 18 },
  },
} as const;

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error("APP_PORT must be a valid TCP port");
}
