# Solo & Co OS

[![test](https://github.com/soloandco/soloandco-os/actions/workflows/test.yml/badge.svg)](https://github.com/soloandco/soloandco-os/actions/workflows/test.yml)

인터뷰를 통해 사용자의 실제 업무 흐름을 파악하고, 1인 창업자·프리랜서·매니지먼트 조직에 맞는 파일 기반 Business OS를 생성하는 오픈소스 프로젝트입니다.

> Status: `v0.1.0` experimental. 실제 사용자 인터뷰와 호환성 검증 전까지 구조가 변경될 수 있습니다.

## 무엇이 다른가요?

- “어떤 폴더를 원하세요?” 대신 최근 실제 업무가 어떻게 시작하고 수금으로 끝났는지 묻습니다.
- 질문지를 나열하지 않습니다. 홈페이지·소개 자료를 먼저 읽고, 자료에 없는 것만 묻습니다.
- AI는 인터뷰와 분류를 담당하고, 결정론적 생성기가 폴더를 만듭니다.
- 같은 인터뷰 JSON은 같은 프리셋·모듈 구조를 만듭니다.
- Claude Fable 5를 사용할 수 있지만 특정 AI 제공자에 종속되지 않습니다.
- 계약·고객·재무 등 민감 정보가 공개 예제에 포함되지 않도록 설계합니다.

## 프리셋

| 프리셋 | 대상 | 핵심 구조 |
|---|---|---|
| `management-agency` | 여러 1인 사업자를 육성하는 조직 | 멤버·매니지먼트·성장·계약·정산 |
| `solo-founder` | 자신의 상품·고객·콘텐츠를 운영하는 1인 창업자 | 사업·상품·고객·프로젝트·재무·실험 |
| `freelancer` | 여러 고객 프로젝트를 수행하는 프리랜서 | 고객사·서비스·영업·프로젝트·청구 |

선택 모듈: `automation`, `content`, `ventures`, `website`.

## 빠른 시작

Node.js 20 이상이 필요합니다.

```bash
git clone https://github.com/soloandco/soloandco-os.git
cd soloandco-os
npm test

node ./bin/create-soloandco-os.mjs \
  --preset solo-founder \
  --modules automation,content,website \
  --target ../my-business-os \
  --name "My Business"
```

생성 전에 구조만 확인할 수도 있습니다.

```bash
node ./bin/create-soloandco-os.mjs \
  --preset management-agency \
  --target ../preview \
  --dry-run
```

## Claude Fable 5 인터뷰로 생성하기

1. [`prompts/claude-fable-interview.md`](prompts/claude-fable-interview.md)를 Claude Fable 5에 제공합니다.
2. [`schemas/interview-profile.schema.json`](schemas/interview-profile.schema.json)을 함께 제공합니다.
3. 인터뷰가 끝나면 JSON 요약을 사용자에게 확인받습니다.
4. JSON을 저장하고 생성기에 전달합니다.

```bash
node ./bin/create-soloandco-os.mjs \
  --profile ./examples/interview-profile.json \
  --target ../sample-business-os
```

Claude API 키는 이 프로젝트에 필요하지 않습니다. 인터뷰 모델이 만든 표준 JSON만 전달하면 됩니다.

## 검증

```bash
npm test
npm pack --dry-run
```

GitHub Actions가 모든 push와 pull request에서 Windows·macOS·Linux 및
Node.js 20·22 조합을 자동 검사합니다.

## 안전 원칙

- 생성기는 기존 파일이 있는 폴더를 덮어쓰지 않습니다.
- 드라이브 루트와 사용자 홈 디렉터리에는 생성하지 않습니다.
- 비밀번호·토큰·은행 인증정보·불필요한 개인정보를 인터뷰하지 않습니다.
- 실제 수치가 없으면 `0`이 아니라 `unknown`을 사용합니다.
- 실제 운영 저장소를 공개판으로 직접 복제하지 않습니다.

## 프로젝트 구조

```text
bin/        CLI
src/        프리셋과 생성 로직
schemas/    인터뷰 출력 계약
prompts/    모델별 인터뷰 프롬프트
docs/       아키텍처와 운영 문서
examples/   완전히 가상화된 예제
test/       생성·검증·안전 테스트
```

## 로드맵

- 실제 사용자 15명 문제 인터뷰
- Windows·macOS·Linux 호환성 테스트
- 대화형 CLI
- 익명화 검사와 공개 내보내기 도구
- 프리셋 업데이트·마이그레이션
- npm `create-soloandco-os` 배포
- Claude·OpenAI 선택형 인터뷰 어댑터

## 지원과 기여 범위

- 1인이 유지보수하는 프로젝트입니다. 이슈는 읽지만 응답 기한을 보장하지 않습니다.
- 환영하는 기여: 템플릿 개선, 번역, 문서 수정, 프리셋 다듬기.
- 메인테이너가 결정하는 영역: 폴더 구조, 스키마, 검사 규칙, 생성기 안전 동작, 라이선스. 구현 전에 이슈로 먼저 제안해 주세요.

## 기여와 보안

- 기여: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- 보안 제보: [`SECURITY.md`](SECURITY.md)
- 행동 강령: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)

Apache-2.0으로 공개됩니다. Solo & Co 명칭과 로고는 [상표 정책](TRADEMARKS.md)을 따릅니다.
