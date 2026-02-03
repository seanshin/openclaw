import type { RuntimeEnv } from "../runtime.js";
import { loadConfig } from "../config/config.js";
import {
  formatUsageReportLines,
  loadProviderUsageSummary,
} from "../infra/provider-usage.js";
import {
  loadCostUsageSummary,
  type CostUsageSummary,
} from "../infra/session-cost-usage.js";
import { formatTokenCount, formatUsd } from "../utils/usage-format.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";

export type TokenCommandOptions = {
  days?: number;
  json?: boolean;
  agent?: string;
  /** 프로바이더 사용량/쿼터 스냅샷 포함 */
  provider?: boolean;
};

function parseDays(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw));
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return Math.max(1, Math.floor(n));
    }
  }
  return 30;
}

function formatCostSummaryTable(summary: CostUsageSummary): string[] {
  const lines: string[] = [];
  const columns = [
    { key: "date", header: "날짜", align: "left" as const },
    { key: "input", header: "Input", align: "right" as const },
    { key: "output", header: "Output", align: "right" as const },
    { key: "totalTokens", header: "총 토큰", align: "right" as const },
    { key: "cost", header: "비용(USD)", align: "right" as const },
  ];
  const t = summary.totals;
  const rows = summary.daily.map((d) => ({
    date: d.date,
    input: formatTokenCount(d.input),
    output: formatTokenCount(d.output),
    totalTokens: formatTokenCount(d.totalTokens),
    cost: formatUsd(d.totalCost) ?? "—",
  }));
  rows.push({
    date: theme.heading("합계"),
    input: formatTokenCount(t.input),
    output: formatTokenCount(t.output),
    totalTokens: formatTokenCount(t.totalTokens),
    cost: formatUsd(t.totalCost) ?? "—",
  });
  lines.push(theme.heading("일별 토큰·비용 (세션 로그 기준)"));
  lines.push(
    renderTable({
      columns,
      rows,
      border: "unicode",
    }),
  );
  if (t.missingCostEntries > 0) {
    lines.push(theme.muted(`  (비용 미산정 응답 ${t.missingCostEntries}건)`));
  }
  return lines;
}

export async function tokenCommand(
  runtime: RuntimeEnv,
  opts: TokenCommandOptions,
): Promise<void> {
  const days = parseDays(opts.days ?? 30);
  const config = loadConfig();
  const agentId = opts.agent?.trim() || undefined;

  const [costSummary, providerSummary] = await Promise.all([
    loadCostUsageSummary({ days, config, agentId }),
    opts.provider ? loadProviderUsageSummary() : Promise.resolve(null),
  ]);

  if (opts.json) {
    const out: Record<string, unknown> = {
      cost: costSummary,
      updatedAt: costSummary.updatedAt,
    };
    if (providerSummary) {
      out.provider = providerSummary;
    }
    runtime.log(JSON.stringify(out, null, 2));
    return;
  }

  const lines: string[] = [];
  lines.push(theme.heading(`토큰 모니터링 (최근 ${days}일)`));
  if (agentId) {
    lines.push(theme.muted(`에이전트: ${agentId}`));
  }
  lines.push("");

  for (const line of formatCostSummaryTable(costSummary)) {
    lines.push(line);
  }

  if (providerSummary && providerSummary.providers.length > 0) {
    lines.push("");
    lines.push(theme.heading("프로바이더 사용량·쿼터"));
    for (const line of formatUsageReportLines(providerSummary)) {
      lines.push(line);
    }
  }

  runtime.log(lines.join("\n"));
}
