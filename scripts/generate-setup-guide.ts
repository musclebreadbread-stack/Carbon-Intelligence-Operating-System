/**
 * Generates `docs/CIOS-직접-설정-가이드.docx` — the Korean hand-off document that
 * lists everything the user has to do themselves, because it needs their own
 * accounts, credentials, money or legal decisions.
 *
 * Written as a generator rather than a hand-authored file so the document stays
 * reviewable in git as source code and can be regenerated whenever the runtime
 * behaviour changes. The degradation text for each environment variable is the
 * same wording the Settings page shows, so the document and the application
 * cannot disagree.
 *
 * Run with: npm run docs:setup-guide
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

/** Output path. Kept in sync with `SETUP_GUIDE_PATH` in src/lib/i18n/messages.ts. */
export const OUTPUT_PATH = "docs/CIOS-직접-설정-가이드.docx";

const BODY_FONT = "Malgun Gothic";
const MONO_FONT = "Consolas";

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

export type GuideBlock =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "steps"; readonly items: readonly string[] }
  | { readonly kind: "bullets"; readonly items: readonly string[] }
  | { readonly kind: "code"; readonly lines: readonly string[] }
  | {
      readonly kind: "table";
      readonly caption?: string;
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

export type GuideSection = {
  readonly number: number;
  /** Korean heading. */
  readonly title: string;
  /** One sentence on why this section exists. */
  readonly summary: string;
  /** Expected cost, always stated even when it is "무료". */
  readonly cost: string;
  readonly blocks: readonly GuideBlock[];
  /** "완료 확인 방법" — how the user knows the section is finished. */
  readonly verification: readonly string[];
};

/**
 * Every variable the code reads, mapped to what stops working without it.
 *
 * Mirrors the `ENVIRONMENT` table in src/app/(dashboard)/settings/page.tsx and
 * the comments in `.env.example`.
 */
export const ENV_TABLE: readonly {
  readonly name: string;
  readonly requirement: "필수" | "선택";
  readonly effect: string;
}[] = [
  {
    name: "DATABASE_URL",
    requirement: "필수",
    effect:
      "데모 모드로 동작합니다. 조회는 내장 샘플 데이터를 실제 계산 엔진으로 계산해 보여주지만, 모든 저장 동작은 DEMO_MODE를 반환하고 데이터베이스에 기록되지 않습니다.",
  },
  {
    name: "DIRECT_URL",
    requirement: "필수",
    effect:
      "마이그레이션용 직결 연결 문자열입니다. 없으면 풀러(pgBouncer) 연결만으로 DDL을 허용하지 않는 공급자에서 `npx prisma migrate deploy`가 실패합니다.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    requirement: "필수",
    effect:
      "인증 공급자가 없습니다. 데모 관리자 세션으로 동작하고, 로그인·회원가입 화면이 설정 오류를 안내하며, OAuth를 사용할 수 없습니다.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    requirement: "필수",
    effect: "위 항목과 동일합니다. URL과 키는 둘 다 있어야 인증이 활성화됩니다.",
  },
  {
    name: "OPENAI_API_KEY",
    requirement: "선택",
    effect:
      "서술형 텍스트가 계산 추적(trace)에서 결정론적으로 생성됩니다. 이상 탐지·예측·신뢰도 등 모든 수치 결과는 영향을 받지 않습니다.",
  },
  {
    name: "OPENAI_MODEL",
    requirement: "선택",
    effect: "기본값 gpt-4o-mini를 사용합니다.",
  },
  {
    name: "OPENAI_BASE_URL",
    requirement: "선택",
    effect:
      "기본값 https://api.openai.com/v1 을 사용합니다. Azure OpenAI나 사내 게이트웨이를 쓸 때만 지정합니다.",
  },
  {
    name: "OPENAI_ORGANIZATION",
    requirement: "선택",
    effect: "OpenAI-Organization 헤더를 보내지 않습니다.",
  },
  {
    name: "OPENAI_TIMEOUT_MS",
    requirement: "선택",
    effect: "LLM 요청 제한시간이 기본값 60,000ms로 적용됩니다.",
  },
  {
    name: "FIELD_ENCRYPTION_KEY",
    requirement: "선택",
    effect:
      "자격증명이 포함된 데이터 소스 등록이 실패합니다. AES-256-GCM 필드 암호화는 키가 없으면 평문 저장 대신 거부하도록 설계되어 있습니다.",
  },
  {
    name: "MAPBOX_ACCESS_TOKEN",
    requirement: "선택",
    effect: "조직(Organization) 화면이 인터랙티브 지도 대신 사업장 좌표 목록을 표시합니다.",
  },
  {
    name: "REDIS_URL",
    requirement: "선택",
    effect:
      "레이트리밋이 프로세스 내부에서만 동작하므로 서버 인스턴스마다 별도의 토큰 버킷을 갖습니다.",
  },
  {
    name: "SEED_ADMIN_PASSWORD",
    requirement: "선택",
    effect:
      "`npm run db:seed`가 문서화된 기본 비밀번호로 관리자 계정을 만들고 경고를 출력합니다. 시드 전에 지정하거나 시드 직후 비밀번호를 변경해야 합니다.",
  },
  {
    name: "API_RATE_LIMIT_PER_MINUTE",
    requirement: "선택",
    effect:
      "API 키 기본 한도가 분당 60회로 적용됩니다. `rate:unlimited` 스코프를 가진 키는 한도에서 제외됩니다.",
  },
];

/**
 * The twelve sections of the guide.
 *
 * Exported so `scripts/generate-setup-guide.test.ts` can assert the structure
 * without rendering a document.
 */
export function buildSections(): readonly GuideSection[] {
  return [
    {
      number: 1,
      title: "사전 준비 및 로컬 실행",
      summary:
        "외부 계정 없이 애플리케이션을 먼저 실행해, 어떤 화면이 이미 동작하는지 눈으로 확인합니다.",
      cost: "무료 (로컬 실행에는 어떤 유료 서비스도 필요하지 않습니다).",
      blocks: [
        {
          kind: "text",
          text: "이 시스템은 환경변수가 하나도 없어도 실행됩니다. 이때는 '데모 모드'로 동작하며, 18개 대시보드 화면의 모든 수치는 내장 샘플 데이터를 실제 계산 엔진(Scope 1/2/3 산정, SBTi 경로, 시나리오, MACC, 크레딧, 공시 매핑, MRV)으로 계산한 값입니다. 저장(쓰기) 동작만 거부됩니다.",
        },
        {
          kind: "steps",
          items: [
            "Node.js 22.22.2 이상(또는 24.15 이상)이 설치되어 있는지 `node -v`로 확인합니다. Next 16 자체의 최소 버전은 20.9이지만, @supabase/supabase-js가 22 이상을, 컴포넌트 테스트가 사용하는 jsdom 30이 22.22.2 이상을 요구합니다. Node 20에서는 `npm test`의 jsdom 테스트 9개 파일이 아예 실행되지 않습니다. 그래서 package.json의 engines 필드는 `^22.22.2 || ^24.15.0 || >=26.0.0`으로 선언되어 있습니다. 버전이 낮으면 https://nodejs.org 에서 LTS 22.x를 설치하십시오.",
            "저장소를 클론하고 의존성을 설치합니다. `npm ci`는 postinstall 단계에서 `prisma generate`를 자동으로 실행하며, 이 명령은 스키마만 읽고 DATABASE_URL을 해석하지 않으므로 환경변수 파일이 전혀 없어도 성공합니다.",
            "환경변수 파일은 이 단계에서 만들지 않아도 됩니다. 3절 이후 실제 값을 넣을 준비가 되면 `.env.example`을 `.env`로 복사하십시오. `.env.local`이 아니라 `.env`인 이유는 Next.js는 두 파일을 모두 읽지만 Prisma CLI는 `.env`만 읽기 때문입니다. DATABASE_URL을 `.env.local`에만 넣으면 `npx prisma migrate deploy`가 P1012 오류로 실패합니다.",
            "개발 서버를 실행하고 http://localhost:3000 을 엽니다. 로그인 없이 /dashboard 이하 화면을 볼 수 있습니다(데모 관리자 세션).",
            "화면 상단의 데모 모드 배너와 /settings 화면의 'Environment configuration' 패널에서 현재 어떤 의존성이 구성되었는지 확인합니다.",
            "코드 검증 명령을 순서대로 실행해 개발 환경이 정상인지 확인합니다.",
          ],
        },
        {
          kind: "text",
          text: "Windows에서 주의할 점: PowerShell 5.1(Windows 기본 버전)에는 `&&` 연산자가 없습니다. `npm ci && npm run dev`를 실행하면 \"'&&' 토큰은 이 버전에서 올바른 문 구분 기호가 아닙니다\" 오류가 발생하므로, 명령을 한 줄에 하나씩 실행하거나 `;`로 구분해 `npm ci; npm run dev`와 같이 입력하십시오. PowerShell 7 이상(pwsh)과 cmd.exe는 `&&`를 지원합니다.",
        },
        {
          kind: "code",
          lines: [
            "node -v",
            "npm -v",
            "git clone <저장소 URL>",
            "cd Carbon-Intelligence-Operating-System",
            "npm ci",
            "npm run dev",
            "",
            "# PowerShell 5.1에서 두 명령을 한 줄에 붙이려면 && 대신 ; 를 씁니다",
            "npm ci; npm run dev",
            "",
            "# 검증 명령",
            "npm run lint",
            "npm run typecheck",
            "npm test",
            "npm run build",
          ],
        },
        {
          kind: "text",
          text: "이후 2절부터 11절까지는 '데모 모드에서 벗어나 실제 운영에 쓰기 위해' 사용자가 직접 해야 하는 작업입니다. 각 절은 독립적으로 수행할 수 있으나, 3절(데이터베이스)이 가장 중요하며 나머지 기능의 전제가 됩니다.",
        },
      ],
      verification: [
        "`.env` 파일이 하나도 없는 상태에서 `npm ci`와 `npm run dev`가 모두 성공하고, http://localhost:3000/api/v1/health 응답의 database.configured 값이 false로 표시됩니다(= 데모 모드).",
        "`npm test`가 실패 없이 종료됩니다(1,444개 테스트, 73개 파일).",
        "`npm run build`가 성공하고 32개 라우트가 출력됩니다.",
        "http://localhost:3000/settings 의 'Dependencies configured' 카드가 현재 구성 수를 표시합니다.",
      ],
    },

    {
      number: 2,
      title: "Supabase 프로젝트 생성 · 인증 설정 · Storage 버킷",
      summary:
        "로그인, 회원가입, OAuth, 증빙 파일 저장을 담당하는 Supabase 프로젝트를 만들고 연결합니다.",
      cost:
        "Free 플랜 무료(조직당 프로젝트 2개, 데이터베이스 500MB, 7일 미사용 시 일시정지). 운영에는 Pro 플랜 월 25달러 + 사용량을 권장합니다.",
      blocks: [
        {
          kind: "steps",
          items: [
            "https://supabase.com/dashboard 에 접속해 조직을 만들고 'New project'를 선택합니다. 리전은 국내 사용자 기준 ap-northeast-2(서울)를 권장합니다. 생성 시 표시되는 데이터베이스 비밀번호는 다시 볼 수 없으므로 즉시 안전한 곳에 보관하십시오.",
            "Project Settings → API 화면에서 'Project URL'과 'anon public' 키를 복사해 `.env`의 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY에 넣습니다. service_role 키는 이 코드베이스에서 사용하지 않으므로 등록하지 마십시오.",
            "Authentication → Providers → Email을 활성화합니다. 'Confirm email'을 켜면 회원가입 후 확인 메일이 필요하며, 애플리케이션의 회원가입 화면은 이 상태를 안내하고 재발송 경로를 제공합니다.",
            "Authentication → URL Configuration에서 Site URL을 운영 도메인(예: https://cios.example.com)으로 지정하고, Redirect URLs에 `http://localhost:3000/auth/callback` 과 `https://<운영도메인>/auth/callback` 을 모두 추가합니다. 이 애플리케이션의 콜백 라우트 경로는 `/auth/callback` 입니다.",
            "Google OAuth: https://console.cloud.google.com 에서 프로젝트 생성 → 'OAuth 동의 화면' 구성 → '사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션)' 생성 → '승인된 리디렉션 URI'에 `https://<project-ref>.supabase.co/auth/v1/callback` 을 추가합니다. 발급된 클라이언트 ID/보안 비밀을 Supabase의 Authentication → Providers → Google에 입력하고 활성화합니다.",
            "Microsoft OAuth: https://portal.azure.com → Microsoft Entra ID → '앱 등록'에서 앱을 만들고 리디렉션 URI(웹)에 동일하게 `https://<project-ref>.supabase.co/auth/v1/callback` 을 등록합니다. '인증서 및 비밀'에서 클라이언트 비밀을 발급해 Supabase의 Providers → Azure에 애플리케이션(클라이언트) ID와 함께 입력합니다. 테넌트를 제한하려면 Azure 공급자 설정의 URL 항목에 테넌트 ID를 지정합니다.",
            "Storage → 'New bucket'으로 비공개 버킷 두 개를 만듭니다. `evidence`(검증 증빙 파일, AuditEvidence/EvidencePackage에서 참조), `reports`(생성된 공시 보고서 산출물). 두 버킷 모두 Public을 끄고, 정책은 authenticated 역할만 읽기/쓰기 가능하도록 설정합니다.",
            "MFA를 사용하려면 Authentication → Multi-Factor Authentication에서 TOTP를 활성화합니다(11절 접근권한 정책 참고).",
          ],
        },
        {
          kind: "text",
          text: "도메인이 확정되기 전에는 localhost 리디렉션만으로 로컬 테스트가 가능합니다. 8절에서 도메인을 연결한 뒤에는 Site URL, Redirect URLs, 그리고 Google·Microsoft 콘솔의 리디렉션 URI를 반드시 실제 도메인으로 갱신해야 합니다.",
        },
      ],
      verification: [
        "/login 화면에서 이메일로 회원가입하면 확인 메일이 도착하고, 확인 후 로그인에 성공합니다.",
        "Google·Microsoft 버튼으로 로그인하면 /auth/callback 을 거쳐 /dashboard로 이동합니다.",
        "/settings 화면의 Supabase 항목이 'configured'로 표시되고, 로그인·회원가입 화면의 '구성되지 않았습니다' 안내가 사라집니다.",
      ],
    },

    {
      number: 3,
      title: "PostgreSQL 프로비저닝 · pgvector 활성화 · 마이그레이션 · 시드",
      summary:
        "데이터베이스를 연결해 데모 모드에서 벗어나고, 148개 모델 스키마와 참조 데이터를 적재합니다.",
      cost:
        "Supabase Free 500MB 무료, Pro 월 25달러(8GB 포함). 자체 운영 시 AWS RDS db.t4g.medium 기준 월 60~80달러 수준입니다.",
      blocks: [
        {
          kind: "text",
          text: "중요: 개발 환경에는 접속 가능한 PostgreSQL 서버가 없었습니다. 따라서 모든 자동 검증은 목(mock) 처리된 Prisma 또는 데모 경로로 수행되었습니다. 데이터베이스를 프로비저닝한 뒤 사용자가 가장 먼저 실행해야 하는 작업은 `npx prisma migrate deploy`이고, 그다음이 `npm run db:seed`입니다.",
        },
        {
          kind: "steps",
          items: [
            "Supabase를 쓰는 경우: 프로젝트의 'Connect' 화면에서 두 개의 연결 문자열을 복사합니다. 포트 6543(pooled, pgbouncer)은 DATABASE_URL, 포트 5432(direct)는 DIRECT_URL에 넣습니다. 자체 PostgreSQL을 쓰는 경우 15 버전 이상을 준비하고 두 값에 같은 직결 문자열을 넣어도 됩니다.",
            "`.env`에 두 값을 등록합니다. 비밀번호에 특수문자가 있으면 URL 인코딩해야 합니다.",
            "pgvector 확장을 활성화합니다. Supabase는 Database → Extensions에서 `vector`를 검색해 Enable하고, 자체 PostgreSQL은 SQL로 `create extension if not exists vector;` 를 실행합니다. 현재 스키마에는 벡터 컬럼이 없고 시맨틱 검색은 미구현 항목이므로(12절 표 참고), 이 단계는 향후 확장을 위한 준비입니다.",
            "베이스라인 마이그레이션을 적용합니다. `prisma/migrations/0_init/migration.sql` 하나로 148개 모델의 테이블·인덱스·열거형이 생성됩니다. 이미 동일한 테이블이 존재하는 데이터베이스라면 `npx prisma migrate resolve --applied 0_init` 로 적용 표시만 남기십시오.",
            "참조 데이터와 데모 테넌트를 시드합니다. `npm run db:seed`는 멱등하게 작성되어 여러 번 실행해도 안전합니다. 시드 전에 SEED_ADMIN_PASSWORD를 지정하지 않으면 문서화된 기본 비밀번호가 사용되고 경고가 출력되므로, 반드시 지정하거나 시드 직후 변경하십시오.",
            "적재 결과를 확인합니다. `npx prisma studio`로 브라우저에서 테이블을 열거나, psql에서 `\\dt` 로 테이블 목록을 확인합니다.",
            "시드된 배출계수는 공개 출처(IPCC 2006 기본계수, US EPA, UK DEFRA/BEIS)만 포함합니다. 상용 데이터가 필요하면 9절을 진행하십시오.",
            "백업과 PITR을 활성화합니다(11절).",
          ],
        },
        {
          kind: "code",
          lines: [
            '# .env 예시 (Supabase)',
            'DATABASE_URL="postgresql://postgres.<project-ref>:<비밀번호>@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"',
            'DIRECT_URL="postgresql://postgres.<project-ref>:<비밀번호>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"',
            "",
            "# 스키마 적용 → 시드 → 상태 확인",
            "npx prisma migrate deploy",
            "SEED_ADMIN_PASSWORD='충분히 긴 비밀번호' npm run db:seed",
            "npx prisma migrate status",
          ],
        },
        {
          kind: "text",
          text: "스키마를 수정한 경우에는 `npx prisma migrate dev --name <변경명>`으로 새 마이그레이션을 생성하십시오. 저장소에 포함된 0_init 파일은 스키마와 바이트 단위로 일치하도록 CI에서 검사하므로, 스키마만 바꾸고 마이그레이션을 갱신하지 않으면 CI가 실패합니다.",
        },
      ],
      verification: [
        "`npx prisma migrate status`가 'Database schema is up to date!'를 출력합니다.",
        "`npm run dev` 후 화면 상단의 데모 모드 배너가 사라지고 /settings의 DATABASE_URL 항목이 'configured'로 표시됩니다.",
        "대시보드 수치가 시드된 데이터 기준으로 바뀌고, 저장 동작(예: 사업장 생성)이 DEMO_MODE 오류 없이 성공합니다.",
      ],
    },

    {
      number: 4,
      title: "OpenAI API 키 발급 · 모델 선택 · 사용량 한도",
      summary:
        "생성형 서술(설명문·요약문)을 실제 언어모델로 만들 때 필요합니다. 수치 계산에는 영향이 없습니다.",
      cost:
        "gpt-4o-mini 기준 입력 100만 토큰당 약 0.15달러, 출력 100만 토큰당 약 0.60달러(2025년 기준, 변동 가능). 일반적인 사용량이면 월 5~20달러 수준입니다. 키를 등록하지 않으면 비용은 0원입니다.",
      blocks: [
        {
          kind: "steps",
          items: [
            "https://platform.openai.com/api-keys 에서 'Create new secret key'로 키를 발급하고 `.env`의 OPENAI_API_KEY에 등록합니다. 키는 발급 시점에만 확인할 수 있습니다.",
            "모델을 선택합니다. 기본값은 gpt-4o-mini이며, 더 긴 서술 품질이 필요하면 OPENAI_MODEL에 gpt-4o 또는 추론 모델명을 지정합니다. 모델을 바꿔도 산정 결과는 달라지지 않습니다(수치는 통계 엔진이 계산).",
            "https://platform.openai.com/settings/organization/limits 에서 월 사용 한도(soft limit 알림, hard limit 차단)를 설정합니다. 예: soft 20달러, hard 50달러.",
            "Billing → Payment methods에 결제수단을 등록하고, 필요하면 선불(credit) 방식으로 상한을 고정합니다.",
            "조직 계정을 쓰는 경우 OPENAI_ORGANIZATION에 조직 ID를 등록합니다.",
            "Azure OpenAI 또는 사내 LLM 게이트웨이를 쓰는 경우 OPENAI_BASE_URL에 OpenAI 호환 엔드포인트를 지정합니다. 응답 지연이 큰 환경에서는 OPENAI_TIMEOUT_MS를 늘리십시오(기본 60,000ms).",
            "데이터 정책을 검토합니다. 프롬프트에는 계산 추적과 집계 수치가 포함되므로, 사내 규정상 외부 전송이 제한된다면 키를 등록하지 않고 결정론적 서술을 사용하는 편이 안전합니다.",
          ],
        },
      ],
      verification: [
        "/ai-engine 또는 /ai-agents 화면의 배지가 'Generative narrative via OpenAI (모델명)'으로 표시됩니다. 미설정 시에는 'Deterministic narrative (no OPENAI_API_KEY configured)'로 표시됩니다.",
        "/settings의 OPENAI_API_KEY 항목이 'configured'로 바뀝니다.",
        "OpenAI 대시보드의 Usage에 호출 기록이 나타납니다.",
      ],
    },

    {
      number: 5,
      title: "FIELD_ENCRYPTION_KEY 생성 및 키 관리",
      summary:
        "데이터 소스 자격증명, MFA 시크릿, MCP 서버 설정을 AES-256-GCM으로 암호화하기 위한 32바이트 키입니다.",
      cost: "무료입니다(외부 KMS를 쓰는 경우 KMS 요금만 발생).",
      blocks: [
        {
          kind: "steps",
          items: [
            "32바이트 난수를 16진수로 생성합니다. 아래 명령의 출력값(64자)을 그대로 사용합니다.",
            "`.env`의 FIELD_ENCRYPTION_KEY에 등록합니다. 운영 환경에서는 파일이 아니라 시크릿 저장소(Vercel Environment Variables, AWS Secrets Manager, GCP Secret Manager, Kubernetes Secret)에 보관하십시오.",
            "키를 분실하면 이미 암호화된 자격증명을 복호화할 수 없습니다. 오프라인 백업(봉인 문서 또는 KMS 백업)을 별도로 보관하십시오.",
            "키 회전이 필요하면 새 키를 발급하고 각 데이터 소스의 자격증명을 다시 등록하십시오. 기존 데이터를 새 키로 자동 재암호화하는 스크립트는 제공되지 않습니다(12절 표 참고).",
            "접근 권한을 제한합니다. 이 키는 애플리케이션 런타임과 배포 파이프라인만 읽을 수 있어야 하며, 개발자 로컬 환경에는 운영 키를 두지 마십시오.",
          ],
        },
        {
          kind: "code",
          lines: [
            'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
            "",
            "# .env",
            "FIELD_ENCRYPTION_KEY=<위 명령의 64자 출력>",
          ],
        },
      ],
      verification: [
        "데이터 소스 등록 폼에서 자격증명을 포함해 저장했을 때 오류 없이 성공합니다. 키가 없으면 암호화 키 부재 오류로 거부됩니다.",
        "데이터베이스의 DataSource.credentials 값이 평문이 아니라 암호문으로 저장되어 있습니다.",
        "/settings의 FIELD_ENCRYPTION_KEY 항목이 'configured'로 표시됩니다.",
      ],
    },

    {
      number: 6,
      title: "Mapbox 액세스 토큰",
      summary: "조직·사업장 화면에서 지도를 표시하기 위한 토큰입니다.",
      cost:
        "월 50,000회 맵 로드까지 무료, 초과분은 1,000회당 약 5달러(요금제 변동 가능). 미설정 시 비용 0원.",
      blocks: [
        {
          kind: "steps",
          items: [
            "https://account.mapbox.com 에서 계정을 만들고 Access tokens → 'Create a token'을 선택합니다.",
            "public 스코프(styles:read, fonts:read, datasets:read)만 부여하고 secret 스코프는 선택하지 않습니다.",
            "'URL restrictions'에 운영 도메인과 http://localhost:3000 을 등록해 토큰 도용을 막습니다.",
            "발급된 토큰을 `.env`의 MAPBOX_ACCESS_TOKEN에 등록합니다.",
            "지도가 의미를 갖도록 각 사업장(Facility)의 위도·경도를 입력합니다. 좌표가 없으면 지도에 표시할 지점이 없습니다.",
            "사용량 알림을 설정합니다(Mapbox 계정 → Billing → Usage alerts).",
          ],
        },
        {
          kind: "text",
          text: "지도 렌더링 컴포넌트 자체는 아직 인터랙티브 지도로 구현되어 있지 않습니다(12절 표 참고). 토큰을 등록하면 지도용 설정이 활성화되고, 미등록 시에는 사업장 좌표 목록이 표시됩니다.",
        },
      ],
      verification: [
        "/organization 화면에서 사업장 위치 영역이 좌표 목록 대신 지도 구성 상태로 전환됩니다.",
        "/settings의 MAPBOX_ACCESS_TOKEN 항목이 'configured'로 표시됩니다.",
      ],
    },

    {
      number: 7,
      title: "Redis (선택) 및 API 레이트리밋",
      summary:
        "여러 인스턴스로 확장할 때 API 레이트리밋 카운터를 공유하기 위한 선택 항목입니다.",
      cost:
        "Upstash 무료 티어는 일 10,000 커맨드까지 무료, 이후 종량제(요청 10만건당 약 0.2달러). AWS ElastiCache cache.t4g.micro는 월 15달러 내외.",
      blocks: [
        {
          kind: "steps",
          items: [
            "관리형 Redis를 준비합니다. 서버리스 환경(Vercel)에서는 https://upstash.com 의 Redis가 적합하고, 자체 인프라에서는 Redis 7 이상 또는 ElastiCache를 사용합니다.",
            "TLS 연결 문자열(rediss://...)을 `.env`의 REDIS_URL에 등록합니다.",
            "기본 분당 호출 한도를 API_RATE_LIMIT_PER_MINUTE로 조정합니다(미지정 시 60).",
            "특정 통합에 한도를 적용하지 않으려면 해당 API 키에 `rate:unlimited` 스코프를 부여합니다. API 키별 개별 한도는 현재 스키마에 컬럼이 없어 지원하지 않습니다(12절 표 참고).",
            "단일 인스턴스로만 운영한다면 이 절을 생략해도 무방합니다. 레이트리밋은 프로세스 내부 토큰 버킷으로 계속 동작합니다.",
          ],
        },
      ],
      verification: [
        "/api-gateway 화면의 레이트리밋 상태 영역에 현재 한도와 남은 횟수가 표시됩니다.",
        "인스턴스를 2개 이상 띄운 뒤 같은 API 키로 호출했을 때 카운터가 합산됩니다(Redis 미구성 시에는 인스턴스별로 따로 계산).",
        "한도 초과 시 응답이 429와 X-RateLimit-* 헤더를 반환합니다.",
      ],
    },

    {
      number: 8,
      title: "배포(Vercel 또는 Docker) · 환경변수 등록 · 도메인/DNS/SSL",
      summary: "운영 환경에 올리고, 도메인과 인증서를 연결합니다.",
      cost:
        "Vercel Hobby 무료 / Pro 사용자당 월 20달러. 컨테이너 호스팅(Cloud Run, Fly.io, ECS)은 소규모 기준 월 10~50달러. 도메인은 연 1.5만~3만원, SSL은 Let's Encrypt 사용 시 무료.",
      blocks: [
        {
          kind: "text",
          text: "방법 A — Vercel (권장, 가장 빠름)",
        },
        {
          kind: "steps",
          items: [
            "https://vercel.com/new 에서 저장소를 임포트합니다. Framework는 Next.js로 자동 인식되고 빌드 명령은 `npm run build`입니다. 설치 단계의 postinstall이 `prisma generate`를 실행합니다.",
            "Project Settings → Environment Variables에 이 문서 앞부분의 환경변수 표에 있는 값을 등록합니다. Production과 Preview를 분리해 서로 다른 데이터베이스를 쓰는 것을 권장합니다.",
            "마이그레이션은 빌드와 분리해 실행합니다. GitHub Actions 릴리스 잡이나 로컬에서 `DATABASE_URL=<운영> npx prisma migrate deploy` 를 배포 직전에 1회 실행하십시오. 빌드 명령에 넣으면 프리뷰 배포마다 운영 DB에 DDL이 실행될 위험이 있습니다.",
            "Deploy를 실행하고, 배포 로그에서 32개 라우트가 모두 동적(ƒ)으로 출력되는지 확인합니다.",
          ],
        },
        { kind: "text", text: "방법 B — Docker (사내 인프라, Kubernetes, Cloud Run)" },
        {
          kind: "steps",
          items: [
            "저장소 루트의 Dockerfile로 이미지를 빌드합니다. Next.js standalone 출력을 사용하고, 런타임은 node:22-alpine에서 비root 사용자(uid 1001)로 동작합니다.",
            "환경변수를 파일 또는 오케스트레이터 시크릿으로 주입해 컨테이너를 실행합니다. 포트는 3000이며 PORT/HOSTNAME 환경변수로 변경할 수 있습니다.",
            "배포 전 마이그레이션을 같은 이미지로 1회 실행합니다(prisma 디렉터리가 이미지에 포함되어 있습니다).",
            "헬스체크 엔드포인트로 `/api/v1/health` 를 등록합니다(Kubernetes readinessProbe, Cloud Run 기본 확인).",
          ],
        },
        {
          kind: "code",
          lines: [
            "docker build -t cios:latest .",
            "docker run --rm --env-file .env cios:latest npx prisma migrate deploy",
            "docker run -d -p 3000:3000 --env-file .env --name cios cios:latest",
            "curl -s http://localhost:3000/api/v1/health",
          ],
        },
        { kind: "text", text: "도메인 · DNS · SSL" },
        {
          kind: "steps",
          items: [
            "도메인을 등록기관(가비아, Cloudflare, Route 53 등)에서 취득합니다.",
            "Vercel의 경우 Project Settings → Domains에 도메인을 추가하고, 안내되는 A 레코드(또는 CNAME)를 DNS에 등록하면 인증서가 자동 발급·갱신됩니다.",
            "자체 호스팅의 경우 Nginx 또는 Caddy를 리버스 프록시로 두고 Let's Encrypt 인증서를 발급합니다. 예: `sudo certbot --nginx -d cios.example.com`. 갱신은 certbot 타이머로 자동화하십시오.",
            "HTTPS 강제, HSTS 헤더, 프록시의 X-Forwarded-* 전달을 설정합니다.",
            "도메인이 확정되면 2절의 Supabase Site URL·Redirect URLs와 Google·Microsoft 콘솔의 리디렉션 URI를 실제 도메인으로 갱신합니다. 이 단계를 빠뜨리면 OAuth 로그인이 실패합니다.",
          ],
        },
      ],
      verification: [
        "`https://<도메인>/api/v1/health` 가 200과 JSON 응답을 반환합니다.",
        "운영 도메인에서 로그인 후 /dashboard가 정상 표시되고, 데모 모드 배너가 없습니다.",
        "`npx prisma migrate status`(운영 DATABASE_URL 기준)가 up to date를 출력합니다.",
        "브라우저 주소창에 유효한 인증서(잠금 아이콘)가 표시됩니다.",
      ],
    },

    {
      number: 9,
      title: "유료 배출계수 데이터 라이선스",
      summary:
        "현재 시드에는 공개·재배포 가능한 계수만 들어 있습니다. Scope 3 LCA와 국가별 전력 계수는 상용 라이선스가 필요합니다.",
      cost:
        "무료 데이터(IPCC, DEFRA/BEIS, EPA, GIR)는 0원. ecoinvent는 조직 규모에 따라 연 CHF 3,000 이상, IEA 배출계수는 기관 라이선스 연 수천 유로, Sphera는 별도 견적입니다.",
      blocks: [
        {
          kind: "table",
          caption: "표 9-1. 배출계수 데이터셋별 비용과 취득 경로",
          headers: ["데이터셋", "제공기관", "유·무료", "취득 경로", "용도"],
          rows: [
            [
              "IPCC 2006 / 2019 Refinement 기본계수",
              "IPCC",
              "무료",
              "https://www.ipcc-nggip.iges.or.jp",
              "Scope 1 연소·공정 기본계수 (현재 시드에 사용)",
            ],
            [
              "UK GHG conversion factors (DEFRA/BEIS/DESNZ)",
              "영국 정부",
              "무료(공공 라이선스)",
              "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
              "연료·운송·폐기물·출장 계수",
            ],
            [
              "GHG Emission Factors Hub, eGRID",
              "US EPA",
              "무료",
              "https://www.epa.gov/climateleadership/ghg-emission-factors-hub, https://www.epa.gov/egrid",
              "미국 전력 그리드(Scope 2) 계수",
            ],
            [
              "국가 온실가스 배출계수 · 전력 배출계수",
              "환경부 / 온실가스종합정보센터(GIR)",
              "무료",
              "http://www.gir.go.kr",
              "국내 배출권거래제 산정용 공식 계수",
            ],
            [
              "Emission Factors (연간 데이터셋)",
              "IEA",
              "유료 구독",
              "https://www.iea.org/data-and-statistics/data-product/emissions-factors-2024",
              "국가별 전력·열 계수(한국 포함) 시계열",
            ],
            [
              "ecoinvent v3",
              "ecoinvent 협회",
              "유료 라이선스",
              "https://ecoinvent.org/licences",
              "Scope 3 카테고리 1·2·4 등 LCA 기반 계수",
            ],
            [
              "Managed LCA Content (GaBi)",
              "Sphera",
              "유료(견적)",
              "https://sphera.com",
              "제품 단위 LCA, 사용 단계(카테고리 11)",
            ],
            [
              "EXIOBASE / USEEIO 지출기반 계수",
              "EXIOBASE 컨소시엄 / US EPA",
              "무료(일부 상용판 유료)",
              "https://www.exiobase.eu",
              "Scope 3 지출(spend-based) 산정",
            ],
          ],
        },
        {
          kind: "steps",
          items: [
            "필요한 범위를 먼저 확정합니다. Scope 1·2만 산정한다면 무료 데이터로 충분한 경우가 많고, Scope 3 카테고리 1(구매 제품·서비스)을 활동 기반으로 산정하려면 ecoinvent급 LCA 데이터가 필요합니다.",
            "구매·라이선스 계약을 체결하고 데이터 파일(CSV/Excel/API)을 수령합니다. 대부분의 상용 라이선스는 재배포를 금지하므로 저장소에 커밋하지 말고 운영 데이터베이스에만 적재하십시오.",
            "/emission-factors 화면 또는 `POST /api/v1/emission-factors` API로 계수를 등록합니다. 등록 시 출처(EmissionFactorSource: publisher, url, version)와 유효기간(validFrom/validTo), 지역·국가·업종 범위를 반드시 채우십시오.",
            "계수 해석 엔진은 특이성 순위(조직 고유 > 공급자 고유 > 국가 > 지역 > 전역)와 유효기간으로 계수를 자동 선택하고 선택 근거를 남깁니다. 따라서 상용 계수를 등록하면 기존 기본계수보다 우선 적용됩니다.",
            "계수 갱신 주기를 정합니다(전력 계수는 통상 연 1회 갱신). 기존 계수는 삭제하지 말고 supersede(대체) 처리해 과거 산정 결과의 재현성을 유지하십시오.",
          ],
        },
      ],
      verification: [
        "/emission-factors 화면의 해석(explain) 패널에서 특정 활동에 대해 새로 등록한 라이선스 계수가 선택되고, 선택 근거에 해당 출처가 표시됩니다.",
        "과거 연도 산정을 재실행했을 때 그 시점에 유효한 계수가 사용되어 결과가 변하지 않습니다.",
        "라이선스 문서와 등록된 EmissionFactorSource의 publisher·version이 일치합니다.",
      ],
    },

    {
      number: 10,
      title: "법적 · 검증 절차",
      summary:
        "시스템은 산정·증빙·응답 생성까지 지원합니다. 검증기관 선정, 제출, 법적 대상 판단은 사용자가 수행해야 합니다.",
      cost:
        "제3자 검증 연 1,500만~5,000만원(사업장 수·Scope 3 범위에 따라). SBTi 목표 검증 수수료 9,500달러 이상(중소기업 경로는 무료 또는 1,250달러). CDP 응답 수수료 별도. 법률·회계 자문 비용 별도.",
      blocks: [
        {
          kind: "text",
          text: "이 문서와 시스템은 법률·회계 자문이 아닙니다. 공시 의무 대상 여부와 제출 기한은 반드시 자체 법률 검토를 받으십시오.",
        },
        {
          kind: "steps",
          items: [
            "조직 경계와 연결 방식을 확정합니다. /settings에서 consolidation approach(운영통제·재무통제·지분율)와 회계연도 시작월, GWP 버전을 조직 정책과 일치시키고 내부 승인 문서를 남기십시오.",
            "기준연도(baseline year)를 승인받습니다. SBTi는 통상 최근 연도를 기준으로 요구하며, 기준연도 재산정 정책(구조 변화 시)도 함께 문서화해야 합니다.",
            "제3자 검증기관을 선정합니다. 국내는 환경부 지정 검증기관·KOLAS 인정기관, 국제는 DNV·SGS·Bureau Veritas·TÜV·LRQA 등이 있습니다. 견적 요청 시 사업장 수, 대상 Scope, 검증 수준(합리적/제한적 확신), 희망 일정을 제시하십시오.",
            "ISO 14064-3 기반 검증을 진행합니다. 검증 계획 → 표본 추출 → 현장 실사 → 발견사항 조치 → 검증의견서 발급 순으로 진행되며, /verification 화면의 engagement·finding·corrective action·evidence package(SHA-256 해시)로 관리합니다. 중요성 기준(기본 5%)에 따라 의견 유형(적정·한정·부적정)이 자동 판정됩니다.",
            "SBTi 목표를 제출합니다. https://sciencebasedtargets.org 에서 commitment letter 제출 후 24개월 내에 목표를 산정·제출해야 합니다. /ai-roadmap의 절대감축 경로(1.5°C, 연 4.2%)와 Scope 3 포함 기준(총배출의 40% 초과 시 포함 필수) 검증 결과를 근거 자료로 사용하십시오.",
            "CDP 응답을 준비합니다. 통상 매년 4월경 질문서가 공개되고 6~9월에 마감됩니다. /esg-disclosure에서 프레임워크별 응답을 자동 채운 뒤 CDP 포털(https://www.cdp.net)에 업로드하고, 미응답 필수 항목 목록을 반드시 0으로 만드십시오.",
            "CSRD/ESRS E1 대상 여부를 법률 검토합니다. 대상이면 지속가능성 보고서에 디지털 태깅(XBRL)과 제한적 확신 감사가 필요하며, 이중 중대성 평가 결과를 문서화해야 합니다.",
            "ISSB(IFRS S1·S2) 및 국내 지속가능성 공시기준(KSSB) 도입 일정에 맞춰 재무보고와 동일 시점 공시를 준비합니다.",
            "국내 배출권거래제(K-ETS) 해당 여부를 확인합니다. 할당대상업체는 매년 3월 31일까지 명세서를 제출하고(검증보고서 첨부), 6월 30일까지 배출권을 제출해야 합니다. /carbon-finance의 ETS 포지션(할당·검증·제출)으로 잉여·부족과 준수 비용을 산정할 수 있습니다.",
            "감사·검증 대응 문서를 보존합니다(11절 감사 로그 보존 참고).",
          ],
        },
      ],
      verification: [
        "검증기관과 체결한 계약서와 발급받은 검증의견서를 보유하고, /verification의 engagement 상태가 완료로 기록됩니다.",
        "SBTi 목표가 승인되어 공개 목록에 등재됩니다.",
        "CDP 제출 완료 확인 메일과 응답 사본을 보유합니다.",
        "K-ETS 명세서 접수증과 배출권 제출 확인서를 보유합니다.",
      ],
    },

    {
      number: 11,
      title: "운영 항목 — 백업 · 모니터링 · 감사 로그 보존 · 접근권한",
      summary: "검증 가능한 배출량 데이터를 유지하려면 운영 절차가 시스템 기능만큼 중요합니다.",
      cost:
        "Supabase PITR 추가 요금(월 100달러 수준부터), 외부 모니터링 무료~월 10달러, 로그·백업 오브젝트 스토리지 월 수달러.",
      blocks: [
        { kind: "text", text: "백업" },
        {
          kind: "steps",
          items: [
            "관리형 데이터베이스는 자동 일일 백업을 활성화하고, 가능하면 PITR(특정 시점 복구)을 켭니다.",
            "자체 운영은 `pg_dump`를 일 1회 이상 수행하고 결과를 다른 리전의 오브젝트 스토리지에 보관합니다. 보관 기간은 최소 1년을 권장합니다.",
            "반기 1회 복구 훈련을 수행하고 결과를 기록합니다. 복구해 본 적 없는 백업은 백업이 아닙니다.",
            "Storage 버킷(증빙 파일)도 백업 대상에 포함하십시오.",
          ],
        },
        {
          kind: "code",
          lines: [
            "pg_dump \"$DIRECT_URL\" -Fc -f cios-$(date +%Y%m%d).dump",
            "aws s3 cp cios-$(date +%Y%m%d).dump s3://<백업버킷>/cios/",
            "# 복구 훈련",
            "pg_restore -d \"$STAGING_URL\" --clean --if-exists cios-<날짜>.dump",
          ],
        },
        { kind: "text", text: "모니터링" },
        {
          kind: "bullets",
          items: [
            "`/api/v1/health` 를 외부 모니터링(UptimeRobot, Better Stack 등)에서 5분 간격으로 점검하고 알림 수신자를 지정합니다.",
            "애플리케이션 로그(Vercel Logs 또는 컨테이너 로그)를 수집 도구로 보내고, 오류율 급증 알림을 설정합니다.",
            "데이터베이스 연결 수, 쿼리 지연, 저장공간 사용률에 임계값 알림을 설정합니다.",
            "LLM 토큰 사용량과 비용은 AgentExecution 기록으로 추적할 수 있습니다. OpenAI 측 사용 한도(4절)와 함께 이중으로 관리하십시오.",
            "알림을 이메일·Slack으로 자동 발송하는 채널 연동은 아직 구현되어 있지 않습니다(12절 표 참고).",
          ],
        },
        { kind: "text", text: "감사 로그 보존" },
        {
          kind: "bullets",
          items: [
            "AuditTrail·AuditEvidence·EvidencePackage는 검증과 규제 대응의 근거이므로 최소 5년 보존을 권장합니다(국내 배출권거래제 관련 서류 보존 5년, EU 관행은 10년).",
            "증빙 파일 해시(SHA-256)는 원본 파일과 함께 보존해야 무결성 증명이 가능합니다.",
            "보존 기간이 지난 로그의 아카이브·삭제를 자동화하는 배치 잡은 제공되지 않습니다. 파티셔닝 또는 정기 export 스크립트를 운영 측에서 마련하십시오.",
            "개인정보가 포함된 필드(사용자 이메일 등)는 사내 개인정보 처리방침의 보존·파기 기준을 함께 적용하십시오.",
          ],
        },
        { kind: "text", text: "접근권한 정책" },
        {
          kind: "bullets",
          items: [
            "/security 화면에서 역할(Role), 권한(Permission), 접근정책(AccessPolicy)을 조직 구조에 맞게 설정하고 최소권한 원칙을 적용합니다.",
            "API 키는 필요한 스코프만 부여하고 90일 주기로 회전합니다. 폐기된 키는 즉시 revoke 처리하십시오.",
            "퇴직·직무 변경 시 세션을 즉시 폐기하고 역할 배정을 회수합니다.",
            "관리자 계정은 MFA를 필수화합니다(2절 Supabase MFA 설정).",
            "DB 비밀번호와 FIELD_ENCRYPTION_KEY 등 시크릿은 시크릿 매니저에만 보관하고 회전 절차를 문서화합니다.",
          ],
        },
      ],
      verification: [
        "백업 파일이 매일 생성되고 있으며, 최근 복구 훈련 기록이 남아 있습니다.",
        "헬스체크 실패 시 알림이 실제로 수신되는지 테스트로 확인했습니다.",
        "/security의 감사 로그에 로그인·권한 변경·데이터 수정 이력이 기록됩니다.",
        "API 키 목록에 만료·회전 일정이 관리되고 있습니다.",
      ],
    },

    {
      number: 12,
      title: "테스트 계정 및 신규 기능 안내",
      summary:
        "Supabase 미구성 시 자동으로 활성화되는 내장 테스트 계정과, 이번 업데이트에서 추가된 기능을 설명합니다.",
      cost: "무료 (내장 기능입니다).",
      blocks: [
        {
          kind: "text",
          text: "내장 테스트/데모 계정: Supabase가 구성되지 않으면 아래 계정으로 자동 로그인됩니다.",
        },
        {
          kind: "table",
          caption: "표 12-1. 테스트 계정 정보",
          headers: ["항목", "값"],
          rows: [
            ["이메일", "admin@example.com"],
            ["이름", "데모 관리자"],
            ["역할", "조직 관리자 (전체 권한)"],
            ["비밀번호", "불필요 — 자동 세션 부여"],
          ],
        },
        {
          kind: "text",
          text: "이번 업데이트에서 추가된 기능:",
        },
        {
          kind: "bullets",
          items: [
            "XLSX/PDF/DOCX 실제 파일 내보내기: GET /api/reports/:id/export?format=xlsx|pdf|docx",
            "증거 파일 업로드: POST /api/evidence (Supabase Storage 연동, 미구성 시 안내 메시지 반환)",
            "기간 마감/잠금 + 승인 워크플로: 잠긴 기간에는 PERIOD_LOCKED 에러로 변경이 차단됩니다.",
            "접근성 개선: 스킵 링크, 모바일 드로어, axe-core 기반 자동 검증",
            "i18n 안티 드리프트 게이트: 딕셔너리 키 동기화, 액션 메시지 한국어 커버리지, UI 복사 드리프트 탐지",
          ],
        },
      ],
      verification: [
        "로그인 화면에서 '테스트 계정' 패널이 표시되고, '대시보드로 이동' 버튼이 동작합니다.",
        "ESG 공시 화면에서 XLSX/PDF/DOCX 다운로드가 실제 파일을 생성합니다.",
      ],
    },

    {
      number: 13,
      title: "미구현 · 외부 의존 기능 목록",
      summary:
        "현재 코드베이스에서 완료되지 않았거나 사용자의 계정·데이터·절차가 있어야 완성되는 항목을 모두 밝힙니다.",
      cost:
        "항목별로 다릅니다. 개발이 필요한 항목은 개발 공수, 데이터·서비스가 필요한 항목은 앞선 절의 비용을 참고하십시오.",
      blocks: [
        {
          kind: "table",
          caption: "표 12-1. 미구현 및 외부 의존 항목",
          headers: ["기능", "현재 상태", "사용자가 해야 할 일"],
          rows: [
            [
              "CSV 활동자료 일괄 등록(커밋)",
              "업로드·컬럼 매핑·미리보기까지 동작하지만 저장을 수행하는 서버 액션(importActivityDataAction)이 없어 커밋 버튼이 비활성 상태입니다.",
              "대량 등록이 필요하면 해당 서버 액션을 구현하거나, 그 전까지는 `POST /api/v1/activity-data` API로 스크립트 적재를 사용하십시오.",
            ],
            [
              "알림 발송",
              "알림 설정(NotificationPreference) 저장만 동작하며, 이메일·Slack 등 실제 발송 채널이 연결되어 있지 않습니다.",
              "메일 공급자(Resend, SES 등) 또는 Slack Webhook을 선택해 발송 어댑터를 구현하고 자격증명을 등록하십시오.",
            ],
            [
              "한국어 UI",
              "완료. 전체 UI가 한국어를 기본값으로 사용하며, 설정에서 영문으로 전환할 수 있습니다. 딕셔너리 기반 i18n이 모든 페이지에 적용되어 있습니다.",
              "추가 문구가 필요하면 src/lib/i18n/dictionaries/{ko,en}.ts에 키를 추가하십시오.",
            ],
            [
              "API 키별 개별 레이트리밋",
              "완료. APIKey 모델에 rateLimit 컬럼이 추가되어 키별 개별 한도를 설정할 수 있습니다.",
              "관리자 화면에서 키 생성 시 rateLimit 값을 지정하거나, 기본값(API_RATE_LIMIT_PER_MINUTE)을 사용하십시오.",
            ],
            [
              "인터랙티브 지도",
              "Mapbox 토큰이 없으면 사업장 좌표 목록으로 대체되며, 지도 컴포넌트 자체도 아직 정적 대체 화면입니다.",
              "6절에서 토큰을 발급하고 사업장 좌표를 입력하십시오. 완전한 지도 UI가 필요하면 mapbox-gl 컴포넌트를 추가 구현해야 합니다.",
            ],
            [
              "pgvector 시맨틱 검색",
              "확장은 문서화·선언되어 있으나 벡터 컬럼과 임베딩 파이프라인은 사용하지 않습니다.",
              "필요하면 임베딩 컬럼을 추가하고 임베딩 생성 배치를 구현하십시오(OpenAI embeddings 비용이 추가됩니다).",
            ],
            [
              "검증 발견사항의 오기재 금액",
              "VerificationFinding에 금액 컬럼이 없어 description에 `[misstatement:금액]` 마커로 인코딩합니다.",
              "정식 컬럼이 필요하면 스키마를 확장하십시오. 그때까지는 마커 형식을 유지해야 중요성 판정이 정상 동작합니다.",
            ],
            [
              "실제 데이터베이스 대상 실행 검증",
              "개발 환경에 접속 가능한 PostgreSQL이 없어 모든 자동 검증은 목 처리된 Prisma 또는 데모 경로로 수행되었습니다.",
              "3절 순서대로 `npx prisma migrate deploy`와 `npm run db:seed`를 실행한 뒤, 주요 화면과 API를 1회 수동 점검하십시오.",
            ],
            [
              "상용 배출계수 데이터",
              "공개·재배포 가능한 계수(IPCC, EPA, DEFRA)만 시드되어 있습니다.",
              "9절 표를 참고해 필요한 라이선스를 구매하고 계수를 등록하십시오.",
            ],
            [
              "제3자 검증 · 공시 제출",
              "시스템은 산정, 증빙 패키지, 프레임워크 응답 생성까지 지원합니다.",
              "10절 절차에 따라 검증기관을 선정하고 SBTi·CDP·CSRD·K-ETS 제출을 직접 수행하십시오.",
            ],
            [
              "필드 암호화 키 회전 자동화",
              "AES-256-GCM 암·복호화는 동작하지만 기존 데이터를 새 키로 재암호화하는 스크립트가 없습니다.",
              "키를 교체할 때는 해당 자격증명을 다시 등록하거나 재암호화 스크립트를 작성하십시오(5절).",
            ],
            [
              "감사 로그 아카이브 자동화",
              "감사 로그는 계속 축적되며 보존기간 경과분을 자동 아카이브·삭제하지 않습니다.",
              "11절 보존 기준에 맞춰 파티셔닝 또는 정기 export·삭제 배치를 운영 측에서 구성하십시오.",
            ],
          ],
        },
      ],
      verification: [
        "각 행의 '사용자가 해야 할 일'을 사내 백로그에 등록하고 담당자와 기한을 지정했습니다.",
        "운영 개시 전에 최소한 '실제 데이터베이스 대상 실행 검증'과 '상용 배출계수 데이터' 항목의 판단이 완료되었습니다.",
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// docx rendering
// ---------------------------------------------------------------------------

function bodyParagraph(text: string, options: { readonly bold?: boolean } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    children: [new TextRun({ text, bold: options.bold ?? false })],
  });
}

function labelParagraph(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true })],
  });
}

