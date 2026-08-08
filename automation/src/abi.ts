export const managedVaultAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [{
      name: "actions",
      type: "tuple[]",
      components: [
        { name: "actionType", type: "uint8" },
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    }],
    outputs: [],
  },
  {
    type: "function",
    name: "pool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "targetHealthFactor",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const aavePoolAbi = [{
  type: "function",
  name: "getUserAccountData",
  stateMutability: "view",
  inputs: [{ name: "user", type: "address" }],
  outputs: [
    { name: "totalCollateralBase", type: "uint256" },
    { name: "totalDebtBase", type: "uint256" },
    { name: "availableBorrowsBase", type: "uint256" },
    { name: "currentLiquidationThreshold", type: "uint256" },
    { name: "ltv", type: "uint256" },
    { name: "healthFactor", type: "uint256" },
  ],
}] as const;
