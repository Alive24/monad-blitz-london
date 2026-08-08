# Slicer — managed Aave optimizer on Monad

Slicer is an HF-triggered managed vault prototype for Aave V3 on Monad. It selects top-N supply and borrow baskets, sizes them by market depth and collateral safety, and only rebalances after the live health factor falls below the configured target. Healthier positions are monitored without generating transactions.

The interactive prototype is at [`docs/reference/slicer-v4.html`](docs/reference/slicer-v4.html).

## Repository layout

- `src/ManagedAaveVault.sol` — atomic asset-level Aave V3 executor with an on-chain HF gate.
- `test/ManagedAaveVault.t.sol` — dependency-free Foundry tests and Aave/token mocks.
- `script/DeployManagedAaveVault.s.sol` — Monad testnet deployment script.
- `automation/src/rebalance.ts` — Viem simulation + automatic broadcast path.
- `automation/actions.example.json` — ordered `SUPPLY`, `WITHDRAW`, `BORROW`, `REPAY` input format.

Action type values are `0 = SUPPLY`, `1 = WITHDRAW`, `2 = BORROW`, and `3 = REPAY`. Amounts are token base units.

## Local setup

```bash
npm install
forge build
forge test -vvv
npm run typecheck
```

The generated executor wallet is stored only in the gitignored `.env.local`. Fund its public address with Monad testnet MON before deployment.

Set `AAVE_POOL_ADDRESS` to the Aave-compatible Pool used for the target environment, then deploy:

```bash
npm run deploy:testnet
```

After adding the deployed address to `MANAGED_VAULT_ADDRESS`:

```bash
npm run vault:status
npm run vault:rebalance -- automation/actions.example.json
```

`vault:rebalance` reads the Pool state first. It exits without a simulation or transaction whenever current HF is at or above target. When HF is below target, Viem simulates the full ordered basket, broadcasts it from the managed executor, waits for confirmation, and prints the Monad testnet explorer link.

## Scope and safety

This is a hackathon prototype, not an audited production vault. It intentionally omits share accounting, multi-sig governance, oracle freshness checks, slippage guards, swaps, keeper redundancy, and upgradeability. The executor key is automated as requested; do not fund it with mainnet assets. A production deployment should replace it with a policy-limited signer or smart account and undergo an independent audit.