function numberedParagraph(index: number, text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 100, line: 300 },
    indent: { left: 360, hanging: 360 },
    children: [new TextRun({ text: `${index}. ` , bold: true }), new TextRun({ text })],
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 100, line: 300 },
    indent: { left: 360, hanging: 240 },
    children: [new TextRun({ text: "· " }), new TextRun({ text })],
  });
}

function codeParagraph(line: string): Paragraph {
  return new Paragraph({
    spacing: { after: 0, line: 260 },
    indent: { left: 240 },
    shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
    children: [new TextRun({ text: line.length === 0 ? " " : line, font: MONO_FONT, size: 18 })],
  });
}

function tableCell(text: string, options: { readonly header?: boolean } = {}): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.TOP,
    shading: options.header === true
      ? { type: ShadingType.CLEAR, fill: "E7E6E6" }
      : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        spacing: { after: 0, line: 260 },
        children: [new TextRun({ text, bold: options.header ?? false, size: 18 })],
      }),
    ],
  });
}

function renderTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((header) => tableCell(header, { header: true })),
      }),
      ...rows.map(
        (row) => new TableRow({ children: row.map((cell) => tableCell(cell)) }),
      ),
    ],
  });
}

function renderBlock(block: GuideBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case "text":
      return [bodyParagraph(block.text)];
    case "steps":
      return block.items.map((item, index) => numberedParagraph(index + 1, item));
    case "bullets":
      return block.items.map((item) => bulletParagraph(item));
    case "code":
      return [
        ...block.lines.map((line) => codeParagraph(line)),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    case "table":
      return [
        ...(block.caption === undefined ? [] : [bodyParagraph(block.caption, { bold: true })]),
        renderTable(block.headers, block.rows),
        new Paragraph({ spacing: { after: 160 }, children: [] }),
      ];
  }
}

