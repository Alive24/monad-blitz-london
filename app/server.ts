import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  formatUnits,
  getAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { transactionUrl } from "./chain.js";
import { harnessAbi, poolAbi, vaultAbi } from "./contracts.js";
import { env } from "./env.js";
import { TelegramSavingsNotifier } from "./telegram.js";
import { account, publicClient, walletClient } from "./viem.js";

const pagePath = resolve("docs/reference/slicer-v4.html");
const actionTypes = { SUPPLY: 0, WITHDRAW: 1, BORROW: 2, REPAY: 3 } as const;
type ActionName = keyof typeof actionTypes;
type AssetName = keyof typeof env.assets;

interface LiveActionInput {
  type: ActionName;
  asset: AssetName;
  units: string;
  value?: number;
}

interface LiveStepInput {
  asset: AssetName;
  direction: -1 | 1;
  trajectoryId: string;
  tick: number;
  stepPercent: number;
  equity: number;
  optimizedImpact: number;
  staticImpact: number;
  preHealth: number;
  targetHealth: number;
  actions: LiveActionInput[];
}

let transactionInFlight = false;
const telegramNotifier = new TelegramSavingsNotifier(env.telegramBotToken, env.telegramChatId);

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function cleanError(error: unknown): string {
  const details = error && typeof error === "object" && "details" in error ? String(error.details) : "";
  const message = details || (error instanceof Error ? error.message : String(error));
  return message.split("\n")[0].replace(/0x[0-9a-fA-F]{64}/g, "[redacted]").slice(0, 240);
}

function assertSameOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  if (!origin) return;
  const expected = `http://${request.headers.host}`;
  if (origin !== expected) throw new Error("Cross-origin transaction requests are not allowed");
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65_536) throw new Error("Request body is too large");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

function validateStep(value: unknown): LiveStepInput {
  if (!value || typeof value !== "object") throw new Error("Missing Live Lab payload");
  const input = value as Partial<LiveStepInput>;
  if (!(input.asset && input.asset in env.assets)) throw new Error("Unsupported trajectory asset");
  if (input.direction !== -1 && input.direction !== 1) throw new Error("Direction must be -1 or 1");
  if (typeof input.trajectoryId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(input.trajectoryId)) {
    throw new Error("Invalid trajectory identifier");
  }
  if (!Number.isInteger(input.tick) || input.tick! < 1 || input.tick! > 1_000_000) {
    throw new Error("Tick must be a positive integer");
  }
  if (input.stepPercent !== 5) throw new Error("Price step must be 5 percent");
  if (!Number.isFinite(input.equity) || input.equity! <= 0 || input.equity! > 1_000_000_000) {
    throw new Error("Invalid vault equity");
  }
  if (!Number.isFinite(input.optimizedImpact) || Math.abs(input.optimizedImpact!) > 100) {
    throw new Error("Invalid optimized impact");
  }
  if (!Number.isFinite(input.staticImpact) || Math.abs(input.staticImpact!) > 100) {
    throw new Error("Invalid static impact");
  }
  if (!Number.isFinite(input.preHealth) || input.preHealth! <= 0 || input.preHealth! > 5) {
    throw new Error("Pre-response HF must be between 0 and 5");
  }
  if (!Number.isFinite(input.targetHealth) || input.targetHealth! < 1.5 || input.targetHealth! > 2.6) {
    throw new Error("Target HF must be between 1.50 and 2.60");
  }
  if (!Array.isArray(input.actions) || input.actions.length > 12) throw new Error("Invalid action basket");
  input.actions.forEach((action) => {
    if (!action || !(action.type in actionTypes)) throw new Error("Unsupported action type");
    if (!(action.asset in env.assets)) throw new Error("Unsupported action asset");
    if (typeof action.units !== "string" || !/^\d+(\.\d+)?$/.test(action.units)) {
      throw new Error("Action units must be a positive decimal string");
    }
    if (Number(action.units) <= 0) throw new Error("Action units must be greater than zero");
  });
  return input as LiveStepInput;
}

async function getHealthFactor(): Promise<bigint> {
  const data = await publicClient.readContract({
    address: env.poolAddress,
    abi: poolAbi,
    functionName: "getUserAccountData",
    args: [env.vaultAddress],
  });
  return data[5];
}

async function getStatus() {
  // Keep calls sequential: the shared Monad testnet endpoint has a strict burst limit.
  let stage = "block number";
  try {
    const blockNumber = await publicClient.getBlockNumber();
    stage = "vault health factor";
    const healthFactor = await getHealthFactor();
    stage = "target health factor";
    const targetHealthFactor = await publicClient.readContract({
      address: env.vaultAddress,
      abi: vaultAbi,
      functionName: "targetHealthFactor",
    });
    return {
      network: "Monad Testnet",
      chainId: 10_143,
      blockNumber: blockNumber.toString(),
      account: account.address,
      vault: env.vaultAddress,
      pool: env.poolAddress,
      healthFactor: Number(formatUnits(healthFactor, 18)),
      targetHealthFactor: Number(formatUnits(targetHealthFactor, 18)),
      harnessMode: true,
    };
  } catch (error) {
    throw new Error(`${stage}: ${cleanError(error)}`);
  }
}

