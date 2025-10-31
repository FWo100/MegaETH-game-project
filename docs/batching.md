# Fluffle Click Batching

This feature enables on-chain batching of click bursts to absorb rate limits without changing user experience. Clicks are coalesced client-side and sent in batches at a fixed pace (usually 2 tx/s) with backoff on 429s.

## How It Works

- **Client coalescer**: Records clicks immediately, buffers for 500ms, then submits a batch.
- **Server sender**: Queues batches, sends at 2 tx/s, respects provider rate limits with exponential backoff.
- **Router contract**: Performs `times` actions in a loop, enforces payment `msg.value == unitPrice * times`.

## Configuration

Env vars in `.env` and `frontend/.env`:

```
# Enable batching
BATCH_ENABLED=true

# Router contract address (deployed via script/Deploy.s.sol)
ROUTER_ADDRESS=0x...

# Batch window in ms (click coalesce time)
BATCH_WINDOW_MS=500

# Max batch size (matches router MAX_TIMES=64)
BATCH_MAX_TIMES=64

# Rate-limit batches per second
BATCH_RATE_PER_SEC=2
```

## Feature Flag

Set `BATCH_ENABLED=false` to disable batching entirely, falling back to single-click txs.

## Deployment

1. Deploy contracts: `TARGET_ADDRESS=<game_addr> forge script script/Deploy.s.sol --rpc-url <url> --broadcast`
2. The deployment automatically authorizes the router contract with the game contract.
3. Set `ROUTER_ADDRESS` in env to the deployed router.
4. For existing deployments, the game owner must call `game.authorizeContract(routerAddress)` to authorize batch operations.
5. Restart app.

## Operational Notes

- Each click costs the same unit price; no changes to economics.
- 429s cause sender to back off 1s initially, doubling up to 10s.
- Nonce management ensures monotonicity across batches.
- Sweep tx is not batched (as it's not bursty).