function renderSection(section: GuideSection): (Paragraph | Table)[] {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 320, after: 140 },
      children: [new TextRun({ text: `${section.number}. ${section.title}`, bold: true })],
    }),
    bodyParagraph(section.summary),
    ...section.blocks.flatMap((block) => renderBlock(block)),
    labelParagraph("예상 비용"),
    bodyParagraph(section.cost),
    labelParagraph("완료 확인 방법"),
    ...section.verification.map((item) => bulletParagraph(item)),
  ];
}

/** The whole document, ready for `Packer`. */
export function buildDocument(sections: readonly GuideSection[]): Document {
  return new Document({
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: 21 } },
        title: { run: { font: BODY_FONT, size: 40, bold: true } },
        heading1: { run: { font: BODY_FONT, size: 28, bold: true, color: "1F3864" } },
        heading2: { run: { font: BODY_FONT, size: 23, bold: true, color: "2E5496" } },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [new TextRun({ text: "CIOS 직접 설정 가이드", bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 320 },
            children: [
              new TextRun({
                text: "탄소 인텔리전스 운영 시스템 — 사용자가 직접 수행해야 하는 작업 정리",
                size: 24,
              }),
            ],
          }),

          labelParagraph("이 문서의 목적"),
          bodyParagraph(
            "이 시스템의 계산·검증·공시 로직은 코드로 구현되어 있고 테스트로 검증되어 있습니다. 그러나 데이터베이스, 인증 공급자, 언어모델, 유료 배출계수 데이터, 제3자 검증, 규제 제출은 사용자의 계정·비용·법적 판단이 필요하므로 개발 단계에서 대신 수행할 수 없습니다. 이 문서는 그 경계를 명확히 하고, 사용자가 해야 하는 작업을 실행 가능한 순서와 명령까지 정리한 인수 문서입니다.",
          ),
          bodyParagraph(
            "개발 환경에는 접속 가능한 PostgreSQL 서버, Supabase 프로젝트, OpenAI 키, Mapbox 토큰이 없었습니다. 따라서 모든 자동 검증은 목(mock) 처리된 Prisma 또는 데모 경로로 수행되었습니다. 데이터베이스를 준비한 뒤 가장 먼저 실행해야 하는 작업은 `npx prisma migrate deploy`이며, 이어서 `npm run db:seed`를 실행하십시오(3절).",
          ),
          bodyParagraph(
            "각 절은 '절차(번호별 단계) → 예상 비용 → 완료 확인 방법' 순으로 구성되어 있습니다. 완료 확인 방법을 통과하지 못하면 그 절은 끝난 것이 아닙니다.",
          ),

          labelParagraph("현재 상태 요약"),
          bodyParagraph(
            "환경변수를 하나도 설정하지 않아도 애플리케이션은 실행됩니다. 이 '데모 모드'에서 18개 대시보드 화면의 모든 수치는 내장 샘플 데이터를 실제 계산 엔진으로 계산한 값이며, 저장(쓰기) 동작만 거부됩니다. 즉, 지금 화면에 보이는 숫자는 하드코딩된 값이 아니라 계산된 값이고, 데이터베이스를 연결하는 즉시 같은 엔진이 실제 데이터를 계산합니다.",
          ),

          labelParagraph("환경변수 요약"),
          bodyParagraph(
            "표 0-1은 코드가 실제로 읽는 모든 환경변수와, 설정하지 않았을 때 무엇이 동작하지 않는지를 정리한 것입니다. 저장소의 `.env.example`과 애플리케이션의 /settings 화면이 동일한 내용을 표시합니다.",
          ),
          bodyParagraph("표 0-1. 환경변수와 미설정 시 영향", { bold: true }),
          renderTable(
            ["환경변수", "필수 여부", "설정하지 않으면"],
            ENV_TABLE.map((entry) => [entry.name, entry.requirement, entry.effect]),
          ),
          new Paragraph({ spacing: { after: 240 }, children: [] }),

          labelParagraph("목차"),
          new TableOfContents("목차", { hyperlink: true, headingStyleRange: "1-1" }),

          ...sections.flatMap((section) => renderSection(section)),

          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 360, after: 140 },
            children: [new TextRun({ text: "부록. 문서 재생성 방법", bold: true })],
          }),
          bodyParagraph(
            "이 문서는 손으로 작성한 파일이 아니라 `scripts/generate-setup-guide.ts`가 생성합니다. 내용이 바뀌어야 하면 스크립트를 수정하고 아래 명령으로 다시 생성하십시오. 코드 리뷰에서 문서 변경 내역을 추적할 수 있게 하려는 의도입니다.",
          ),
          codeParagraph("npm run docs:setup-guide"),
        ],
      },
    ],
  });
}

async function main(): Promise<void> {
  const outputPath = resolve(process.cwd(), OUTPUT_PATH);
  mkdirSync(dirname(outputPath), { recursive: true });

  const sections = buildSections();
  const buffer = await Packer.toBuffer(buildDocument(sections));
  writeFileSync(outputPath, buffer);

  console.log(
    `Wrote ${join(OUTPUT_PATH)} — ${sections.length} sections, ${ENV_TABLE.length} environment variables, ${buffer.length.toLocaleString()} bytes.`,
  );
}

// Only write the file when invoked as a script; importing the module (from the
// test) must have no side effects.
const invokedDirectly = (process.argv[1] ?? "").endsWith("generate-setup-guide.ts");
if (invokedDirectly) {
  void main().catch((error: unknown) => {
    console.error("Failed to generate the setup guide:", error);
    process.exit(1);
  });
}
