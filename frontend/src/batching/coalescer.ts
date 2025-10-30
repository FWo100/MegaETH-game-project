let pending = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export interface CoalescerOptions {
  windowMs: number;     // default 200
  maxTimes: number;     // should match router cap, default 64
  submitBatch: (times: number) => Promise<void>;
}

export function makeCoalescer(opts: CoalescerOptions) {
  const windowMs = opts.windowMs ?? 200;
  const maxTimes = opts.maxTimes ?? 64;

  async function flush() {
    timer = null;
    const times = Math.min(pending, maxTimes);
    pending -= times;
    if (times > 0) await opts.submitBatch(times);
    if (pending > 0) timer = setTimeout(flush, 0);
  }

  return {
    recordClick() {
      pending += 1;
      if (!timer) timer = setTimeout(flush, windowMs);
    },
    getPending() { return pending; }
  };
}
