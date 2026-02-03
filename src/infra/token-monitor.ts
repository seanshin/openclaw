import type { NormalizedUsage } from "../agents/usage.js";
import type { OpenClawConfig } from "../config/config.js";
import type {
  TokenUsageEvent,
  TokenMonitorSummary,
  TokenUsageAggregation,
  ProviderTokenStats,
  TokenLimitStatus,
  TokenMonitorConfig,
} from "./token-monitor.types.js";
import {
  appendTokenUsageEvent,
  readTokenUsageEvents,
  saveTokenMonitorSummary,
  loadTokenMonitorSummary,
  clearTokenMonitorData,
} from "./token-monitor.store.js";
import { estimateUsageCost, resolveModelCostConfig } from "../utils/usage-format.js";
import { logVerbose } from "../globals.js";

const SUMMARY_CACHE_TTL_MS = 60_000; // 1분

let summaryCache: {
  summary?: TokenMonitorSummary;
  updatedAt?: number;
} = {};

/**
 * 빈 집계 객체 생성
 */
function createEmptyAggregation(): TokenUsageAggregation {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    cost: 0,
    requestCount: 0,
  };
}

/**
 * 집계에 사용량 추가
 */
function addUsageToAggregation(agg: TokenUsageAggregation, usage: NormalizedUsage, cost: number = 0): void {
  agg.input += usage.input ?? 0;
  agg.output += usage.output ?? 0;
  agg.cacheRead += usage.cacheRead ?? 0;
  agg.cacheWrite += usage.cacheWrite ?? 0;
  agg.total += usage.total ?? ((usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0));
  agg.cost += cost;
  agg.requestCount += 1;
}

/**
 * 날짜를 시간 키로 변환 (YYYY-MM-DD HH:00)
 */
function formatHourKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:00`;
}

/**
 * 날짜를 일 키로 변환 (YYYY-MM-DD)
 */
function formatDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 토큰 사용량 기록
 */
export async function recordTokenUsage(params: {
  provider: string;
  model: string;
  usage: NormalizedUsage;
  config?: OpenClawConfig;
  sessionId?: string;
  agentId?: string;
}): Promise<void> {
  const cost = estimateUsageCost({
    usage: params.usage,
    cost: resolveModelCostConfig({
      provider: params.provider,
      model: params.model,
      config: params.config,
    }),
  });

  const event: TokenUsageEvent = {
    timestamp: Date.now(),
    provider: params.provider,
    model: params.model,
    usage: params.usage,
    cost,
    sessionId: params.sessionId,
    agentId: params.agentId,
  };

  await appendTokenUsageEvent(event);

  // 캐시 무효화
  summaryCache = {};
}

/**
 * 토큰 사용량 요약 생성
 */
export async function generateTokenMonitorSummary(params?: {
  since?: number;
  until?: number;
  provider?: string;
  model?: string;
}): Promise<TokenMonitorSummary> {
  const total = createEmptyAggregation();
  const byProvider = new Map<string, ProviderTokenStats>();
  const byHour = new Map<string, TokenUsageAggregation>();
  const byDay = new Map<string, TokenUsageAggregation>();

  let periodStart = params?.since ?? Date.now();
  let periodEnd = params?.until ?? Date.now();

  for await (const event of readTokenUsageEvents(params)) {
    // 기간 추적
    if (event.timestamp < periodStart) {
      periodStart = event.timestamp;
    }
    if (event.timestamp > periodEnd) {
      periodEnd = event.timestamp;
    }

    // 전체 집계
    addUsageToAggregation(total, event.usage, event.cost);

    // 프로바이더별 집계
    let providerStats = byProvider.get(event.provider);
    if (!providerStats) {
      providerStats = {
        ...createEmptyAggregation(),
        provider: event.provider,
        models: new Map(),
      };
      byProvider.set(event.provider, providerStats);
    }
    addUsageToAggregation(providerStats, event.usage, event.cost);

    // 모델별 집계
    let modelStats = providerStats.models.get(event.model);
    if (!modelStats) {
      modelStats = createEmptyAggregation();
      providerStats.models.set(event.model, modelStats);
    }
    addUsageToAggregation(modelStats, event.usage, event.cost);

    // 시간별 집계
    const hourKey = formatHourKey(event.timestamp);
    let hourStats = byHour.get(hourKey);
    if (!hourStats) {
      hourStats = createEmptyAggregation();
      byHour.set(hourKey, hourStats);
    }
    addUsageToAggregation(hourStats, event.usage, event.cost);

    // 일별 집계
    const dayKey = formatDayKey(event.timestamp);
    let dayStats = byDay.get(dayKey);
    if (!dayStats) {
      dayStats = createEmptyAggregation();
      byDay.set(dayKey, dayStats);
    }
    addUsageToAggregation(dayStats, event.usage, event.cost);
  }

  // 상위 모델 추출 (토큰 사용량 기준)
  const topModels: Array<{ provider: string; model: string; usage: TokenUsageAggregation }> = [];
  
  for (const [provider, stats] of byProvider.entries()) {
    for (const [model, usage] of stats.models.entries()) {
      topModels.push({ provider, model, usage });
    }
  }

  topModels.sort((a, b) => b.usage.total - a.usage.total);
  const topModelsSlice = topModels.slice(0, 10);

  const summary: TokenMonitorSummary = {
    updatedAt: Date.now(),
    period: {
      start: periodStart,
      end: periodEnd,
    },
    total,
    byProvider,
    byHour,
    byDay,
    topModels: topModelsSlice,
  };

  // 캐시 및 저장
  summaryCache = {
    summary,
    updatedAt: Date.now(),
  };
  
  await saveTokenMonitorSummary(summary);

  return summary;
}

/**
 * 토큰 사용량 요약 로드 (캐시 사용)
 */
export async function loadTokenUsageSummary(params?: {
  since?: number;
  until?: number;
  forceRefresh?: boolean;
}): Promise<TokenMonitorSummary> {
  const now = Date.now();

  // 캐시 확인
  if (
    !params?.forceRefresh &&
    summaryCache.summary &&
    summaryCache.updatedAt &&
    now - summaryCache.updatedAt < SUMMARY_CACHE_TTL_MS
  ) {
    return summaryCache.summary;
  }

  // 캐시된 파일 확인
  if (!params?.forceRefresh) {
    const cached = await loadTokenMonitorSummary();
    if (cached && now - cached.updatedAt < SUMMARY_CACHE_TTL_MS) {
      summaryCache = {
        summary: cached,
        updatedAt: cached.updatedAt,
      };
      return cached;
    }
  }

  // 새로 생성
  return await generateTokenMonitorSummary(params);
}

/**
 * 토큰 사용 제한 확인
 */
export async function checkTokenLimits(config: TokenMonitorConfig): Promise<TokenLimitStatus | null> {
  if (!config.limits) {
    return null;
  }

  const summary = await loadTokenUsageSummary();
  const now = Date.now();

  // 시간별 제한 확인
  if (config.limits.hourly) {
    const hourKey = formatHourKey(now);
    const hourStats = summary.byHour.get(hourKey);

    if (hourStats) {
      if (config.limits.hourly.maxTokens && hourStats.total >= config.limits.hourly.maxTokens) {
        return {
          isLimitExceeded: true,
          limitType: "hourly",
          limitField: "tokens",
          current: hourStats.total,
          limit: config.limits.hourly.maxTokens,
          percentage: (hourStats.total / config.limits.hourly.maxTokens) * 100,
        };
      }

      if (config.limits.hourly.maxCost && hourStats.cost >= config.limits.hourly.maxCost) {
        return {
          isLimitExceeded: true,
          limitType: "hourly",
          limitField: "cost",
          current: hourStats.cost,
          limit: config.limits.hourly.maxCost,
          percentage: (hourStats.cost / config.limits.hourly.maxCost) * 100,
        };
      }
    }
  }

  // 일별 제한 확인
  if (config.limits.daily) {
    const dayKey = formatDayKey(now);
    const dayStats = summary.byDay.get(dayKey);

    if (dayStats) {
      if (config.limits.daily.maxTokens && dayStats.total >= config.limits.daily.maxTokens) {
        return {
          isLimitExceeded: true,
          limitType: "daily",
          limitField: "tokens",
          current: dayStats.total,
          limit: config.limits.daily.maxTokens,
          percentage: (dayStats.total / config.limits.daily.maxTokens) * 100,
        };
      }

      if (config.limits.daily.maxCost && dayStats.cost >= config.limits.daily.maxCost) {
        return {
          isLimitExceeded: true,
          limitType: "daily",
          limitField: "cost",
          current: dayStats.cost,
          limit: config.limits.daily.maxCost,
          percentage: (dayStats.cost / config.limits.daily.maxCost) * 100,
        };
      }
    }
  }

  // 월별 제한 확인
  if (config.limits.monthly) {
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthSummary = await generateTokenMonitorSummary({
      since: monthStart.getTime(),
      until: now,
    });

    if (config.limits.monthly.maxTokens && monthSummary.total.total >= config.limits.monthly.maxTokens) {
      return {
        isLimitExceeded: true,
        limitType: "monthly",
        limitField: "tokens",
        current: monthSummary.total.total,
        limit: config.limits.monthly.maxTokens,
        percentage: (monthSummary.total.total / config.limits.monthly.maxTokens) * 100,
      };
    }

    if (config.limits.monthly.maxCost && monthSummary.total.cost >= config.limits.monthly.maxCost) {
      return {
        isLimitExceeded: true,
        limitType: "monthly",
        limitField: "cost",
        current: monthSummary.total.cost,
        limit: config.limits.monthly.maxCost,
        percentage: (monthSummary.total.cost / config.limits.monthly.maxCost) * 100,
      };
    }
  }

  return {
    isLimitExceeded: false,
    current: 0,
    limit: 0,
    percentage: 0,
  };
}

/**
 * 토큰 모니터 데이터 초기화
 */
export async function resetTokenMonitor(params?: { keepDays?: number }): Promise<void> {
  await clearTokenMonitorData(params);
  summaryCache = {};
  logVerbose(`Token monitor data cleared${params?.keepDays ? ` (kept last ${params.keepDays} days)` : ""}`);
}

// Export types and store functions
export type {
  TokenUsageEvent,
  TokenMonitorSummary,
  TokenUsageAggregation,
  ProviderTokenStats,
  TokenLimitStatus,
  TokenMonitorConfig,
} from "./token-monitor.types.js";

export {
  readTokenUsageEvents,
  resolveTokenMonitorStorePath,
  resolveTokenMonitorSummaryPath,
} from "./token-monitor.store.js";
