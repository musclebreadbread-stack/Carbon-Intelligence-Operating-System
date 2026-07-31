# Implementation Plan

대상 저장소: `/projects/sandbox/Carbon-Intelligence-Operating-System`  
작업 브랜치: `feat/cios-core-implementation` (기존 PR #1 브랜치 유지, 다른 브랜치로 전환하지 않음)

## 확인된 현재 기준선

- 미커밋 변경은 health/API 응답의 실제 데이터 모드 판정, OAuth callback 오류 코드와 로그인 경고 UI, `src/middleware.ts` → `src/proxy.ts` 전환이다. 이 변경은 보존 대상이며 첫 단계에서만 정리·검증·커밋한다.
- Node `v22.23.1`로 직접 측정한 결과: `npm test` **84개 파일 / 1,644개 테스트 통과**, `npm run typecheck` 통과, `npm run lint` 오류 0이다.
- 알려진 환경값을 빈 문자열로 덮어쓴 실질적 무설정 빌드와 CI placeholder 환경 빌드가 모두 통과했고, 39개 페이지 생성 및 Next 16 `Proxy (Middleware)` 인식을 확인했다.
- `prisma validate`/`prisma generate`가 통과했다. `prisma/schema.prisma`에서 오프라인 생성한 SQL과 `prisma/migrations/0_init/migration.sql`은 SHA-256 `ec9ef815e8b42496f840f72d916916f96af31c2a1e9f184d039bf0a61028f72c`로 바이트 단위 일치한다.
- 추적 중인 TSX는 `src/app` 62개, `src/components` 55개(합계 117개)이며, 영어 JSX/문자열 후보가 있는 파일이 57~64개, 포맷 호출 후보가 561곳이다.

## 구현 결정

1. **URL prefix 없이 cookie locale을 사용한다.** `User`와 `Organization`에 locale/language 선호 필드가 없고 기존 활성 법인 선택도 cookie로 처리하므로, `cios-locale=ko|en`을 request-time에 읽어 첫 HTML부터 올바른 언어로 렌더링한다. 기존 URL·API·북마크를 모두 유지하며 기본값은 `ko`(`ko-KR`), 영어는 `en`(`en-US`)이다.
2. **자체 typed dictionary와 server/client adapter를 사용한다.** 새 대형 i18n 프레임워크를 추가하지 않고, 한·영 key parity를 타입/테스트로 강제하며 Server Component는 async locale/translator, Client Component는 context hook을 사용한다. 기술 코드, 사용자 입력, 고유명사는 번역하지 않는다.
3. **모든 표시 포맷에 locale을 명시한다.** `Intl.NumberFormat`/`Intl.DateTimeFormat` 기반 formatter factory를 만들고 UTC 날짜 안정성을 유지한다. 통화·백분율·배출량·단위·월·enum/scope 라벨도 같은 locale에서 나온 값만 사용해 hydration 불일치를 막는다.
4. **이번 사이클의 추가 범위는 운영상 막혀 있는 고가치 기능만 선택한다.** 실제 XLSX/PDF/DOCX export, private evidence upload, 기간 잠금과 승인 workflow, 핵심 접근성/모바일 셸을 구현한다. 표준·규제의 전체 질문서/제출 자동화처럼 외부 라이선스·법률 판단·대규모 신규 도메인이 필요한 기능은 정확히 보류한다.
5. **스키마를 바꾸는 각 단계에서 단일 baseline을 즉시 오프라인 재생성한다.** 이 저장소의 기존 결정대로 새 증분 migration을 만들지 않고 `0_init/migration.sql`을 `prisma migrate diff --from-empty`로 재생성한 뒤 Node SHA-256/Buffer 비교로 검증한다.

## 구조화된 갭 분석과 이번 사이클 선택

| 영역 | 현재 분류와 코드 근거 | 가치/비용 | 이번 사이클 결정 |
| --- | --- | --- | --- |
| GHG Protocol | **implemented** — Scope 1/2/3 엔진, 연결·집계, 요구사항 카탈로그 | 높음/완료 | 회귀 검증만 |
| ISO 14064 | **partial** — 14064-1 요구사항과 14064-3 검증 흐름은 있으나 표준 전체 산출물은 아님 | 높음/높음 | 실제 공시 export가 공통 기반을 제공; 전체 인증 양식은 보류 |
| ISO 14067 / 14068 | **absent** — 제품 PCF/탄소중립 claim 전용 엔진 없음 | 높음/매우 높음 | 보류: 제품 경계·배분·LCA 데이터와 검증 정책이 선행되어야 함 |
| ISSB / CSRD / ESRS / CDP / TCFD | **partial** — 정량 핵심+필수 서술 heading의 의도적 부분 카탈로그 | 높음/높음 | 실제 XLSX/PDF/DOCX export만 구현; 전체 질문서/XBRL/포털 제출은 보류 |
| TNFD | **absent** — enum/reference만 있고 요구사항 0개 | 중간/매우 높음 | 보류: 자연자본 데이터 모델이 없음 |
| SBTi | **partial** — 절대감축·SDA·적격성 계산 구현, 공식 제출/검증은 외부 | 높음/중간~높음 | 회귀 검증; 제출 자동화 보류 |
| SBTi FLAG | **absent** — `FLAG` boundary enum 외 산림·토지·농업 엔진 없음 | 업종 의존/매우 높음 | 보류 |
| K-ETS | **partial** — generic ETS 포지션과 GIR 계수는 있으나 명세서/할당·제출 workflow가 없음 | 국내 높음/매우 높음 | 기간 잠금·승인으로 감사 가능한 기반만 구현; 법정 서식/제출은 보류 |
| 목표관리제, 환경부/산업부 제출 | **absent** — 문서 안내만 존재 | 국내 높음/매우 높음 | 보류: 대상 판단·최신 법정 양식·기관 연계가 필요 |
| 한국전력/전력거래소 | **partial/absent** — KEPCO demo energy source는 있으나 KEPCO/KPX ingestion adapter 없음 | 중간/높음 | 보류: 계약/API/데이터 라이선스 필요 |
| PCF/LCA | **partial infrastructure** — Product·Supplier·Scope 3·배분은 있으나 제품 기능단위/생애주기 결과 없음 | 높음/매우 높음 | 보류 |
| DPP / CBAM | **absent** | 높음/매우 높음 | 보류: PCF/LCA 및 규정 버전 관리 후 진행 |
| 공급망 협업 | **partial** — supplier master/계수는 있으나 초대·설문·승인 portal 없음 | 높음/높음 | 보류 |
| Climate risk | **partial** — scenario와 공시 heading은 있으나 hazard/exposure/risk register 없음 | 높음/매우 높음 | 보류 |
| AI 규제 모니터링 | **absent** | 중간/높음+상시 운영 | 보류: 신뢰 가능한 소스·검토 책임자·알림 채널 선정 필요 |
| 실제 Excel/PDF/Word export | **absent** — `ReportGeneration` metadata만 completed로 기록 | 매우 높음/중간 | **구현** |
| 증빙 업로드 | **partial** — URL/해시 metadata만 있고 Storage upload 없음 | 매우 높음/중간 | **구현** |
| 기간 마감/잠금 | **absent** | 매우 높음/중간 | **구현** |
| 승인 workflow | **partial schema only** — Workflow/Step/Execution/Approval 모델은 있으나 실행 경로 없음 | 매우 높음/중간 | **구현**(인벤토리 마감에 한정) |
| 알림 전달 | **partial** — in-app 완료, email/Slack/SMS/webhook은 기록만 함 | 높음/외부 의존 | provider 선정이 필요하므로 외부 채널은 보류 |
| 다법인 연결 | **implemented** — 검증된 cookie switcher와 tenant scope | 높음/완료 | 회귀 검증만 |
| CFO dashboard | **partial** — carbon finance/MACC/투자 지표는 있으나 전용 executive view 없음 | 중간/중간 | 보류: 사용자 KPI 우선순위 필요 |
| 접근성/반응형 | **partial** — form ARIA와 responsive grid는 있으나 mobile nav/자동 a11y gate 부족 | 높음/낮음~중간 | **구현** |
| 성능/관측성 | **partial/absent** — 캐시 일부, provider-neutral observability 없음 | 높음/중간+외부 선택 | 이번에는 baseline 측정만 문서화; Sentry/OTel backend 선정 전 연동 보류 |

# Implementation Plan

- [ ] 1. 미커밋 중단 작업을 보존한 채 복구·검증하고 첫 커밋으로 고정한다.
      먼저 `git diff`, `git diff --cached`, untracked 파일 내용을 다시 확인한 뒤 health의 effective data mode, callback stable error code/open-redirect 방어, 로그인 alert, Next 16 proxy rename을 완성한다. `src/proxy.test.ts`를 추가해 session refresh 위임과 matcher를 고정하고, 아래 명시 파일만 stage하여 `fix: recover health auth callback and next proxy`로 커밋한다.
      Files: `src/app/(auth)/auth-pages.test.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/_components/callback-error.tsx`, `src/app/(auth)/_components/callback-error.test.tsx`, `src/app/api/v1/_lib/handler.ts`, `src/app/api/v1/health/route.ts`, `src/app/api/v1/health/route.test.ts`, `src/app/auth/callback/route.ts`, `src/app/auth/callback/route.test.ts`, `src/lib/data/db.ts`, `src/lib/data/db.test.ts`, `src/middleware.ts`(삭제), `src/proxy.ts`, `src/proxy.test.ts`
      Verify: `npm test -- 'src/app/(auth)' src/app/auth/callback src/app/api/v1/health src/lib/data/db.test.ts src/proxy.test.ts && npm run typecheck && npm run lint && npm run build` — 대상 테스트와 Next production build가 통과하고 build route table에 `Proxy (Middleware)`가 표시된다. `git show --stat --oneline HEAD`에는 위 복구 파일만 포함되고 이후 `git status --short`에는 이 커밋의 파일이 남지 않는다.

- [ ] 2. 최근 결함 수정 7종을 end-to-end로 재검증하고 나머지 action/repository/API 경계를 전수 점검한다.
      health writability+envelope mode, CSV mapping/transactional commit, `VerificationFinding.misstatementAmount`, `APIKey.rateLimit`, `MonitoringParameter.emissionSourceId`, rule notify→Notification, pgvector 제거를 schema→repository→action/API→UI 순서로 확인한다. `TODO/FIXME`, 비활성 버튼, metadata만 성공 처리하는 경로, demo/database 불일치를 정적 검토하고 발견된 추가 결함은 같은 계층의 회귀 테스트와 함께 수정하되 기존 설계를 바꾸지 않는다.
      Files: `src/app/api/v1/_lib/handler.ts`, `src/app/api/v1/_lib/handler.test.ts`, `src/app/api/v1/health/route.ts`, `src/app/api/v1/health/route.test.ts`, `src/app/(dashboard)/activity-data/_components/csv-import.tsx`, `src/app/(dashboard)/activity-data/_components/csv-import.test.tsx`, `src/app/(dashboard)/verification/_components/finding-form.tsx`, `src/lib/actions/activity-data.ts`, `src/lib/actions/activity-data.test.ts`, `src/lib/actions/verification.ts`, `src/lib/actions/verification.test.ts`, `src/lib/actions/rules.ts`, `src/lib/actions/notifications.ts`, `src/lib/domain/notifications/deliver.ts`, `src/lib/data/repositories/{mrv,security,verification,notifications}.ts`, 해당 `*.test.ts`, `src/lib/api/rate-limit.ts`, `src/lib/api/rate-limit.test.ts`, `prisma/schema.prisma`, `prisma/migrations/0_init/migration.sql`
      Verify: `npm test -- src/app/api/v1 src/lib/api src/lib/actions/activity-data.test.ts src/lib/actions/verification.test.ts src/lib/actions/notifications.test.ts src/lib/data/repositories/mrv.test.ts src/lib/data/repositories/notifications.test.ts src/lib/domain/notifications src/lib/zero-config.test.ts && npm test` — 알려진 결함의 회귀 테스트와 전체 suite가 모두 통과한다.

- [ ] 3. 한글 기본 cookie locale과 typed i18n/formatter 기반을 만든다.
      `DEFAULT_LOCALE`을 `ko`로 바꾸고 완전한 한·영 dictionary, interpolation/plural helper, async server locale resolver, client provider/hooks를 만든다. root layout에서 `cios-locale` cookie를 읽어 `<html lang>`과 localized metadata를 첫 응답부터 설정하며, `setLocaleAction`은 허용값만 1년짜리 httpOnly/sameSite cookie로 저장하고 layout을 revalidate한다. `format.ts`는 locale-scoped formatter로 바꿔 숫자·배출량·백분율·통화·UTC 날짜/시간·월·단위·scope/enum을 `ko-KR`/`en-US`로 출력한다.
      Files: `src/lib/i18n/messages.ts`, `src/lib/i18n/locales.ts`, `src/lib/i18n/catalog.ts`, `src/lib/i18n/dictionaries/ko.ts`, `src/lib/i18n/dictionaries/en.ts`, `src/lib/i18n/server.ts`, `src/lib/i18n/validation.ts`, `src/lib/i18n/i18n.test.ts`, `src/lib/format.ts`, `src/lib/format.test.ts`, `src/components/providers/locale-provider.tsx`, `src/components/layout/language-switcher.tsx`, `src/lib/actions/auth.ts`, `src/lib/actions/auth.test.ts`, `src/app/layout.tsx`
      Verify: `npm test -- src/lib/i18n src/lib/format.test.ts src/lib/actions/auth.test.ts && npm run typecheck && npm run build` — default `ko`, cookie `en`, invalid cookie fallback, dictionary key parity, Korean/English number·KRW/USD·UTC date·unit formatting과 server/client translator가 모두 통과한다.

- [ ] 4. 앱 셸과 공유 컴포넌트를 모두 locale-aware하게 전환한다.
      sidebar/header/tenant switcher/demo banner/provider와 shared table/card/chart/form/error/empty/loading 컴포넌트의 표시 문자열·ARIA label·placeholder·상태 라벨을 dictionary key로 교체하고 header 및 설정 진입점에 언어 전환기를 배치한다. action success/error와 Zod field error는 raw English fallback 대신 현재 locale의 stable key를 렌더링하며 사용자 입력, 환경변수명, 표준 코드만 원문 유지한다.
      Files: `src/components/layout/header.tsx`, `src/components/layout/sidebar.tsx`, `src/components/layout/organization-switcher.tsx`, `src/components/layout/demo-mode-banner.tsx`, `src/components/layout/language-switcher.tsx`, `src/components/providers/session-provider.tsx`, `src/components/providers/locale-provider.tsx`, `src/components/shared/**/*.tsx`, `src/components/charts/**/*.tsx`, `src/components/ui/**/*.tsx`, 해당 `src/components/**/*.test.tsx`, `src/lib/i18n/dictionaries/{ko,en}.ts`
      Verify: `npm test -- src/components && npm run typecheck && npm run lint` — locale provider를 `ko`/`en`으로 각각 렌더링한 component tests가 한글 기본 셸과 영어 전환 결과, localized ARIA/validation/action message를 확인하며 모두 통과한다.

- [ ] 5. 랜딩·인증·특수 상태 화면을 한글 기본/영어 선택으로 전환한다.
      landing metadata/copy, login/register/password reset, callback 오류, Supabase notice, loading/error/not-found/global error의 모든 시스템 문구를 dictionary로 이동한다. auth callback의 URL에는 계속 stable code만 두고, UI에서 locale별 행동 가능한 설명을 선택해 보안 경계를 유지한다.
      Files: `src/app/page.tsx`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`, `src/app/(auth)/_components/callback-error.tsx`, `src/app/(auth)/_components/supabase-notice.tsx`, `src/app/(auth)/auth-pages.test.tsx`, `src/app/(auth)/_components/callback-error.test.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/app/(dashboard)/loading.tsx`, `src/app/(dashboard)/error.tsx`, `src/app/(dashboard)/*/error.tsx`, `src/lib/i18n/dictionaries/{ko,en}.ts`
      Verify: `npm test -- 'src/app/(auth)' src/app/auth/callback && npm run build` — 기본 렌더는 한글이고 `cios-locale=en` context에서는 영어이며, callback 오류 코드별 설명·Supabase 미구성·form validation·metadata가 locale에 맞고 auth 보안 회귀가 통과한다.

- [ ] 6. 핵심 운영 UI 6개 모듈의 page와 client component를 전면 번역·포맷 전환한다.
      dashboard, organization, master-data, activity-data, emission-engine, emission-factors에서 제목/설명/KPI/table/form/dialog/chart/trace/CSV import 문구를 모두 key로 옮긴다. Server Component는 request locale formatter를 생성하고 Client Component는 locale hook을 사용하며, 기존 계산값 동일성 테스트는 raw 숫자 비교를 유지한 채 표시 문자열을 `ko`와 `en` formatter로 각각 검증한다.
      Files: `src/app/(dashboard)/dashboard/page.tsx`, `src/app/(dashboard)/organization/page.tsx`, `src/app/(dashboard)/organization/_components/**/*.tsx`, `src/app/(dashboard)/master-data/page.tsx`, `src/app/(dashboard)/master-data/_components/**/*.tsx`, `src/app/(dashboard)/activity-data/page.tsx`, `src/app/(dashboard)/activity-data/_components/**/*.tsx`, `src/app/(dashboard)/emission-engine/page.tsx`, `src/app/(dashboard)/emission-engine/_components/**/*.tsx`, `src/app/(dashboard)/emission-factors/page.tsx`, `src/app/(dashboard)/emission-factors/_components/**/*.tsx`, `src/app/(dashboard)/emission-engine/_components/scope-totals.test.tsx`, `src/lib/i18n/dictionaries/{ko,en}.ts`
      Verify: `npm test -- 'src/app/(dashboard)/activity-data' 'src/app/(dashboard)/emission-engine' 'src/app/(dashboard)/emission-factors' && npm run typecheck && npm run lint` — 계산값은 그대로이고 한국어 기본의 천 단위/날짜/단위, 영어 전환 표시, CSV/form 상호작용 테스트가 통과한다.

- [ ] 7. AI·분석 UI 5개 모듈과 시스템 생성 서술을 locale-aware하게 전환한다.
      ai-engine, ai-roadmap, ai-simulator, ai-agents, analytics의 모든 화면 copy와 포맷을 번역하고, deterministic narrative 및 OpenAI prompt에 요청 locale을 전달해 시스템이 생성한 설명도 선택 언어를 따른다. 수치 계산·trace는 locale과 독립된 기존 순수 도메인 결과를 그대로 유지한다.
      Files: `src/app/(dashboard)/ai-engine/page.tsx`, `src/app/(dashboard)/ai-engine/_components/**/*.tsx`, `src/app/(dashboard)/ai-roadmap/page.tsx`, `src/app/(dashboard)/ai-roadmap/_components/**/*.tsx`, `src/app/(dashboard)/ai-simulator/page.tsx`, `src/app/(dashboard)/ai-simulator/_components/**/*.tsx`, `src/app/(dashboard)/ai-agents/page.tsx`, `src/app/(dashboard)/ai-agents/_components/**/*.tsx`, `src/app/(dashboard)/analytics/page.tsx`, `src/app/(dashboard)/analytics/_components/**/*.tsx`, `src/lib/ai/llm/types.ts`, `src/lib/ai/llm/deterministic-client.ts`, `src/lib/ai/llm/openai-client.ts`, 해당 `*.test.ts`, `src/app/(dashboard)/ai-simulator/_components/projection-table.test.tsx`, `src/lib/i18n/dictionaries/{ko,en}.ts`
      Verify: `npm test -- 'src/app/(dashboard)/ai-simulator' src/lib/ai/llm src/lib/domain/ai && npm run typecheck` — 같은 입력의 숫자/예측은 locale 간 동일하고 narrative·table·통화·날짜 표시만 한글/영어로 바뀐다.

- [ ] 8. 규제·재무·시스템 UI 8개 모듈을 번역하고 표준 코드와 번역명을 함께 처리한다.
      digital-mrv, verification, esg-disclosure, carbon-finance, notifications, api-gateway, security, settings의 UI를 전환한다. GHG/ISO/CDP/ISSB/ESRS 코드 자체는 보존하되 catalogue의 `nameKo`/English name을 locale별로 선택하고, 설정 화면의 언어 선택·환경 상태·외부 서비스 경계를 한글 기본으로 제공한다.
      Files: `src/app/(dashboard)/digital-mrv/page.tsx`, `src/app/(dashboard)/digital-mrv/_components/**/*.tsx`, `src/app/(dashboard)/verification/page.tsx`, `src/app/(dashboard)/verification/_components/**/*.tsx`, `src/app/(dashboard)/esg-disclosure/page.tsx`, `src/app/(dashboard)/esg-disclosure/_components/**/*.tsx`, `src/app/(dashboard)/carbon-finance/page.tsx`, `src/app/(dashboard)/carbon-finance/_components/**/*.tsx`, `src/app/(dashboard)/notifications/page.tsx`, `src/app/(dashboard)/notifications/_components/**/*.tsx`, `src/app/(dashboard)/api-gateway/page.tsx`, `src/app/(dashboard)/security/page.tsx`, `src/app/(dashboard)/settings/page.tsx`, `src/app/(dashboard)/carbon-finance/_components/net-emissions-panel.test.tsx`, `src/lib/i18n/dictionaries/{ko,en}.ts`
      Verify: `npm test -- 'src/app/(dashboard)/carbon-finance' 'src/app/(dashboard)/verification' src/lib/domain/disclosure src/lib/actions/notifications.test.ts && npm run typecheck && npm run lint` — net=gross−retired, materiality, disclosure completeness 등 계산 회귀는 유지되고 두 locale의 copy/format이 통과한다.

- [ ] 9. 한글 누락과 새 하드코딩 영어 JSX를 막는 anti-drift gate를 추가한다.
      TypeScript compiler AST로 `src/app/**/*.tsx`와 `src/components/**/*.tsx`를 검사해 JSXText, 사용자 노출 attribute, title/label/description/placeholder/ARIA props의 새 영어 literal을 실패시키고 기술 식별자·className·data-testid·표준 코드만 좁은 allowlist로 허용한다. dictionary 한·영 key/placeholder parity, 모든 action messageKey의 한글 존재, enum/scope/unit label coverage도 검사하며 기존 계산-화면 동일성 테스트를 locale parameterized assertion으로 마무리한다.
      Files: `src/lib/i18n/ui-copy-drift.test.ts`, `src/lib/i18n/catalog-coverage.test.ts`, `src/lib/i18n/action-message-coverage.test.ts`, `src/lib/i18n/allowed-ui-literals.ts`, `src/lib/i18n/dictionaries/{ko,en}.ts`, `src/app/(dashboard)/emission-engine/_components/scope-totals.test.tsx`, `src/app/(dashboard)/carbon-finance/_components/net-emissions-panel.test.tsx`, `src/app/(dashboard)/ai-simulator/_components/projection-table.test.tsx`, `src/components/**/*.test.tsx`
      Verify: `npm test -- src/lib/i18n 'src/app/(dashboard)/emission-engine' 'src/app/(dashboard)/carbon-finance' 'src/app/(dashboard)/ai-simulator' && npm test` — 117개 app/components TSX가 검사 대상이며 누락된 `ko`, placeholder 불일치, 새 영어 JSX fixture가 각각 의도대로 실패하는 self-test와 전체 suite가 통과한다.

- [ ] 10. metadata-only 보고서 생성을 실제 XLSX/PDF/DOCX 다운로드로 교체한다.
      assembled disclosure report를 공통 중간 모델로 만들고 ExcelJS worksheet(요약/section/data point), PDF byte stream, OOXML Word 문서 renderer를 구현한다. session+tenant scoped download route는 실제 MIME/Content-Disposition과 bytes를 반환하고 DB 모드에서는 `ReportGeneration.generatedUrl/fileSize/pageCount/status`를 실제 결과로 갱신하며 demo mode에서도 read-only export는 동작하게 한다. Korean PDF를 위해 저장소에 포함한 오픈 라이선스 Noto Sans KR font의 라이선스와 SHA-256을 고정한다.
      Files: `package.json`, `package-lock.json`, `src/lib/reports/types.ts`, `src/lib/reports/disclosure-model.ts`, `src/lib/reports/xlsx.ts`, `src/lib/reports/pdf.ts`, `src/lib/reports/docx.ts`, `src/lib/reports/*.test.ts`, `src/assets/fonts/NotoSansKR-Regular.otf`, `src/assets/fonts/OFL.txt`, `src/app/api/reports/[reportId]/export/route.ts`, `src/app/api/reports/[reportId]/export/route.test.ts`, `src/lib/data/repositories/disclosure.ts`, `src/lib/actions/disclosure.ts`, `src/app/(dashboard)/esg-disclosure/page.tsx`, `src/app/(dashboard)/esg-disclosure/_components/report-downloads.tsx`, `src/lib/i18n/dictionaries/{ko,en}.ts`
      Verify: `npm test -- src/lib/reports src/app/api/reports src/lib/actions/disclosure.test.ts && npm run typecheck && npm run build` — XLSX/DOCX는 `PK`와 필수 OOXML entry, PDF는 `%PDF-`와 한글 text/font embedding, tenant 차단, 실제 byte size metadata를 검증하고 세 format이 빈 placeholder가 아님을 확인한다.

- [ ] 11. Supabase private Storage 기반 실제 증빙 업로드·다운로드와 package 연결을 구현한다.
      인증된 server client로 `evidence` private bucket에 multipart 파일을 올리는 service/route를 만들고 조직·사용자·engagement 경로, 파일명 정규화, MIME/크기 allowlist, 업로드 bytes SHA-256, signed download를 적용한다. `AuditEvidence`를 `EvidencePackage`에 실제 FK로 연결하고 activity entry 및 verification package UI가 URL 수기 입력뿐 아니라 업로드 결과를 선택할 수 있게 한다; 미구성/demo에서는 저장 성공을 가장하지 않고 localized actionable error를 반환한다.
      Files: `prisma/schema.prisma`, `prisma/migrations/0_init/migration.sql`, `src/lib/storage/evidence.ts`, `src/lib/storage/evidence.test.ts`, `src/app/api/evidence/route.ts`, `src/app/api/evidence/route.test.ts`, `src/app/api/evidence/[id]/route.ts`, `src/lib/actions/verification.ts`, `src/lib/actions/verification.test.ts`, `src/lib/data/repositories/audit.ts`, `src/app/(dashboard)/activity-data/_components/entry-form.tsx`, `src/app/(dashboard)/verification/_components/evidence-upload.tsx`, `src/app/(dashboard)/verification/page.tsx`, `src/lib/i18n/dictionaries/{ko,en}.ts`
      Verify: `npm test -- src/lib/storage src/app/api/evidence src/lib/actions/verification.test.ts && DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public' DIRECT_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public' npx prisma validate && npx prisma generate` — mocked Storage upload/download, tenant isolation, MIME/size rejection, byte hash와 package FK가 통과한다. 이어서 CI와 동일한 Node Buffer/SHA-256 drift 검사로 regenerated `0_init`이 schema SQL과 byte-equivalent임을 확인한다.

- [ ] 12. 인벤토리 기간 마감/잠금과 기존 Workflow/Approval 모델의 첫 실제 실행 경로를 구현한다.
      `EmissionInventory`에 lock audit 필드를 추가하고, 마감 요청이 inventory snapshot과 workflow execution 및 지정 approver의 pending approvals를 transaction으로 만든다. 승인/반려는 approver 본인과 tenant를 검증하고 전원 승인 시만 lock하며, 잠긴 연도의 activity create/update/CSV import/calculation rerun/publish는 명확한 `PERIOD_LOCKED` 오류로 차단한다; unlock은 별도 고권한 action과 사유/audit trail을 요구하고 상태 변경을 in-app notification으로 전달한다.
      Files: `prisma/schema.prisma`, `prisma/migrations/0_init/migration.sql`, `src/lib/core/errors.ts`, `src/lib/actions/types.ts`, `src/lib/validation/inventory-close.ts`, `src/lib/data/repositories/inventory-close.ts`, `src/lib/data/repositories/inventory-close.test.ts`, `src/lib/actions/inventory-close.ts`, `src/lib/actions/inventory-close.test.ts`, `src/lib/actions/activity-data.ts`, `src/lib/actions/activity-data.test.ts`, `src/lib/actions/calculation.ts`, `src/lib/actions/calculation.test.ts`, `src/lib/actions/notifications.ts`, `src/app/(dashboard)/emission-engine/_components/inventory-close-panel.tsx`, `src/app/(dashboard)/emission-engine/page.tsx`, `src/app/api/v1/inventories/route.ts`, `src/app/api/v1/inventories/route.test.ts`, `src/lib/i18n/messages.ts`, `src/lib/i18n/dictionaries/{ko,en}.ts`
      Verify: `npm test -- src/lib/actions/inventory-close.test.ts src/lib/data/repositories/inventory-close.test.ts src/lib/actions/activity-data.test.ts src/lib/actions/calculation.test.ts src/app/api/v1/inventories && npx prisma generate && npm run typecheck` — pending→approved/locked, rejection, unauthorized decision, tenant isolation, locked-period mutation denial, reasoned unlock, notification/audit가 통과한다. schema 변경 직후 오프라인 `0_init`을 재생성하고 Node byte/SHA-256 drift 검사도 통과한다.

- [ ] 13. 접근성·모바일 반응형을 자동 검증 가능한 수준으로 보강한다.
      root skip link/main landmark, mobile drawer sidebar, keyboard/focus-visible navigation, dialog/table/form 이름, status live region, chart의 text/table 대체 표현을 보강한다. `vitest-axe`를 추가해 대표 auth/dashboard/form/report 화면에 serious/critical violation 0 gate를 두고 320px shell에서 가로 고정 sidebar가 본문을 가리지 않도록 한다.
      Files: `package.json`, `package-lock.json`, `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/layout/sidebar.tsx`, `src/components/layout/header.tsx`, `src/components/layout/mobile-navigation.tsx`, `src/components/shared/data-table.tsx`, `src/components/shared/form/form-field.tsx`, `src/components/charts/**/*.tsx`, `src/components/accessibility.test.tsx`, `src/components/layout/mobile-navigation.test.tsx`, `src/lib/i18n/dictionaries/{ko,en}.ts`
      Verify: `npm test -- src/components/accessibility.test.tsx src/components/layout src/components/shared && npm run lint && npm run build` — axe serious/critical 위반 0, keyboard open/close/focus return, localized accessible name, mobile navigation tests가 통과한다.

- [ ] 14. 최신 구현·보류·외부 의무를 반영해 한글 문서 원본과 최종 보고서를 갱신하고 Word를 재생성한다.
      setup guide의 오래된 CSV/API rateLimit/misstatement/pgvector/한국어 UI 설명을 실제 상태로 고치고, private Storage bucket/RLS, export 사용법, 기간 approver와 unlock 책임, Korean font license, 여전히 외부인 email/Slack·상용 계수·기관 제출·실DB smoke test를 구분한다. 구조화된 gap 표의 implemented/partial/absent와 이번 구현/보류 사유를 한글 완료 보고서에 옮기고, generator에서 실제 OOXML Word를 마지막에 재생성한다.
      Files: `README.md`, `scripts/generate-setup-guide.ts`, `scripts/generate-setup-guide.test.ts`, `docs/CIOS-직접-설정-가이드.docx`, `docs/구현-완료-보고서.md`
      Verify: `npm test -- scripts/generate-setup-guide.test.ts && npm run docs:setup-guide && node -e "const fs=require('fs'),crypto=require('crypto');const p='docs/CIOS-직접-설정-가이드.docx',b=fs.readFileSync(p);if(b[0]!==0x50||b[1]!==0x4b||b.length<10240)throw Error('invalid OOXML');console.log(b.length,crypto.createHash('sha256').update(b).digest('hex'))"` — 12개 절, 갱신된 의무/보류 표, 한글 본문, 실제 10KB 이상 ZIP/OOXML이 확인된다.

- [ ] 15. CI verify 순서를 그대로 실행하고 migration·문서·zero-config clean-clone 흐름을 최종 gate로 통과시킨다.
      먼저 placeholder 환경에서 install/generate/lint/typecheck/coverage test/build/validate/drift/docs 순서를 실행하고, 이어서 현재 HEAD를 `git archive`로 임시 디렉터리에 풀어 어떤 `.env*`도 없는 clean clone에서 `npm ci`, build, dev boot, health `database.configured:false`, `/dashboard` 200을 확인한다. 마지막으로 환경값 공백/placeholder 양쪽 build, generated Word, tracked files와 git clean을 확인한 뒤 단계별 conventional commits를 남기며 push는 하지 않는다.
      Files: `.github/workflows/ci.yml`(변경이 필요한 경우만), `package.json`(검증 script를 추가한 경우만), 그 외 검증 실패를 수정한 해당 파일
      Verify: 아래 명령을 **순서대로** 실행해 모두 exit 0이어야 한다.
      1. `npm ci && npx prisma generate && npm run lint && npm run typecheck && npm test -- --coverage`
      2. `DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public' DIRECT_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public' NEXT_PUBLIC_SUPABASE_URL='https://placeholder.supabase.co' NEXT_PUBLIC_SUPABASE_ANON_KEY='placeholder' OPENAI_API_KEY='placeholder' NEXT_TELEMETRY_DISABLED=1 npm run build`
      3. `DATABASE_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public' DIRECT_URL='postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public' npx prisma validate && npx prisma generate`
      4. `node -e "const{spawnSync}=require('child_process'),{readFileSync}=require('fs'),{createHash}=require('crypto');const r=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:null,env:{...process.env,DATABASE_URL:'postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public',DIRECT_URL:'postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public'}});if(r.status)process.exit(r.status);const e=readFileSync('prisma/migrations/0_init/migration.sql');if(!e.equals(r.stdout)){console.error(createHash('sha256').update(e).digest('hex'),createHash('sha256').update(r.stdout).digest('hex'));process.exit(1)}"`
      5. `DATABASE_URL='' DIRECT_URL='' NEXT_PUBLIC_SUPABASE_URL='' NEXT_PUBLIC_SUPABASE_ANON_KEY='' OPENAI_API_KEY='' OPENAI_MODEL='' OPENAI_BASE_URL='' OPENAI_ORGANIZATION='' OPENAI_TIMEOUT_MS='' FIELD_ENCRYPTION_KEY='' MAPBOX_ACCESS_TOKEN='' REDIS_URL='' API_RATE_LIMIT_PER_MINUTE='' SEED_ADMIN_PASSWORD='' NEXT_TELEMETRY_DISABLED=1 npm run build`
      6. `npm run docs:setup-guide && npm test -- scripts/generate-setup-guide.test.ts`
      7. 임시 clean-clone에서 `.github/workflows/ci.yml`의 `zero-config` job과 동일하게 `npm ci` → `npm run build` → `npm run dev` → `/api/v1/health` 및 `/dashboard` curl 검사를 수행한다. 기대 결과는 health 200/`database.configured:false`, dashboard 200이다.
      8. `test -z "$(git status --porcelain)" && git log --oneline --decorate -20` — 작업 트리가 완전히 깨끗하고 복구/i18n/선택 기능/문서 커밋이 순서대로 보인다.
