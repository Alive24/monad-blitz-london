# Slicer — managed Aave optimizer on Monad

Slicer is a single-process web app for an HF-triggered managed vault. The optimizer selects top-N supply and borrow baskets using yield, market depth, collateral safety, and concentration caps. The Live Lab turns each price tick into an actual Monad testnet transaction and sends one atomic asset-level vault transaction whenever HF falls below target.

There is no separate executor and there are no simulated hashes. `npm run dev` serves [`docs/reference/slicer-v4.html`](docs/reference/slicer-v4.html) and its same-origin Viem transaction API. The automated wallet key stays in the server-side, gitignored `.env.local`; it is never sent to the browser.

## Run it

```bash
npm install
cp .env.example .env.local   # only for a fresh checkout
npm run dev
```

Open <http://127.0.0.1:4174>, choose **Live Lab**, and press either price button. The app simulates each call with Viem, broadcasts it, waits for confirmation, and renders the real Monadscan receipt. The included configured wallet address is:

`0x9f7136fc32A3c8404102dbC6207a2A899a2fB32e`

## Contracts and testnet deployment

- `src/ManagedAaveVault.sol` — executor-gated atomic `SUPPLY`, `WITHDRAW`, `BORROW`, and `REPAY` basket with the asymmetric HF gate.
- `src/demo/TestnetAavePoolHarness.sol` — testnet-only Aave-compatible surface that moves real demo ERC-20 balances.
- `src/demo/TestnetToken.sol` — mintable assets used only by the harness deployment.
- `app/server.ts` — static web server and same-origin Viem routes in one process.

Current Monad testnet deployment:

- Managed vault: [`0xe05f…8c81`](https://testnet.monadscan.com/address/0xe05f5CfD7BF44d6Fa87b966462e2f34781828c81)
- Pool harness: [`0xC0DC…04B9`](https://testnet.monadscan.com/address/0xC0DC570Df95EE407Af4f4Acbe3a6d78cEdF204B9)
- Confirmed six-action vault batch: [`0x142f…517e`](https://testnet.monadscan.com/tx/0x142f48ade364814b068744aa9b7bd7c0fe9d8030fa655cda2be3cecb6323517e)
- Machine-readable addresses and receipts: `deployments/monad-testnet.demo.json`

Deploy a fresh testnet system with:

```bash
npm run deploy:testnet-demo
```

Run all checks with:

```bash
npm run typecheck
forge fmt --check
forge test -vvv
```

## Boundary

The transaction path, ERC-20 movements, HF gate, receipts, and explorer links are real on Monad testnet. The deployed Pool is explicitly a test harness, not the live Aave market, and its HF is controlled by the app to demonstrate oracle trajectories. Replacing `AAVE_POOL_ADDRESS` and the asset addresses with the Monad Aave deployment moves the same vault call path to the target protocol.

This hackathon vault is not audited. It intentionally omits production share accounting, swaps, oracle freshness checks, slippage controls, governance, keeper redundancy, and signer hardening.
