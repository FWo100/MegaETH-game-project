# Deploy Guide — Fluffle Tx Tester

## A) Install

- Node 18+, pnpm or npm, Git
- Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup`

## B) Configure

Create `.env` and `frontend/.env` using `.env.example`. Set `PRIVATE_KEY` for your deployer.
Default network:
```
RPC_URL=https://carrot.megaeth.com/rpc
CHAIN_ID=6342
EXPLORER_BASE=https://www.megaexplorer.xyz
```
Frontend:
```
VITE_CHAIN_ID=6342
VITE_RPC_URL=https://carrot.megaeth.com/rpc
VITE_WS_URL=wss://carrot.megaeth.com/ws
VITE_EXPLORER_BASE=https://www.megaexplorer.xyz
VITE_FEE_MULTIPLIER_BPS=10000
VITE_FEE_TOLERANCE_BPS=1000
VITE_DEADLINE_MS_DEFAULT=500
VITE_DEADLINE_MS_MAX=750
VITE_REMEMBER_HOURS=24
```

## C) Deploy contracts (MegaETH testnet)

```
forge build
forge script script/Deploy.s.sol   --rpc-url $RPC_URL --broadcast   --private-key $PRIVATE_KEY --chain-id $CHAIN_ID
```

The script prints **FluffleTestGame**, **SessionManager**, and **ClickBatchRouter** addresses.
Paste them into `frontend/.env` as:
```
VITE_GAME_ADDRESS=0x...
VITE_SESSION_MANAGER_ADDRESS=0x...
VITE_ROUTER_ADDRESS=0x...
```

## D) Run the frontend

```
cd frontend
pnpm install
pnpm dev
```

Open the URL printed by Vite.

## E) Use the tester

1. **Connect & Top Up**: enter ETH amount → click. Confirm the single wallet tx.
2. **Flap** to send per‑flap txs (watch latency + tx hash).
3. **Withdraw Leftovers** any time.

## F) Troubleshooting

- WS fail: ensure `VITE_WS_URL=wss://carrot.megaeth.com/ws`.
- If flaps time out: check network; RBF should rescue most spikes.
- If sweep leaves dust: fees shifted; retry later.