async function sendHarnessTick(preHealth: bigint, targetHealth: bigint): Promise<Hex> {
  const { request } = await publicClient.simulateContract({
    account,
    address: env.poolAddress,
    abi: harnessAbi,
    functionName: "setHealthFactors",
    args: [env.vaultAddress, preHealth, targetHealth],
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error("Oracle tick transaction reverted");
  return hash;
}

async function sendTargetUpdate(targetHealth: bigint): Promise<Hex> {
  const { request } = await publicClient.simulateContract({
    account,
    address: env.vaultAddress,
    abi: vaultAbi,
    functionName: "setTargetHealthFactor",
    args: [targetHealth],
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error("Target HF update reverted");
  return hash;
}

async function sendVaultBatch(actions: LiveActionInput[]): Promise<Hex> {
  const contractActions = actions.map((action) => {
    const asset = env.assets[action.asset];
    return {
      actionType: actionTypes[action.type],
      asset: asset.address as Address,
      amount: parseUnits(action.units, asset.decimals),
    };
  });
  const { request } = await publicClient.simulateContract({
    account,
    address: env.vaultAddress,
    abi: vaultAbi,
    functionName: "execute",
    args: [contractActions],
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error("Vault transaction reverted");
  return hash;
}

async function executeLiveStep(input: LiveStepInput) {
  const currentTargetHealthFactor = await publicClient.readContract({
    address: env.vaultAddress,
    abi: vaultAbi,
    functionName: "targetHealthFactor",
  });
  const harnessOwner = await publicClient.readContract({
    address: env.poolAddress,
    abi: harnessAbi,
    functionName: "owner",
  });
  if (getAddress(harnessOwner) !== getAddress(account.address)) {
    throw new Error("Configured Pool is not the app-owned testnet harness");
  }
  const targetHealthFactor = parseUnits(input.targetHealth.toFixed(2), 18);
  let targetHash: Hex | null = null;
  if (targetHealthFactor !== currentTargetHealthFactor) targetHash = await sendTargetUpdate(targetHealthFactor);

  const preHealthFactor = parseUnits(input.preHealth.toFixed(6), 18);
  const oracleHash = await sendHarnessTick(preHealthFactor, targetHealthFactor);
  const liquidationBoundary = parseUnits("1", 18);
  const liquidated = preHealthFactor <= liquidationBoundary;
  let vaultHash: Hex | null = null;
  if (!liquidated && preHealthFactor < targetHealthFactor) {
    if (input.actions.length === 0) throw new Error("An unhealthy position requires a non-empty action basket");
    vaultHash = await sendVaultBatch(input.actions);
  }
  const finalHealthFactor = await getHealthFactor();
  return {
    oracleTx: { hash: oracleHash, url: transactionUrl(oracleHash) },
    targetTx: targetHash ? { hash: targetHash, url: transactionUrl(targetHash) } : null,
    vaultTx: vaultHash ? { hash: vaultHash, url: transactionUrl(vaultHash) } : null,
    rebalanced: vaultHash !== null,
    liquidated,
    finalHealth: Number(formatUnits(finalHealthFactor, 18)),
  };
}

async function handleApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<void> {
  if (request.method === "GET" && (pathname === "/api/status" || pathname === "/api/health")) {
    sendJson(response, 200, await getStatus());
    return;
  }
  if (request.method === "POST" && pathname === "/api/live-step") {
    assertSameOrigin(request);
    if (transactionInFlight) {
      sendJson(response, 409, { error: "A Live Lab transaction is already awaiting confirmation" });
      return;
    }
    transactionInFlight = true;
    try {
      const input = validateStep(await readJson(request));
      const result = await executeLiveStep(input);
      const notification = await telegramNotifier.notify({
        trajectoryId: input.trajectoryId,
        tick: input.tick,
        asset: input.asset,
        direction: input.direction,
        stepPercent: input.stepPercent,
        equity: input.equity,
        optimizedImpact: input.optimizedImpact,
        staticImpact: input.staticImpact,
        finalHealth: result.finalHealth,
        actionCount: input.actions.length,
        liquidated: result.liquidated,
      });
      sendJson(response, 200, { ...result, notification });
    } finally {
      transactionInFlight = false;
    }
    return;
  }
  sendJson(response, 404, { error: "API route not found" });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
      return;
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/docs/reference/slicer-v4.html")) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
      });
      response.end(await readFile(pagePath));
      return;
    }
    sendJson(response, 404, { error: "Route not found" });
  } catch (error) {
    console.error("Request failed:", cleanError(error));
    if (!response.headersSent) sendJson(response, 400, { error: cleanError(error) });
    else response.end();
  }
});

server.listen(env.port, env.host, async () => {
  console.log(`Slicer web app: http://${env.host}:${env.port}`);
  console.log(`Monad chain 10143 · wallet ${account.address}`);
  console.log(`Managed vault ${env.vaultAddress}`);
  console.log(`Telegram savings alerts ${telegramNotifier.configured ? "enabled" : "disabled"}`);
});
