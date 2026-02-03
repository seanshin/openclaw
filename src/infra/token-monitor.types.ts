import type { NormalizedUsage } from "../agents/usage.js";

/**
 * 토큰 사용량 모니터링 이벤트
 */
export type TokenUsageEvent = {
  timestamp: number;
  provider: string;
  model: string;
  usage: NormalizedUsage;
  cost?: number;
  sessionId?: string;
  agentId?: string;
};

/**
 * 시간대별 토큰 사용량 집계
 */
export type TokenUsageAggregation = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
  requestCount: number;
};

/**
 * 프로바이더별 토큰 사용량 통계
 */
export type ProviderTokenStats = TokenUsageAggregation & {
  provider: string;
  models: Map<string, TokenUsageAggregation>;
};

/**
 * 토큰 사용량 모니터링 요약
 */
export type TokenMonitorSummary = {
  updatedAt: number;
  period: {
    start: number;
    end: number;
  };
  total: TokenUsageAggregation;
  byProvider: Map<string, ProviderTokenStats>;
  byHour: Map<string, TokenUsageAggregation>;
  byDay: Map<string, TokenUsageAggregation>;
  topModels: Array<{
    provider: string;
    model: string;
    usage: TokenUsageAggregation;
  }>;
};

/**
 * 토큰 사용량 제한 설정
 */
export type TokenLimitConfig = {
  hourly?: {
    maxTokens?: number;
    maxCost?: number;
  };
  daily?: {
    maxTokens?: number;
    maxCost?: number;
  };
  monthly?: {
    maxTokens?: number;
    maxCost?: number;
  };
};

/**
 * 토큰 사용량 제한 상태
 */
export type TokenLimitStatus = {
  isLimitExceeded: boolean;
  limitType?: "hourly" | "daily" | "monthly";
  limitField?: "tokens" | "cost";
  current: number;
  limit: number;
  percentage: number;
};

/**
 * 토큰 모니터 설정
 */
export type TokenMonitorConfig = {
  enabled: boolean;
  storePath?: string;
  limits?: TokenLimitConfig;
  alertThresholds?: {
    warning: number; // 80% default
    critical: number; // 95% default
  };
};
