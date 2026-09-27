const { randomUUID } = require("node:crypto");

class Task {
  constructor(onChange, now = () => performance.now()) {
    this.onChange = onChange;
    this.now = now;
    this.value = null;
  }

  get active() {
    return this.value?.status === "running";
  }

  snapshot() {
    if (!this.value) return null;
    return { ...this.value, elapsedMs: this.active ? Math.max(0, this.now() - this.started) : this.value.elapsedMs };
  }

  start() {
    if (this.active) throw new Error("当前任务尚未结束。");
    this.started = this.now();
    this.error = null;
    this.cancelled = false;
    this.value = { id: randomUUID(), status: "running", startedAt: Date.now(), elapsedMs: 0 };
    this.onChange(this.snapshot());
  }

  handle(event) {
    if (!this.active) return;
    if (event.type === "message_end" && event.message?.role === "user" && !this.value.promptTimestamp) this.value.promptTimestamp = event.message.timestamp;
    if (event.type === "message_end" && event.message?.role === "assistant") {
      this.error = event.message.stopReason === "error" ? event.message.errorMessage || "服务商请求失败。" : null;
      if (event.message.stopReason === "aborted") this.cancelled = true;
    }
    if (event.type === "auto_retry_end" && !event.success && event.finalError) this.error = event.finalError;
    if (event.type === "auto_compaction_end" && event.errorMessage) this.error = event.errorMessage;
    if (event.type === "agent_settled") this.finish(this.cancelled ? "stopped" : this.error ? "failed" : "completed");
  }

  finish(status, error = this.error) {
    if (!this.active) return;
    this.value = { ...this.snapshot(), status, finishedAt: Date.now(), error: status === "failed" ? error : undefined };
    this.onChange(this.snapshot());
  }

  clear() {
    if (this.active) throw new Error("当前任务尚未结束。");
    this.value = null;
    this.onChange(null);
  }

  restore(value) {
    if (this.active) throw new Error("当前任务尚未结束。");
    this.value = value && value.status !== "running" ? { ...value } : null;
    this.onChange(this.snapshot());
  }
}

module.exports = { Task };
