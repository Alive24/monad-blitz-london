import { readFile } from "node:fs/promises";
import { formatUnits, getAddress, type Address } from "viem";
import { aavePoolAbi, managedVaultAbi } from "./abi.js";
import { account, publicClient, walletClient } from "./client.js";
import { requireEnv } from "./env.js";

type ActionInput = {
  actionType: 0 | 1 | 2 | 3;
  asset: Address;
  amount: string;
};

const vault = getAddress(requireEnv("MANAGED_VAULT_ADDRESS"));
const actionPath = process.argv[2] ?? "automation/actions.example.json";
const input = JSON.parse(await readFile(actionPath, "utf8")) as ActionInput[];
if (!Array.isArray(input) || input.length === 0) throw new Error("The action basket must not be empty.");

const [pool, targetHealthFactor] = await Promise.all([
  publicClient.readContract({ address: vault, abi: managedVaultAbi, functionName: "pool" }),
  publicClient.readContract({ address: vault, abi: managedVaultAbi, functionName: "targetHealthFactor" }),
]);
const accountData = await publicClient.readContract({
  address: pool,
  abi: aavePoolAbi,
  functionName: "getUserAccountData",
  args: [vault],
});
const currentHealthFactor = accountData[5];

if (currentHealthFactor >= targetHealthFactor) {
  console.log(
    `No action: HF ${formatUnits(currentHealthFactor, 18)} is at or above target ${formatUnits(targetHealthFactor, 18)}.`,
  );
  process.exit(0);
}

const actions = input.map((action) => ({
  actionType: action.actionType,
  asset: getAddress(action.asset),
  amount: BigInt(action.amount),
}));

const { request } = await publicClient.simulateContract({
  account,
  address: vault,
  abi: managedVaultAbi,
  functionName: "execute",
  args: [actions],
});
const hash = await walletClient.writeContract(request);
const receipt = await publicClient.waitForTransactionReceipt({ hash });

console.log(`Rebalance confirmed in block ${receipt.blockNumber}.`);
console.log(`https://testnet.monadscan.com/tx/${hash}`);
