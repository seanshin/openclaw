import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "../config/paths.js";
import type { TokenUsageEvent, TokenMonitorSummary, TokenUsageAggregation } from "./token-monitor.types.js";
import { logVerbose } from "../globals.js";

const TOKEN_MONITOR_FILENAME = "token-monitor.jsonl";
const SUMMARY_CACHE_FILENAME = "token-monitor-summary.json";

/**
 * 토큰 모니터 데이터 저장 경로 반환
 */
export function resolveTokenMonitorStorePath(): string {
  const dataDir = resolveDataDir();
  return path.join(dataDir, TOKEN_MONITOR_FILENAME);
}

/**
 * 토큰 모니터 요약 캐시 경로 반환
 */
export function resolveTokenMonitorSummaryPath(): string {
  const dataDir = resolveDataDir();
  return path.join(dataDir, SUMMARY_CACHE_FILENAME);
}

/**
 * 토큰 사용 이벤트를 저장소에 추가
 */
export async function appendTokenUsageEvent(event: TokenUsageEvent): Promise<void> {
  try {
    const storePath = resolveTokenMonitorStorePath();
    const dataDir = path.dirname(storePath);
    
    // 디렉토리가 없으면 생성
    if (!fs.existsSync(dataDir)) {
      await fs.promises.mkdir(dataDir, { recursive: true });
    }

    const line = JSON.stringify(event) + "\n";
    await fs.promises.appendFile(storePath, line, "utf-8");
  } catch (err) {
    logVerbose(`Failed to append token usage event: ${String(err)}`);
  }
}

/**
 * 저장소에서 토큰 사용 이벤트 읽기
 */
export async function* readTokenUsageEvents(params?: {
  since?: number;
  until?: number;
  provider?: string;
  model?: string;
}): AsyncGenerator<TokenUsageEvent> {
  const storePath = resolveTokenMonitorStorePath();
  
  if (!fs.existsSync(storePath)) {
    return;
  }

  const fileStream = fs.createReadStream(storePath, { encoding: "utf-8" });
  const chunks: string[] = [];
  let buffer = "";

  for await (const chunk of fileStream) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const event = JSON.parse(trimmed) as TokenUsageEvent;

        // 필터링
        if (params?.since && event.timestamp < params.since) {
          continue;
        }
        if (params?.until && event.timestamp > params.until) {
          continue;
        }
        if (params?.provider && event.provider !== params.provider) {
          continue;
        }
        if (params?.model && event.model !== params.model) {
          continue;
        }

        yield event;
      } catch (err) {
        logVerbose(`Failed to parse token usage event: ${String(err)}`);
      }
    }
  }

  // 마지막 라인 처리
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer) as TokenUsageEvent;
      
      if (params?.since && event.timestamp < params.since) {
        return;
      }
      if (params?.until && event.timestamp > params.until) {
        return;
      }
      if (params?.provider && event.provider !== params.provider) {
        return;
      }
      if (params?.model && event.model !== params.model) {
        return;
      }

      yield event;
    } catch (err) {
      logVerbose(`Failed to parse last token usage event: ${String(err)}`);
    }
  }
}

/**
 * 요약 캐시 저장
 */
export async function saveTokenMonitorSummary(summary: TokenMonitorSummary): Promise<void> {
  try {
    const summaryPath = resolveTokenMonitorSummaryPath();
    const dataDir = path.dirname(summaryPath);

    if (!fs.existsSync(dataDir)) {
      await fs.promises.mkdir(dataDir, { recursive: true });
    }

    // Map을 객체로 변환
    const serializable = {
      ...summary,
      byProvider: Object.fromEntries(
        Array.from(summary.byProvider.entries()).map(([provider, stats]) => [
          provider,
          {
            ...stats,
            models: Object.fromEntries(stats.models),
          },
        ])
      ),
      byHour: Object.fromEntries(summary.byHour),
      byDay: Object.fromEntries(summary.byDay),
    };

    await fs.promises.writeFile(summaryPath, JSON.stringify(serializable, null, 2), "utf-8");
  } catch (err) {
    logVerbose(`Failed to save token monitor summary: ${String(err)}`);
  }
}

/**
 * 요약 캐시 로드
 */
export async function loadTokenMonitorSummary(): Promise<TokenMonitorSummary | null> {
  try {
    const summaryPath = resolveTokenMonitorSummaryPath();

    if (!fs.existsSync(summaryPath)) {
      return null;
    }

    const content = await fs.promises.readFile(summaryPath, "utf-8");
    const data = JSON.parse(content);

    // 객체를 Map으로 변환
    const summary: TokenMonitorSummary = {
      ...data,
      byProvider: new Map(
        Object.entries(data.byProvider).map(([provider, stats]: [string, any]) => [
          provider,
          {
            ...stats,
            models: new Map(Object.entries(stats.models)),
          },
        ])
      ),
      byHour: new Map(Object.entries(data.byHour)),
      byDay: new Map(Object.entries(data.byDay)),
    };

    return summary;
  } catch (err) {
    logVerbose(`Failed to load token monitor summary: ${String(err)}`);
    return null;
  }
}

/**
 * 토큰 모니터 데이터 초기화
 */
export async function clearTokenMonitorData(params?: { keepDays?: number }): Promise<void> {
  try {
    const storePath = resolveTokenMonitorStorePath();
    const summaryPath = resolveTokenMonitorSummaryPath();

    if (params?.keepDays) {
      // 지정된 일수 이전 데이터만 삭제
      const cutoffTime = Date.now() - params.keepDays * 24 * 60 * 60 * 1000;
      const tempPath = storePath + ".tmp";
      const writeStream = fs.createWriteStream(tempPath, { encoding: "utf-8" });

      for await (const event of readTokenUsageEvents({ since: cutoffTime })) {
        writeStream.write(JSON.stringify(event) + "\n");
      }

      writeStream.end();
      await fs.promises.rename(tempPath, storePath);
    } else {
      // 모든 데이터 삭제
      if (fs.existsSync(storePath)) {
        await fs.promises.unlink(storePath);
      }
      if (fs.existsSync(summaryPath)) {
        await fs.promises.unlink(summaryPath);
      }
    }
  } catch (err) {
    logVerbose(`Failed to clear token monitor data: ${String(err)}`);
    throw err;
  }
}
