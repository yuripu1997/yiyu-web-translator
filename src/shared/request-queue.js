function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 腾讯云机器翻译默认有 QPS 限制（约 5 次/秒）。
 * 这里用串行队列 + 最小间隔控制请求节奏，避免瞬时并发触发限流。
 */
export class RequestQueue {
  constructor({ minIntervalMs = 220 } = {}) {
    this.minIntervalMs = minIntervalMs;
    this.lastStartedAt = 0;
    this.tail = Promise.resolve();
  }

  schedule(task) {
    const run = async () => {
      const wait = Math.max(0, this.lastStartedAt + this.minIntervalMs - Date.now());
      if (wait > 0) await sleep(wait);
      this.lastStartedAt = Date.now();
      return task();
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => {});
    return result;
  }
}

export { sleep };
