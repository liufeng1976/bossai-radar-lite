import { config } from "./config.js";
import type { RadarEngine } from "./pipeline.js";

export class RadarScheduler {
  private timer: NodeJS.Timeout | null = null;
  private nextRunAt: Date | null = null;

  constructor(private readonly engine: RadarEngine) {}

  start(): void {
    if (!config.radar.autoScan || this.timer) return;
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = null;
  }

  status() {
    return {
      enabled: config.radar.autoScan,
      nextRunAt: this.nextRunAt?.toISOString() ?? null,
      dailyHour: config.radar.dailyHour,
      dailyMinute: config.radar.dailyMinute,
      timeZone: config.radar.timeZone,
    };
  }

  private scheduleNext(): void {
    this.nextRunAt = calculateNextDailyRun(new Date(), config.radar.dailyHour, config.radar.dailyMinute);
    const delay = Math.max(1_000, this.nextRunAt.getTime() - Date.now());
    this.timer = setTimeout(async () => {
      this.timer = null;
      this.nextRunAt = null;
      try {
        await this.engine.scan("scheduled");
      } catch (error) {
        console.error("[Scheduler] Scheduled scan failed:", error);
      } finally {
        this.scheduleNext();
      }
    }, delay);
    this.timer.unref();
    console.log(`[Scheduler] Next scan: ${this.nextRunAt.toISOString()} (TZ=${config.radar.timeZone})`);
  }
}

export function calculateNextDailyRun(reference: Date, hour: number, minute: number): Date {
  const normalizedHour = Math.max(0, Math.min(23, Math.trunc(hour)));
  const normalizedMinute = Math.max(0, Math.min(59, Math.trunc(minute)));
  const next = new Date(reference);
  next.setHours(normalizedHour, normalizedMinute, 0, 0);
  if (next.getTime() <= reference.getTime()) next.setDate(next.getDate() + 1);
  return next;
}
