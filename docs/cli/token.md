---
summary: "CLI reference for `openclaw token` (token usage and cost monitoring)"
read_when:
  - You want to see token usage and estimated cost from session logs
  - You want to monitor provider usage/quota alongside session costs
title: "token"
---

# `openclaw token`

세션 로그에서 집계한 **토큰 사용량**과 **추정 비용**을 보여줍니다. 선택적으로 프로바이더(Anthropic, OpenAI 등)의 사용량·쿼터 스냅샷을 함께 볼 수 있습니다.

```bash
openclaw token
openclaw token --days 7
openclaw token --provider
openclaw token --json
```

## 옵션

| 옵션 | 설명 |
|------|------|
| `--days <n>` | 집계할 일수 (기본: 30) |
| `--agent <id>` | 세션 로그를 볼 에이전트 ID (기본: default agent) |
| `--provider` | 프로바이더 사용량·쿼터 스냅샷 포함 |
| `--json` | 텍스트 대신 JSON 출력 |

## 출력

- **일별 토큰·비용**: 세션 transcript JSONL에서 파싱한 input/output/총 토큰 수와 추정 비용(USD). 모델별 단가가 설정되어 있으면 비용이 산정되고, 없으면 토큰만 표시됩니다.
- **합계**: 선택한 기간 전체의 토큰·비용 합계.
- **프로바이더 사용량** (`--provider` 사용 시): 각 프로바이더의 사용량/쿼터 창(예: Anthropic 월간 한도 잔량, OpenAI 청구 주기 잔량). 자격 증명(OAuth/API 키)이 있을 때만 표시됩니다.

비용 추정은 [Gateway 설정](/gateway/configuration)의 `models.providers.<provider>.models[].cost` (input/output/cacheRead/cacheWrite당 USD per 1M tokens)를 사용합니다. [Token use & costs](/token-use)와 [Usage tracking](/concepts/usage-tracking)도 참고하세요.

## 예시

```bash
# 최근 30일 기본 요약
openclaw token

# 최근 7일만
openclaw token --days 7

# 프로바이더 쿼터(한도 잔량) 포함
openclaw token --provider

# 특정 에이전트만
openclaw token --agent my-agent

# 기계 가공용 JSON
openclaw token --json
```

## 관련

- 채팅에서 `/usage cost`: 세션 로그 기반 비용 요약 (동일 데이터 소스).
- `openclaw status --usage`: 프로바이더 사용량·쿼터만 표시 (토큰/비용 테이블 없음).
- [Usage tracking](/concepts/usage-tracking) · [Token use & costs](/token-use)
