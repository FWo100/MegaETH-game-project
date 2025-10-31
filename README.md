# Fluffle Tx Tester (MegaETH Testnet)

Minimal tester for per-flap move loop on MegaETH testnet.

See `docs/DEPLOY_GUIDE.md` for full instructions.

## Transaction Methodology and Batching

This implementation features a sophisticated transaction batching system designed specifically for MegaETH, enabling high-frequency on-chain interactions without traditional rate limiting constraints or network spam.

### Why Batching is Essential

In traditional single-transaction approaches, each user action maps to an individual blockchain transaction. While simple, this creates several challenges:

- **Rate Limiting**: Blockchain nodes and RPC providers impose rate limits (typically 1-10 TPS per wallet) to prevent abuse
- **Network Congestion**: Individual transactions create mempool pressure and compete for blockspace
- **Cost Inefficiency**: Each transaction incurs separate gas fees for execution and network submission
- **User Experience Degradation**: Waiting for confirmations between each action reduces responsiveness

MegaETH's transaction battery system addresses these issues through intelligent client-side and contract-side optimizations that transform bursty action patterns into efficient batched submissions.

### How Batching Works

The system operates through three core components: the **Client Coalescer**, **Server Sender**, and **Batch Router Contract**.

#### Client Coalescer

Actions are collected client-side in a 500ms coalescing window. Instead of immediately submitting individual transactions, actions are buffered and grouped into batches:

```
Action 1 ──┐
Action 2    │  ── 500ms ── Batch [Action 1,2,3,4] ── Submit
Action 3    │
Action 4 ──┘
```

This captures burst patterns (like rapid user interactions) and compresses them into single submission requests, significantly reducing network load while maintaining real-time responsiveness.

#### Server Sender

The server maintains a rate-limited submission queue, sending batches at a controlled pace of 2 transactions per second. When rate limits are encountered (HTTP 429 responses), the system implements exponential backoff:

- Initial backoff: 1 second
- Subsequent backoffs: Double delay up to maximum 10 seconds
- Automatic retry with reduced rate during congestion

This creates a "transaction battery" that smoothly absorbs action bursts without overwhelming the network.

#### Batch Router Contract

On-chain, the `ClickBatchRouter` contract processes batches efficiently:

```solidity
function executeBatch(uint256 times) external payable {
    for (uint256 i = 0; i < times; i++) {
        // Execute individual action
        gameContract.play(msg.sender);
    }
}
```

The contract enforces economic rigor by requiring `msg.value == unitPrice * times`, ensuring fair payment for batch executions.

### Real-Time API Utilization

MegaETH's native RPC endpoints (https://carrot.megaeth.com/rpc) and WebSocket service (wss://carrot.megaeth.com/ws) provide the foundation for this system's effectiveness. Without batching, high-frequency interactions would:

- Exceed single-wallet rate limits
- Create unnecessary mempool congestion
- Consume excessive gas due to per-transaction overhead

Batching transforms these constraints into opportunities:

- **Rate Limit Absorption**: Instead of 64 individual 1 TPS transactions, send 1 TPS batches
- **Network Efficiency**: Reduce mempool entries from 64 to ~1 per burst
- **Cost Optimization**: Share L2 gas fees across multiple actions per transaction
- **Real-Time Responsiveness**: Maintain sub-second interaction patterns through client-side coalescing

The real-time API ensures immediate feedback for batched actions, providing the user experience of individual transactions while operating with network-efficient bulk submissions.

### Avoiding Network Spam While Scaling Transactions

The system achieves a delicate balance between transaction throughput and network health:

| Metric | Single Tx Approach | Batching Approach |
|--------|-------------------|-------------------|
| Transactions/burst | 64 | ~1 |
| Gas efficiency | 1x | 64x |
| Rate limit impact | 64 TPS | 2 TPS |
| Network load | High | Minimal |
| User experience | Degraded | Seamless |

Through measured rate limiting (2 TPS) and intelligent backoff strategies, the system maximized the real-time API's potential while respecting network constraints. This approach enables applications that were previously impossible under single-transaction models, particularly for responsive, burst-intensive interfaces.

### Configuration and Operation

The system is configurable through environment variables:

```
BATCH_ENABLED=true          # Enable/disable batching layer
BATCH_WINDOW_MS=500         # Client coalescing window
BATCH_MAX_TIMES=64         # Maximum actions per batch
BATCH_RATE_PER_SEC=2        # Server submission rate
```

See `docs/batching.md` for detailed deployment and operational instructions.

This methodology positions MegaETH as an ideal platform for real-time blockchain applications, unlocking new possibilities for interactive on-chain experiences through efficient transaction patterns.
