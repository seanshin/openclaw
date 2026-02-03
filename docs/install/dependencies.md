---
summary: "의존성 구조: 루트 패키지, 워크스페이스, 확장 패키지"
read_when:
  - Adding or moving dependencies in the repo
  - Understanding root vs extension dependency rules
title: "Dependency structure"
---

# 의존성 구조 (Dependency structure)

이 저장소는 **pnpm 워크스페이스**로 구성되어 있으며, 의존성은 아래와 같이 분리됩니다.

## 1. 루트 패키지 (`openclaw`)

- **위치**: 프로젝트 루트 `package.json`
- **역할**: CLI, Gateway, 코어 채널, 에이전트 런타임 등 모든 코어 기능의 런타임·빌드 의존성
- **설치**: `pnpm install` (루트에서 실행 시 워크스페이스 전체 설치)
- **규칙**:
  - 코어에서 쓰는 라이브러리는 루트 `dependencies` / `devDependencies`에만 두고, 확장(extensions) 전용 라이브러리는 루트에 넣지 않음
  - `pnpm.overrides` / `pnpm.onlyBuiltDependencies`는 루트에서만 정의

## 2. 워크스페이스 목록 (`pnpm-workspace.yaml`)

```yaml
packages:
  - .           # 루트 (openclaw)
  - ui          # Control UI (openclaw-control-ui)
  - packages/*  # packages/moltbot, packages/clawdbot 등
  - extensions/* # 채널/기능 확장 플러그인
```

## 3. 확장 패키지 (`extensions/*`)

- **역할**: 채널 플러그인(Telegram, Slack, msteams 등), 인증/프록시 확장
- **의존성 분리 규칙**:
  - **확장 전용 라이브러리**: 해당 확장의 `package.json` → `dependencies`에만 추가 (루트에 넣지 않음)
  - **openclaw 코어 참조**: `openclaw`는 `devDependencies` 또는 `peerDependencies`에 `workspace:*`로 두고, `dependencies`에는 넣지 않음 (npm 설치 시 `workspace:*`가 깨지므로). 런타임에는 `openclaw/plugin-sdk` 등이 jiti alias로 해석됨
- **설치**: 플러그인 설치 시 해당 확장 디렉터리에서 `npm install --omit=dev`가 실행되므로, 런타임에 필요한 패키지는 반드시 `dependencies`에 두어야 함

## 4. UI 패키지 (`ui`)

- **이름**: `openclaw-control-ui`
- **역할**: Control UI(웹) 빌드. Lit, Vite 등 UI 전용 의존성만 보유
- **의존성**: 루트와 분리; 루트 빌드 스크립트에서 `pnpm ui:build` 등으로 호출

## 5. 기타 워크스페이스 (`packages/*`)

- `packages/moltbot`, `packages/clawdbot` 등: 필요 시 `openclaw`를 `workspace:*`로 참조
- 이들 패키지 전용 의존성은 각 `package.json`에만 두고 루트로 올리지 않음

## 요약

| 구분 | 의존성 위치 | openclaw 참조 |
|------|-------------|----------------|
| 루트 | 루트 `package.json` | N/A (자기 자신) |
| extensions/* | 각 확장 `package.json` | devDependencies / peerDependencies `workspace:*` |
| ui | ui/package.json | 없음 (별도 앱) |
| packages/* | 각 패키지 package.json | 필요 시 workspace:* |

새 확장을 추가할 때는 [Plugins manifest](/plugins/manifest) 및 [Channel extensions](/channels) 문서를 참고하고, **확장 전용 의존성은 해당 확장의 package.json에만** 추가하세요.
