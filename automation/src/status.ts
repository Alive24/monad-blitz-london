import { formatUnits, getAddress } from "viem";
import { aavePoolAbi, managedVaultAbi } from "./abi.js";
import { publicClient } from "./client.js";
import { requireEnv } from "./env.js";

const vault = getAddress(requireEnv("MANAGED_VAULT_ADDRESS"));
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
console.table({
  vault,
  pool,
  collateralBase: accountData[0].toString(),
  debtBase: accountData[1].toString(),
  protocolLtvBps: accountData[4].toString(),
  currentHealthFactor: formatUnits(accountData[5], 18),
  targetHealthFactor: formatUnits(targetHealthFactor, 18),
});
