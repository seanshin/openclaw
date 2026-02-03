import { Command } from "commander";
import { loadConfig } from "../config/config.js";
import {
  loadTokenUsageSummary,
  generateTokenMonitorSummary,
  resetTokenMonitor,
  readTokenUsageEvents,
  type TokenMonitorSummary,
  type TokenUsageAggregation,
} from "../infra/token-monitor.js";
import { formatCost } from "../utils/usage-format.js";

/**
 * 숫자를 천 단위 구분 기호와 함께 포맷
 */
function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

/**
 * 백분율 포맷
 */
function formatPercentage(value: number, total: number): string {
  if (total === 0) return "0.0%";
  const pct = (value / total) * 100;
  return `${pct.toFixed(1)}%`;
}

/**
 * 집계 데이터를 테이블 행으로 포맷
 */
function formatAggregationRow(agg: TokenUsageAggregation): string {
  const parts = [];
  
  parts.push(`Input: ${formatNumber(agg.input)}`);
  parts.push(`Output: ${formatNumber(agg.output)}`);
  
  if (agg.cacheRead > 0) {
    parts.push(`Cache Read: ${formatNumber(agg.cacheRead)}`);
  }
  if (agg.cacheWrite > 0) {
    parts.push(`Cache Write: ${formatNumber(agg.cacheWrite)}`);
  }
  
  parts.push(`Total: ${formatNumber(agg.total)}`);
  parts.push(`Cost: ${formatCost(agg.cost)}`);
  parts.push(`Requests: ${formatNumber(agg.requestCount)}`);
  
  return parts.join(" | ");
}

/**
 * 요약 정보 출력
 */
function printSummary(summary: TokenMonitorSummary): void {
  const startDate = new Date(summary.period.start).toLocaleString();
  const endDate = new Date(summary.period.end).toLocaleString();

  console.log("\n=== Token Usage Summary ===\n");
  console.log(`Period: ${startDate} - ${endDate}`);
  console.log(`Updated: ${new Date(summary.updatedAt).toLocaleString()}\n`);

  // 전체 통계
  console.log("📊 Total Usage:");
  console.log(`   ${formatAggregationRow(summary.total)}\n`);

  // 프로바이더별 통계
  if (summary.byProvider.size > 0) {
    console.log("🔧 Usage by Provider:");
    
    const providers = Array.from(summary.byProvider.entries()).sort(
      ([, a], [, b]) => b.total - a.total
    );

    for (const [provider, stats] of providers) {
      console.log(`\n   ${provider}:`);
      console.log(`   ${formatAggregationRow(stats)}`);
      console.log(`   (${formatPercentage(stats.total, summary.total.total)} of total)`);

      // 상위 모델
      const topModels = Array.from(stats.models.entries())
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 3);

      if (topModels.length > 0) {
        console.log(`   Top models:`);
        for (const [model, modelStats] of topModels) {
          console.log(`     - ${model}: ${formatNumber(modelStats.total)} tokens (${formatCost(modelStats.cost)})`);
        }
      }
    }
    console.log();
  }

  // 상위 모델 (전체)
  if (summary.topModels.length > 0) {
    console.log("🏆 Top Models (Overall):");
    for (let i = 0; i < summary.topModels.length; i++) {
      const { provider, model, usage } = summary.topModels[i];
      console.log(
        `   ${i + 1}. ${provider}/${model}: ${formatNumber(usage.total)} tokens (${formatCost(usage.cost)})`
      );
    }
    console.log();
  }

  // 일별 통계 (최근 7일)
  if (summary.byDay.size > 0) {
    console.log("📅 Daily Usage (Last 7 Days):");
    
    const days = Array.from(summary.byDay.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 7);

    for (const [day, stats] of days) {
      console.log(`   ${day}:`);
      console.log(`     Tokens: ${formatNumber(stats.total)} | Cost: ${formatCost(stats.cost)} | Requests: ${formatNumber(stats.requestCount)}`);
    }
    console.log();
  }
}

/**
 * 시간별 통계 출력
 */
function printHourlyStats(summary: TokenMonitorSummary, limit: number = 24): void {
  console.log("\n=== Hourly Usage ===\n");

  const hours = Array.from(summary.byHour.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, limit);

  if (hours.length === 0) {
    console.log("No hourly data available.\n");
    return;
  }

  for (const [hour, stats] of hours) {
    console.log(`${hour}:`);
    console.log(`  ${formatAggregationRow(stats)}`);
  }
  console.log();
}

/**
 * 프로바이더별 상세 통계 출력
 */
function printProviderDetails(summary: TokenMonitorSummary, provider: string): void {
  const stats = summary.byProvider.get(provider);

  if (!stats) {
    console.log(`\nNo data found for provider: ${provider}\n`);
    return;
  }

  console.log(`\n=== ${provider} Detailed Usage ===\n`);
  console.log("Overall:");
  console.log(`  ${formatAggregationRow(stats)}\n`);

  console.log("Models:");
  const models = Array.from(stats.models.entries()).sort(([, a], [, b]) => b.total - a.total);

  for (const [model, modelStats] of models) {
    console.log(`\n  ${model}:`);
    console.log(`    ${formatAggregationRow(modelStats)}`);
    console.log(`    (${formatPercentage(modelStats.total, stats.total)} of provider total)`);
  }
  console.log();
}

