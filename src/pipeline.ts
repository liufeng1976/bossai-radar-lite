import { enrichOpportunity } from "./ai.js";
import { collectAll } from "./collectors.js";
import { RadarDatabase } from "./database.js";
import { createEnglishReport, createReport } from "./report.js";
import { buildOpportunities, scoreEvidence } from "./scoring.js";
import type { Opportunity, Report, ScanRunSummary, ScanTrigger, ScoredEvidence, SourceOutcome } from "./types.js";

export interface ScanResult {
  run: ScanRunSummary;
  report: Report | null;
  opportunities: Opportunity[];
  sources: SourceOutcome[];
}

export class RadarEngine {
  private currentScan: Promise<ScanResult> | null = null;
  private latestSources: SourceOutcome[] = [];

  constructor(private readonly db: RadarDatabase) {}

  isRunning(): boolean {
    return this.currentScan !== null;
  }

  sourceStatus(): SourceOutcome[] {
    return this.latestSources;
  }

  setSourceStatus(outcomes: SourceOutcome[]): void {
    this.latestSources = outcomes;
  }

  scan(trigger: ScanTrigger): Promise<ScanResult> {
    if (this.currentScan) return this.currentScan;
    this.currentScan = this.runScan(trigger).finally(() => {
      this.currentScan = null;
    });
    return this.currentScan;
  }

  private async runScan(trigger: ScanTrigger): Promise<ScanResult> {
    const run = this.db.startRun(trigger);
    let sourceOutcomes: SourceOutcome[] = [];
    let collectedCount = 0;
    let evidenceCount = 0;
    let opportunities: Opportunity[] = [];
    const scoredItems: ScoredEvidence[] = [];
    const errors: string[] = [];

    try {
      sourceOutcomes = await collectAll();
      this.latestSources = sourceOutcomes;
      collectedCount = sourceOutcomes.reduce((sum, outcome) => sum + outcome.items.length, 0);
      for (const outcome of sourceOutcomes) {
        if (outcome.error) errors.push(`${outcome.source}: ${outcome.error}`);
      }

      const seen = new Set<string>();
      for (const raw of sourceOutcomes.flatMap((outcome) => outcome.items)) {
        const scored = scoreEvidence(raw);
        scoredItems.push(scored);
        if (scored.totalScore < 12 || seen.has(scored.fingerprint)) continue;
        seen.add(scored.fingerprint);
        this.db.saveEvidence(scored);
        evidenceCount += 1;
      }

      const rollingEvidence = this.db.listEvidence(500, undefined, false);
      const baseOpportunities = buildOpportunities(rollingEvidence);
      opportunities = await Promise.all(
        baseOpportunities.slice(0, 12).map((opportunity) => enrichOpportunity(opportunity, rollingEvidence)),
      );
      this.db.replaceOpportunities(opportunities);

      const reportContent = createReport(run.id, opportunities, sourceOutcomes, collectedCount, evidenceCount, scoredItems);
      const englishReportContent = createEnglishReport({
        ...run,
        collectedCount,
        evidenceCount,
        opportunityCount: opportunities.length,
      }, opportunities, scoredItems);
      const report = this.db.saveReport(
        run.id,
        reportContent.executiveSummary,
        reportContent.markdown,
        reportContent.brief,
        englishReportContent.markdown,
        englishReportContent.brief,
      );
      const status = scanStatusForOutcomes(sourceOutcomes, collectedCount);
      const finishedRun = this.db.finishRun(
        run.id,
        status,
        { collectedCount, evidenceCount, opportunityCount: opportunities.length },
        errors,
      );
      return { run: finishedRun, report, opportunities, sources: sourceOutcomes };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      const finishedRun = this.db.finishRun(
        run.id,
        "failed",
        { collectedCount, evidenceCount, opportunityCount: opportunities.length },
        errors,
      );
      return { run: finishedRun, report: null, opportunities, sources: sourceOutcomes };
    }
  }
}

export function scanStatusForOutcomes(
  sourceOutcomes: SourceOutcome[],
  collectedCount: number,
): Exclude<ScanRunSummary["status"], "running"> {
  const attemptedSources = sourceOutcomes.filter((outcome) => outcome.status !== "skipped");
  const successfulSources = attemptedSources.filter((outcome) => outcome.status === "success").length;
  if (attemptedSources.length > 0 && successfulSources === attemptedSources.length) return "success";
  if (successfulSources > 0 || collectedCount > 0) return "partial";
  return "failed";
}
