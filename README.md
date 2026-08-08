# Slicer — managed Aave optimizer on Monad

Slicer is a single-process web app for an HF-triggered managed vault. The optimizer selects top-N supply and borrow baskets using yield, market depth, collateral safety, and concentration caps. The Live Lab turns each 5% price tick into an actual Monad testnet transaction and sends one atomic asset-level vault transaction whenever HF falls below target.

There is no separate executor and there are no simulated hashes. `npm run dev` serves [`docs/reference/slicer-v4.html`](docs/reference/slicer-v4.html) and its same-origin Viem transaction API. The automated wallet key stays in the server-side, gitignored `.env.local`; it is never sent to the browser.

## Run it

```bash
npm install
cp .env.example .env.local   # only for a fresh checkout
npm run dev
```

Open <http://127.0.0.1:4174>, choose **Live Lab**, and press either price button. The app simulates each call with Viem, broadcasts it, waits for confirmation, and renders the real Monadscan receipt. The included configured wallet address is:

`0x9f7136fc32A3c8404102dbC6207a2A899a2fB32e`

## Telegram savings alerts

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env.local` to enable alerts. After each tenth confirmed trajectory tick, Slicer reports the cumulative result for that ten-tick window: static Aave performance, optimized performance, dollars and percentage of vault value protected, compounded asset moves, rebalances, action count, and final HF. It sends only when that window produced positive savings. Missing credentials or a Telegram delivery failure never blocks the Monad transaction.

## Contracts and testnet deployment

- `src/ManagedAaveVault.sol` — executor-gated atomic `SUPPLY`, `WITHDRAW`, `BORROW`, and `REPAY` basket with the asymmetric HF gate.
- `src/demo/TestnetAavePoolHarness.sol` — testnet-only Aave-compatible surface that moves real demo ERC-20 balances.
- `src/demo/TestnetToken.sol` — mintable assets used only by the harness deployment.
- `app/server.ts` — static web server and same-origin Viem routes in one process.

Current Monad testnet deployment:

- Managed vault, Monadscan exact match: [`0x485C…5e9F`](https://testnet.monadscan.com/address/0x485C3C1a28ad9848939265df2Fba5Bdef7e15e9F#code)
- Pool harness, Monadscan exact match: [`0x25e0…d97d`](https://testnet.monadscan.com/address/0x25e0Fbd049e680D72C42128eFc85d9F7edD5d97d#code)
- All five demo assets are also exact-match verified; their explorer-ready addresses are recorded in `deployments/monad-testnet.demo.json`.
- Confirmed six-action vault batch with indexed ERC-20 transfers: [`0xea25…73f7`](https://testnet.monadscan.com/tx/0xea25186be4bf53b1c0c5dd832ad192c048ec6cfdffd28263a938d09a764f73f7)
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