/**
 * 원시 이벤트 데이터 출력
 */
async function printRawEvents(params: {
  since?: number;
  until?: number;
  provider?: string;
  model?: string;
  limit?: number;
}): Promise<void> {
  console.log("\n=== Raw Token Usage Events ===\n");

  let count = 0;
  const events = [];

  for await (const event of readTokenUsageEvents(params)) {
    events.push(event);
  }

  // 최근 이벤트부터 출력
  events.sort((a, b) => b.timestamp - a.timestamp);

  const limit = params.limit ?? 20;
  for (const event of events.slice(0, limit)) {
    count++;
    const timestamp = new Date(event.timestamp).toLocaleString();
    const cost = event.cost ? formatCost(event.cost) : "N/A";

    console.log(`[${count}] ${timestamp}`);
    console.log(`    Provider: ${event.provider} | Model: ${event.model}`);
    console.log(
      `    Tokens: In=${formatNumber(event.usage.input ?? 0)} Out=${formatNumber(event.usage.output ?? 0)} Total=${formatNumber(event.usage.total ?? 0)}`
    );
    console.log(`    Cost: ${cost}`);
    if (event.sessionId) {
      console.log(`    Session: ${event.sessionId}`);
    }
    console.log();
  }

  if (events.length > limit) {
    console.log(`... and ${events.length - limit} more events.\n`);
  } else if (count === 0) {
    console.log("No events found.\n");
  }
}

/**
 * token-monitor 커맨드 정의
 */
export function createTokenMonitorCommand(): Command {
  const cmd = new Command("token-monitor");
  cmd.description("Monitor and analyze AI model token usage");

  // 요약 조회 (기본)
  cmd
    .command("summary", { isDefault: true })
    .description("Show token usage summary")
    .option("-d, --days <number>", "Number of days to include", "30")
    .option("-r, --refresh", "Force refresh summary from raw data")
    .option("--hourly", "Show hourly breakdown")
    .option("-p, --provider <provider>", "Filter by provider")
    .action(async (options) => {
      try {
        const days = parseInt(options.days, 10);
        const since = Date.now() - days * 24 * 60 * 60 * 1000;

        const summary = options.refresh
          ? await generateTokenMonitorSummary({ since })
          : await loadTokenUsageSummary({ since });

        if (options.provider) {
          printProviderDetails(summary, options.provider);
        } else {
          printSummary(summary);
          
          if (options.hourly) {
            printHourlyStats(summary);
          }
        }
      } catch (err) {
        console.error("Error loading token usage summary:", err);
        process.exit(1);
      }
    });

  // 상세 통계
  cmd
    .command("stats")
    .description("Show detailed statistics")
    .option("-d, --days <number>", "Number of days to include", "7")
    .option("-p, --provider <provider>", "Filter by provider")
    .option("-m, --model <model>", "Filter by model")
    .action(async (options) => {
      try {
        const days = parseInt(options.days, 10);
        const since = Date.now() - days * 24 * 60 * 60 * 1000;

        const summary = await generateTokenMonitorSummary({
          since,
          provider: options.provider,
          model: options.model,
        });

        printSummary(summary);
        printHourlyStats(summary, 48);
      } catch (err) {
        console.error("Error generating statistics:", err);
        process.exit(1);
      }
    });

  // 원시 이벤트 조회
  cmd
    .command("events")
    .description("Show raw token usage events")
    .option("-d, --days <number>", "Number of days to include", "1")
    .option("-p, --provider <provider>", "Filter by provider")
    .option("-m, --model <model>", "Filter by model")
    .option("-l, --limit <number>", "Maximum number of events to show", "20")
    .action(async (options) => {
      try {
        const days = parseInt(options.days, 10);
        const since = Date.now() - days * 24 * 60 * 60 * 1000;
        const limit = parseInt(options.limit, 10);

        await printRawEvents({
          since,
          provider: options.provider,
          model: options.model,
          limit,
        });
      } catch (err) {
        console.error("Error loading events:", err);
        process.exit(1);
      }
    });

  // 초기화
  cmd
    .command("reset")
    .description("Clear token usage monitoring data")
    .option("-k, --keep-days <number>", "Keep data for the last N days")
    .option("-y, --yes", "Skip confirmation")
    .action(async (options) => {
      try {
        const keepDays = options.keepDays ? parseInt(options.keepDays, 10) : undefined;

        if (!options.yes) {
          const { default: inquirer } = await import("inquirer");
          const { confirm } = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: keepDays
                ? `Delete token usage data older than ${keepDays} days?`
                : "Delete ALL token usage monitoring data?",
              default: false,
            },
          ]);

          if (!confirm) {
            console.log("Operation cancelled.");
            return;
          }
        }

        await resetTokenMonitor({ keepDays });
        
        console.log(
          keepDays
            ? `✓ Token usage data older than ${keepDays} days has been cleared.`
            : "✓ All token usage monitoring data has been cleared."
        );
      } catch (err) {
        console.error("Error resetting token monitor:", err);
        process.exit(1);
      }
    });

  return cmd;
}
