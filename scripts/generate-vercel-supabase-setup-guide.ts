/**
 * Generates `docs/CIOS-Vercel-Supabase-설정-가이드.docx` — a step-by-step,
 * hands-on setup guide for running CIOS on Vercel + Supabase only, following
 * the conclusions of docs/Vercel-Supabase-전용-구성-검토.docx.
 *
 * Unlike that review (which only judges feasibility), this document is meant
 * to be followed top to bottom: every section is "무엇을 · 왜 · 어떻게" with
 * exact dashboard paths, CLI commands and copy-pasteable SQL where the user
 * can act without a developer, and a clearly labelled "코드 작업 필요" note
 * where the step needs an application code change against a seam this
 * codebase already exposes (getObjectStorageClient, getRateLimiter, the LLM
 * client factory).
 *
 * Written as a generator, same convention as the other docs/*.docx scripts,
 * so it stays reviewable in git and can be regenerated when facts change.
 *
 * Run with: npx tsx scripts/generate-vercel-supabase-setup-guide.ts
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

export const OUTPUT_PATH = "docs/CIOS-Vercel-Supabase-설정-가이드.docx";

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
  | { readonly kind: "note"; readonly text: string }
  | {
      readonly kind: "table";
      readonly caption?: string;
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

export type GuideSection = {
  readonly number: string;
  readonly title: string;
  readonly purpose: string;
  readonly cost: string;
  readonly optional: boolean;
  readonly blocks: readonly GuideBlock[];
  readonly verification: readonly string[];
};

export function buildSections(): readonly GuideSection[] {
  return [
    {
      number: "1",
      title: "준비물 확인",
      purpose: "이후 모든 단계에서 필요한 계정과 도구를 미리 갖춥니다.",
      cost: "무료 (계정 생성 자체는 비용이 없습니다).",
      optional: false,
      blocks: [
        {
          kind: "steps",
          items: [
            "Vercel 계정을 만듭니다 — https://vercel.com/signup (GitHub 계정으로 가입하면 이후 배포 연동이 가장 간단합니다).",
            "Supabase 계정을 만듭니다 — https://supabase.com/dashboard (역시 GitHub 계정 사용을 권장합니다).",
            "이 저장소를 본인의 GitHub 계정(또는 조직)으로 옮기거나 최소한 접근 권한을 확보합니다. Vercel이 배포할 때 이 저장소를 직접 연결합니다.",
            "Node.js 22 이상을 설치합니다 — https://nodejs.org 에서 LTS 버전을 받습니다.",
            "Vercel CLI를 전역 설치합니다.",
            "Supabase CLI를 설치합니다(SSO 설정 등 일부 단계에서 필요합니다).",
          ],
        },
        {
          kind: "code",
          lines: [
            "npm i -g vercel",
            "vercel --version",
            "",
            "# Supabase CLI (Windows는 Scoop 권장, 다른 방법은 공식 문서 참고)",
            "# https://supabase.com/docs/guides/local-development/cli/getting-started",
            "scoop install supabase",
            "supabase --version",
          ],
        },
        {
          kind: "note",
          text: "이 문서는 순서대로 진행하도록 구성되어 있습니다. 2~6절(Supabase 프로젝트·데이터베이스·인증·저장소·RLS)을 먼저 끝내고, 8절(Vercel 연결)로 넘어가는 순서를 권장합니다.",
        },
      ],
      verification: ["`vercel --version`과 `supabase --version` 명령이 오류 없이 버전을 출력합니다."],
    },

    {
      number: "2",
      title: "Supabase 프로젝트 생성",
      purpose: "데이터베이스, 인증, 파일 저장소를 모두 이 프로젝트 하나가 담당합니다.",
      cost: "Free 플랜 무료(프로젝트 2개, DB 500MB, 7일 미사용 시 일시정지). 운영에는 Pro 플랜 월 25달러를 권장합니다 — 7절(SSO)과 14절(PITR 백업)은 Pro 플랜이 필요합니다.",
      optional: false,
      blocks: [
        {
          kind: "steps",
          items: [
            "https://supabase.com/dashboard 에서 'New project'를 클릭합니다.",
            "조직(Organization)을 만들거나 선택하고, 프로젝트 이름(예: cios-production)을 입력합니다.",
            "리전은 국내 사용자 기준 'Northeast Asia (Seoul)'을 선택합니다.",
            "데이터베이스 비밀번호를 생성합니다 — 이 화면을 벗어나면 다시 볼 수 없으니 비밀번호 관리자에 즉시 저장하십시오.",
            "'Create new project'를 눌러 프로비저닝을 시작합니다(1~2분 소요).",
            "생성이 끝나면 좌측 메뉴 Project Settings → API 화면에서 'Project URL'과 'anon public' 키를 복사해 안전한 곳에 메모합니다. 이 두 값은 6절에서 Vercel 환경변수로 등록합니다.",
          ],
        },
        {
          kind: "note",
          text: "service_role 키는 이 코드베이스가 사용하지 않으므로 어디에도 등록하지 마십시오. 노출되면 즉시 재발급(Project Settings → API → Reset)하십시오.",
        },
      ],
      verification: ["Supabase 대시보드에서 프로젝트 상태가 'Active'로 표시됩니다."],
    },

    {
      number: "3",
      title: "데이터베이스 연결 · 마이그레이션 · 시드",
      purpose: "코드가 이미 알고 있는 테이블 구조를 실제 데이터베이스에 만들고, 기본 데이터를 채웁니다.",
      cost: "2절의 Supabase 플랜에 포함됩니다.",
      optional: false,
      blocks: [
        {
          kind: "steps",
          items: [
            "Supabase 대시보드의 Project Settings → Database → Connection string에서 'Transaction pooler'(포트 6543)와 'Session pooler 또는 Direct connection'(포트 5432) 두 개의 연결 문자열을 각각 복사합니다.",
            "저장소 루트에 `.env.local` 파일을 만들고(또는 `.env.example`을 복사) DATABASE_URL에 pooler 연결 문자열을, DIRECT_URL에 direct 연결 문자열을 넣습니다. 두 값 모두 비밀번호는 2절에서 저장한 값입니다.",
            "마이그레이션을 실제 데이터베이스에 적용합니다.",
            "기본 데이터를 시드합니다 — 관리자 계정과 기준 데이터(단위 환산, 배출계수 등)가 만들어집니다.",
            "시드 로그에 출력되는 관리자 비밀번호를 기록해 두고, 로그인 직후 반드시 변경하십시오.",
          ],
        },
        {
          kind: "code",
          lines: ["npx prisma migrate deploy", "npm run db:seed"],
        },
      ],
      verification: [
        "Supabase 대시보드의 Table Editor에 Organization, User, ActivityData 등 테이블이 보입니다.",
        "`npx prisma studio`로 로컬에서 데이터를 열람할 수 있습니다.",
      ],
    },

    {
      number: "4",
      title: "인증(Auth) 설정 — 이메일 · OAuth · MFA",
      purpose: "로그인·회원가입·다요소인증을 Supabase가 전담하도록 구성합니다.",
      cost: "2절의 Supabase 플랜에 포함됩니다.",
      optional: false,
      blocks: [
        {
          kind: "steps",
          items: [
            "Authentication → Providers → Email을 활성화합니다. 'Confirm email'을 켜면 가입 후 확인 메일이 필요합니다.",
            "Authentication → URL Configuration에서 Site URL을 운영 도메인으로(도메인이 아직 없다면 우선 Vercel이 배정하는 *.vercel.app 주소로) 설정하고, Redirect URLs에 `http://localhost:3000/auth/callback`과 실제 배포 도메인의 `/auth/callback`을 모두 추가합니다.",
            "(선택) Google OAuth: https://console.cloud.google.com 에서 OAuth 클라이언트(웹 애플리케이션)를 만들고, 승인된 리디렉션 URI에 `https://<project-ref>.supabase.co/auth/v1/callback`을 등록합니다. 발급된 클라이언트 ID·보안 비밀을 Supabase Authentication → Providers → Google에 입력합니다.",
            "(선택) Microsoft OAuth: https://portal.azure.com → Microsoft Entra ID → 앱 등록에서 동일한 리디렉션 URI를 등록하고, 클라이언트 ID·비밀을 Supabase Providers → Azure에 입력합니다.",
            "다요소인증(MFA)을 켭니다 — Authentication → Multi-Factor Authentication에서 TOTP를 활성화합니다.",
          ],
        },
      ],
      verification: [
        "로컬에서 `npm run dev` 실행 후 /login 화면에서 회원가입 → 확인 메일 수신 → 로그인이 성공합니다.",
        "/settings 화면에서 사용자가 스스로 MFA를 등록할 수 있습니다.",
      ],
    },

    {
      number: "5",
      title: "파일 저장소(Storage) 버킷 생성",
      purpose: "검증 증빙 파일과 생성된 보고서를 저장할 공간을 만듭니다.",
      cost: "2절의 Supabase 플랜에 포함됩니다(용량 초과 시 종량 과금).",
      optional: false,
      blocks: [
        {
          kind: "steps",
          items: [
            "Storage → 'New bucket'으로 `evidence` 버킷을 만듭니다. Public을 반드시 끕니다.",
            "같은 방법으로 `reports` 버킷을 만듭니다. 역시 Public을 끕니다.",
            "각 버킷의 Policies에서 authenticated 역할만 읽기·쓰기가 가능하도록 정책을 추가합니다(대시보드의 'New policy' → 'For full customization' 템플릿을 사용하면 SQL 없이도 만들 수 있습니다).",
          ],
        },
        {
          kind: "note",
          text: "이 버킷들을 실제로 코드가 사용하려면 src/lib/storage에 Supabase Storage 클라이언트를 추가하는 개발 작업이 필요합니다 — 현재는 자리만 마련되어 있고(getObjectStorageClient 팩토리), 실제 구현체는 프로세스 메모리뿐입니다. 이 부분은 [코드 작업 필요]로 별도 개발 티켓으로 등록하십시오.",
        },
      ],
      verification: ["Storage 화면에 evidence, reports 두 버킷이 비공개(Private) 상태로 보입니다."],
    },

    {
      number: "6",
      title: "행 단위 보안(RLS) 정책 적용",
      purpose: "애플리케이션 코드의 조직 검증(이번 개발에서 추가된 OrganizationMembership 기반 검증)에 더해, 데이터베이스 자체에서도 다른 조직의 행을 절대 반환하지 않도록 이중 방어선을 만듭니다.",
      cost: "무료 (PostgreSQL 자체 기능).",
      optional: false,
      blocks: [
        {
          kind: "text",
          text: "아래 SQL은 Supabase 대시보드의 SQL Editor에 붙여넣고 실행하는 방식입니다. 예시는 ActivityData 테이블 기준이며, 같은 패턴을 organizationId 컬럼을 가진 다른 테이블에도 반복 적용해야 합니다(EmissionCalculation, EmissionInventory, VerificationEngagement, EvidencePackage, DataSource, AuditTrail 등 총 30여 개).",
        },
        {
          kind: "code",
          lines: [
            "-- 1) 테이블에 RLS를 켠다",
            'alter table "ActivityData" enable row level security;',
            "",
            "-- 2) 로그인한 사용자가 실제로 속한 조직의 행만 보이도록 정책을 만든다",
            'create policy "org_isolation_activity_data"',
            'on "ActivityData"',
            "for all",
            "using (",
            '  "organizationId" in (',
            '    select om."organizationId"',
            '    from "OrganizationMembership" om',
            '    join "User" u on u.id = om."userId"',
            "    where u.email = auth.jwt() ->> 'email'",
            "      and om.status = 'ACTIVE'",
            "  )",
            ");",
          ],
        },
        {
          kind: "note",
          text: "이 애플리케이션은 Prisma의 서비스 계정 연결(DATABASE_URL)로 데이터베이스에 접속하므로, RLS가 서버 쪽 조회를 자동으로 걸러주지는 않습니다(서비스 역할 연결은 기본적으로 RLS를 우회합니다). 지금 당장 적용해야 하는 필수 항목은 아니며, 데이터베이스 계층의 심화 방어로 추가하는 것을 권장합니다. 30여 개 테이블 전체에 정책을 일관되게 적용하는 마이그레이션은 [코드 작업 필요] — 다음 개발 세션에서 스크립트로 일괄 생성하는 방식을 권장합니다.",
        },
      ],
      verification: [
        "SQL Editor에서 `select * from pg_policies where tablename = 'ActivityData';`를 실행하면 위에서 만든 정책이 보입니다.",
      ],
    },

    {
      number: "7",
      title: "[선택] 엔터프라이즈 SSO (SAML 2.0)",
      purpose: "고객사 자체 ID 공급자(Okta, Azure AD, Google Workspace 등)로 로그인할 수 있게 합니다.",
      cost: "Supabase Pro 플랜 이상 필요(월 25달러부터). 정확한 SSO 관련 추가 과금 여부는 계약 시점에 Supabase 가격 페이지에서 재확인하십시오.",
      optional: true,
      blocks: [
        {
          kind: "steps",
          items: [
            "Supabase 프로젝트를 Pro 플랜 이상으로 업그레이드합니다(Project Settings → Billing).",
            "Supabase CLI로 로그인하고 프로젝트를 연결합니다.",
            "고객사의 ID 공급자(Okta/Azure AD 등)에서 SAML 메타데이터 URL 또는 XML 파일을 발급받습니다 — IdP 관리자가 제공합니다.",
            "Supabase CLI의 SSO 관련 명령으로 커넥터를 등록합니다. 정확한 명령 구문은 버전에 따라 조금씩 달라질 수 있으므로 공식 가이드를 그대로 따르는 것을 권장합니다: https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml",
          ],
        },
        {
          kind: "code",
          lines: ["supabase login", "supabase link --project-ref <project-ref>"],
        },
        {
          kind: "note",
          text: "이 항목은 애플리케이션 코드 변경 없이 동작합니다 — Supabase Auth가 세션을 그대로 발급하기 때문입니다. 실제로 SSO를 요구하는 고객사가 생겼을 때 진행해도 늦지 않습니다.",
        },
      ],
      verification: ["등록한 IdP를 통해 로그인 시도 시 Supabase Auth 콜백으로 정상 리디렉션됩니다."],
    },

    {
      number: "8",
      title: "Vercel 프로젝트 연결 및 첫 배포",
      purpose: "저장소를 Vercel에 연결해 자동 빌드·배포·프리뷰 URL을 받습니다.",
      cost: "Hobby 플랜 무료(비상업적 용도). 매출이 발생하는 운영 환경은 Pro 플랜(월 20달러/사용자)이 필요합니다 — Vercel 정책상 상업적 사용에는 Pro 이상이 요구됩니다.",
      optional: false,
      blocks: [
        {
          kind: "steps",
          items: [
            "저장소 루트에서 Vercel과 연결합니다. 처음 실행하면 로그인과 프로젝트 생성/연결 여부를 대화형으로 물어봅니다.",
            "2~3절에서 준비한 환경변수를 Vercel 프로젝트에 등록합니다 — 대시보드(Project → Settings → Environment Variables)에서 하나씩 입력하거나, CLI로 일괄 등록합니다.",
            "필수 항목: DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, FIELD_ENCRYPTION_KEY(아래 명령으로 직접 생성).",
            "프로덕션 배포를 실행합니다.",
          ],
        },
        {
          kind: "code",
          lines: [
            "vercel link",
            "",
            "# FIELD_ENCRYPTION_KEY 생성 (32바이트 랜덤 값)",
            "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
            "",
            "vercel env add DATABASE_URL production",
            "vercel env add DIRECT_URL production",
            "vercel env add NEXT_PUBLIC_SUPABASE_URL production",
            "vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production",
            "vercel env add FIELD_ENCRYPTION_KEY production",
            "",
            "vercel --prod",
          ],
        },
      ],
      verification: [
        "`vercel --prod` 실행 후 출력된 URL로 접속하면 로그인 화면이 정상적으로 열립니다.",
        "`GET https://<배포 도메인>/api/v1/health` 응답의 database.reachable 값이 true입니다.",
      ],
    },

    {
      number: "9",
      title: "도메인 · DNS · SSL",
      purpose: "회사 도메인으로 접속하고, 인증서를 자동으로 관리합니다.",
      cost: "도메인 자체 등록 비용(연 1만~5만 원대, 등록기관에 따라 다름) 외에 Vercel의 도메인 연결·SSL 발급 자체는 무료입니다.",
      optional: false,
      blocks: [
        {
          kind: "steps",
          items: [
            "Vercel 프로젝트 → Settings → Domains에서 사용할 도메인(예: cios.example.com)을 추가합니다.",
            "Vercel이 안내하는 대로 도메인 등록기관(가비아, Route 53 등)의 DNS에 CNAME 또는 A 레코드를 추가합니다.",
            "전파가 완료되면(수 분~수 시간) Vercel이 SSL 인증서를 자동 발급합니다.",
            "4절에서 설정한 Supabase의 Site URL과 Redirect URLs를 실제 도메인으로 갱신합니다. Google/Microsoft OAuth를 썼다면 각 콘솔의 리디렉션 URI도 함께 갱신합니다.",
          ],
        },
      ],
      verification: ["https://<실제 도메인>으로 접속 시 브라우저 주소창에 자물쇠 아이콘(유효한 SSL)이 표시됩니다."],
    },

    {
      number: "10",
      title: "Vercel AI Gateway 활성화 (서술형 AI 텍스트)",
      purpose: "계산 근거 설명 등 서술형 텍스트 생성을, 별도 OpenAI 계정 없이 Vercel 계정만으로 사용합니다.",
      cost: "Vercel 팀마다 매월 무료 크레딧 제공, 이후 사용량은 공급자 정가 그대로 Vercel 청구서에 합산(마크업 없음).",
      optional: true,
      blocks: [
        {
          kind: "steps",
          items: [
            "Vercel 대시보드 → 해당 프로젝트 → Settings → AI Gateway에서 기능을 활성화합니다.",
            "로컬 개발용으로 최신 환경변수를 내려받습니다 — VERCEL_OIDC_TOKEN이 자동으로 채워집니다.",
            "예산 알림을 설정합니다 — AI Gateway → Usage & Budgets에서 월 한도(예: 경고 50달러, 상한 100달러)를 지정합니다.",
          ],
        },
        {
          kind: "code",
          lines: ["vercel env pull .env.local --yes"],
        },
        {
          kind: "note",
          text: "[코드 작업 필요] 현재 src/lib/ai/llm은 OpenAI SDK를 직접 호출합니다. AI Gateway를 통해 호출하도록 전환하는 코드 작업(예: `ai` 패키지의 \"provider/model\" 문자열 방식으로 교체)이 별도로 필요합니다. 전환 후에는 OPENAI_API_KEY 환경변수 자체가 필요 없어집니다. 임베딩(의미 검색)은 AI Gateway가 지원하지 않으므로, 실제 OpenAI 임베딩 품질이 필요하면 OPENAI_API_KEY를 별도로 유지하거나, 이미 구현된 결정론적 임베딩(무료·키 불필요, 검색 품질은 낮음)을 그대로 사용하십시오.",
        },
      ],
      verification: [
        "코드 전환이 끝난 뒤: Vercel 대시보드 → 프로젝트 → AI 탭의 Logs에 실제 요청이 기록됩니다.",
      ],
    },

    {
      number: "11",
      title: "API 레이트리밋 (Supabase Postgres 기반, Redis 불필요)",
      purpose: "여러 서버 인스턴스에서도 API 키별 호출 한도가 정확히 지켜지도록 합니다.",
      cost: "무료 (기존 Supabase 데이터베이스 안에 테이블 하나를 추가하는 방식이라 별도 서비스 비용이 없습니다).",
      optional: true,
      blocks: [
        {
          kind: "text",
          text: "현재는 서버 프로세스 메모리에만 한도가 저장되어, 인스턴스마다 한도가 따로 적용됩니다(단일 인스턴스라면 지금 상태로도 정확합니다). 여러 인스턴스에서 정확한 한도가 필요해지면 아래 테이블을 만들고, 그 위에서 동작하는 레이트리미터를 구현하십시오.",
        },
        {
          kind: "code",
          lines: [
            'create table if not exists "ApiRateLimitBucket" (',
            '  "key" text primary key,',
            '  "tokens" double precision not null,',
            '  "limit" integer not null,',
            '  "windowMs" integer not null,',
            '  "lastRefillAt" timestamptz not null default now()',
            ");",
          ],
        },
        {
          kind: "note",
          text: "[코드 작업 필요] 테이블 생성 후, 원자적으로 토큰을 차감하는 Postgres 함수(단일 UPDATE...RETURNING 또는 SELECT ... FOR UPDATE)를 작성하고, src/lib/api/rate-limit.ts의 getRateLimiter() 팩토리가 이 구현체를 반환하도록 교체하는 개발 작업이 필요합니다. 이미 이 접점은 준비되어 있어 구현체만 추가하면 됩니다.",
        },
      ],
      verification: ["코드 작업 완료 후: 서로 다른 두 배포 인스턴스에서 같은 API 키로 연속 호출해도 합산 한도가 정확히 지켜집니다."],
    },

    {
      number: "12",
      title: "[선택] Vercel Firewall — IP 단위 보호",
      purpose: "레이트리밋 외에도, 악성 트래픽을 애플리케이션 코드 앞단에서 무료로 걸러냅니다.",
      cost: "기본 DDoS 방어는 모든 플랜에서 무료. 커스텀 규칙(레이트리밋 등)은 Pro 플랜 이상에서 지원되는 것이 일반적이니, 실제 적용 시점에 현재 플랜 조건을 다시 확인하십시오.",
      optional: true,
      blocks: [
        {
          kind: "steps",
          items: [
            "저장소 루트에서 프로젝트를 링크합니다(8절에서 이미 했다면 생략).",
            "`/api`로 시작하는 경로에 IP 기준 레이트리밋 규칙을 만듭니다 — 처음에는 차단 대신 기록(log)만 하도록 설정해 정상 트래픽까지 막히지 않는지 확인합니다.",
            "대시보드에서 로그를 며칠 검토한 뒤 이상이 없으면 규칙을 차단(rate_limit) 동작으로 바꾸고 게시합니다.",
          ],
        },
        {
          kind: "code",
          lines: [
            "vercel link",
            'vercel firewall rules add "API rate limit (log only)" \\',
            "  --condition '{\"type\":\"path\",\"op\":\"pre\",\"value\":\"/api\"}' \\",
            "  --action rate_limit \\",
            "  --rate-limit-window 60 \\",
            "  --rate-limit-requests 300 \\",
            "  --rate-limit-keys ip \\",
            "  --rate-limit-action log \\",
            "  --yes",
            "",
            "vercel firewall diff",
            "vercel firewall publish --yes   # 검토 후 실제로 게시할 때 실행",
          ],
        },
        {
          kind: "note",
          text: "이 규칙은 IP 단위 보호이며, 11절의 API 키별 정밀 한도를 대신하지 못합니다. 두 가지를 함께 쓰는 것을 권장합니다.",
        },
      ],
      verification: ["`vercel firewall rules list`에 방금 만든 규칙이 보이고, 대시보드의 Firewall → Traffic에서 기록이 쌓입니다."],
    },

    {
      number: "13",
      title: "[선택] 비동기 계산 처리 (Vercel Workflow / Queues)",
      purpose: "활동자료가 매우 많은 조직에서 계산 API가 요청 제한시간을 넘기지 않도록, 계산을 백그라운드로 넘기고 진행 상태만 조회하게 합니다.",
      cost: "요청 처리량에 따른 종량 과금(Vercel Functions 사용량에 포함). 소규모 운영에서는 지금(동기 실행) 상태로도 충분할 수 있습니다 — 실제로 타임아웃이 발생하기 전에는 급하지 않은 항목입니다.",
      optional: true,
      blocks: [
        {
          kind: "steps",
          items: [
            "Workflow DevKit 패키지를 설치합니다.",
            "설치된 패키지의 문서(node_modules/workflow/docs)를 확인해 Next.js 프로젝트 설정 방법을 따릅니다 — 버전마다 세부 절차가 바뀔 수 있어 로컬 문서를 그대로 따르는 것이 가장 정확합니다.",
          ],
        },
        {
          kind: "code",
          lines: ["npm install workflow"],
        },
        {
          kind: "note",
          text: "[코드 작업 필요] POST /api/v1/calculations의 동기 실행 로직을 workflow 함수(\"use workflow\"/\"use step\")로 옮기고, 실행 상태를 조회하는 폴링 엔드포인트(GET /api/v1/calculations/:runId)를 추가하는 개발 작업입니다. 지금 당장 필요하지 않다면 미뤄도 되는 항목입니다.",
        },
      ],
      verification: ["코드 작업 완료 후: 대용량 조직(수만 건 활동자료)의 계산 요청이 타임아웃 없이 접수되고, 폴링 엔드포인트로 진행 상태를 확인할 수 있습니다."],
    },

    {
      number: "14",
      title: "백업 및 재해복구",
      purpose: "실수로 데이터를 지우거나 잘못된 배포가 있었을 때 특정 시점으로 되돌릴 수 있게 합니다.",
      cost: "Pro 플랜은 최근 7일 일 단위 백업 기본 포함. Point-in-Time Recovery(PITR)는 추가 옵션으로 7일 보존당 월 100달러, 14일 200달러, 28일 400달러입니다(시간 단위 과금, Spend Cap 적용 대상 아님).",
      optional: false,
      blocks: [
        {
          kind: "steps",
          items: [
            "Supabase 프로젝트가 Pro 플랜 이상인지 확인합니다(7절에서 이미 업그레이드했다면 생략).",
            "Database → Backups 화면에서 자동 일 단위 백업이 활성화되어 있는지 확인합니다(Pro 플랜은 기본 제공).",
            "분 단위 복구가 필요한 규모라면 Database → Backups → Point in Time Recovery에서 보존 기간(7/14/28일)을 선택해 활성화합니다. 최소 Small 컴퓨트 애드온이 필요합니다.",
            "복구 절차를 문서화하고, 분기에 한 번 실제로 스테이징 환경에 복원 리허설을 해보는 일정을 잡습니다.",
          ],
        },
      ],
      verification: ["Database → Backups 화면에 최근 백업 목록이 표시됩니다."],
    },

    {
      number: "15",
      title: "모니터링 · 로그",
      purpose: "장애를 사용자보다 먼저 알아차립니다.",
      cost: "Vercel 기본 로그·Observability는 플랜에 포함. 더 정교한 지표(Observability Plus)는 추가 요금이 있습니다.",
      optional: false,
      blocks: [
        {
          kind: "steps",
          items: [
            "Vercel 프로젝트 → Observability 탭에서 함수 로그·요청 지표를 확인합니다.",
            "GET /api/v1/health를 외부 가동시간 점검 서비스(또는 Vercel 자체 알림)에 등록해 database.reachable이 false로 바뀌면 알림이 오도록 구성합니다.",
            "Supabase 대시보드 → Logs & Reports에서 데이터베이스 쿼리 로그와 Advisor(보안·성능 권고)를 정기적으로 확인합니다.",
            "필요하면 Vercel Marketplace의 observability 카테고리에서 전용 APM(예: Sentry 계열)을 추가로 연동합니다 — 계정·결제는 Vercel 안에서 통합 관리됩니다.",
          ],
        },
      ],
      verification: ["의도적으로 DATABASE_URL을 잘못된 값으로 바꿔 배포한 뒤, /api/v1/health가 즉시 이를 반영하고 알림이 오는지 확인합니다(확인 후 원래 값으로 되돌립니다)."],
    },

    {
      number: "16",
      title: "[선택] 이메일 발송 (알림)",
      purpose: "규칙 엔진의 알림(notify) 효과를 실제 이메일로 발송합니다.",
      cost: "Resend Free 플랜 월 3,000통 무료. Vercel Marketplace로 설치하면 별도 결제 수단 등록 없이 Vercel 청구서에 합산됩니다.",
      optional: true,
      blocks: [
        {
          kind: "steps",
          items: [
            "저장소를 링크한 뒤 메시징 카테고리에서 사용 가능한 통합을 확인합니다.",
            "표시된 항목(기본값 Resend) 을 설치합니다 — 대시보드/브라우저 확인이 필요하면 안내에 따라 진행합니다.",
            "환경변수를 내려받으면 RESEND_API_KEY가 자동으로 채워집니다.",
            "NOTIFICATION_EMAIL_FROM 환경변수에 발신 주소를 등록합니다(Resend에서 도메인 인증이 필요합니다).",
          ],
        },
        {
          kind: "code",
          lines: [
            "vercel link",
            "vercel integration categories",
            "vercel integration discover --category messaging",
            "vercel integration add resend --yes",
            "vercel env pull .env.local --yes",
          ],
        },
        {
          kind: "note",
          text: "Supabase 내장 이메일은 시간당 2통 제한이며 인증 흐름 전용이라 이 용도로 쓸 수 없습니다. 이 항목은 이미 코드가 준비되어 있어(getNotificationChannel 팩토리) 환경변수만 등록하면 바로 동작합니다 — 코드 작업이 필요하지 않습니다.",
        },
      ],
      verification: ["규칙 엔진에서 notify 효과가 실행되는 활동자료를 저장한 뒤, 대상자 메일함에 실제 메일이 도착합니다."],
    },

    {
      number: "17",
      title: "[선택] 인터랙티브 지도",
      purpose: "조직(Organization) 화면에서 사업장을 지도 위에 표시합니다.",
      cost: "Mapbox 무료 티어 월 5만 회 지도 로드까지 무료(2026년 기준, 계약 전 재확인 권장).",
      optional: true,
      blocks: [
        {
          kind: "steps",
          items: [
            "https://account.mapbox.com 에서 계정을 만듭니다.",
            "Access tokens 화면에서 기본 공개 토큰을 복사합니다(도메인 제한을 걸어두는 것을 권장합니다).",
            "Vercel 환경변수에 MAPBOX_ACCESS_TOKEN을 등록합니다.",
          ],
        },
        {
          kind: "note",
          text: "Vercel·Supabase 어디에도 대응 제품이 없어 유일하게 제3자가 반드시 필요한 항목입니다. 설정하지 않아도 애플리케이션은 정상 동작하며, 지도 대신 사업장 좌표 목록이 표시됩니다.",
        },
      ],
      verification: ["/organization 화면에서 인터랙티브 지도가 사업장 좌표 목록 대신 렌더링됩니다."],
    },

    {
      number: "18",
      title: "전체 점검 체크리스트",
      purpose: "운영 전환 전 마지막으로 훑어보는 목록입니다.",
      cost: "-",
      optional: false,
      blocks: [
        {
          kind: "table",
          headers: ["절", "항목", "완료"],
          rows: [
            ["2~3", "Supabase 프로젝트 생성, 마이그레이션·시드 완료", "☐"],
            ["4", "로그인·OAuth·MFA 동작 확인", "☐"],
            ["5", "evidence/reports 버킷 생성(+ 코드 연결은 별도 개발)", "☐"],
            ["6", "핵심 테이블 RLS 정책 적용(선택이지만 권장)", "☐"],
            ["7", "SSO 필요 여부 결정 — 필요 시 Pro 업그레이드", "☐"],
            ["8", "Vercel 배포 성공, /api/v1/health 정상", "☐"],
            ["9", "실 도메인 연결, SSL 확인, OAuth 리디렉션 URI 갱신", "☐"],
            ["10", "AI Gateway 활성화 여부 결정(+ 코드 전환은 별도 개발)", "☐"],
            ["11", "다중 인스턴스 배포 여부에 따라 레이트리밋 전략 결정", "☐"],
            ["12", "Firewall 규칙 로그 모드로 먼저 검증 후 게시", "☐"],
            ["13", "대용량 조직 유무에 따라 비동기 계산 필요 여부 결정", "☐"],
            ["14", "PITR 필요 여부 결정, 복구 리허설 일정 수립", "☐"],
            ["15", "헬스체크 알림 연결 확인", "☐"],
            ["16", "알림 이메일 발송 필요 여부 결정", "☐"],
            ["17", "지도 필요 여부 결정", "☐"],
          ],
        },
      ],
      verification: ["위 표의 모든 항목이 '완료' 또는 '조직 상황상 불필요로 확정'입니다."],
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
    children: [new TextRun({ text: `${index}. `, bold: true }), new TextRun({ text })],
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

function noteParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 160, line: 280 },
    indent: { left: 240 },
    shading: { type: ShadingType.CLEAR, fill: "FFF2CC" },
    children: [new TextRun({ text: `⚠ ${text}`, italics: true, size: 20 })],
  });
}

function tableCell(text: string, options: { readonly header?: boolean } = {}): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.TOP,
    shading: options.header === true ? { type: ShadingType.CLEAR, fill: "E7E6E6" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        spacing: { after: 0, line: 260 },
        children: [new TextRun({ text, bold: options.header ?? false, size: 18 })],
      }),
    ],
  });
}

function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): Table {
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
      ...rows.map((row) => new TableRow({ children: row.map((cell) => tableCell(cell)) })),
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
      return [...block.lines.map((line) => codeParagraph(line)), new Paragraph({ spacing: { after: 120 }, children: [] })];
    case "note":
      return [noteParagraph(block.text)];
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
      spacing: { before: 320, after: 80 },
      children: [
        new TextRun({
          text: `${section.number}. ${section.title}${section.optional ? " (선택)" : ""}`,
          bold: true,
        }),
      ],
    }),
    bodyParagraph(section.purpose),
    ...section.blocks.flatMap((block) => renderBlock(block)),
    labelParagraph("예상 비용"),
    bodyParagraph(section.cost),
    labelParagraph("완료 확인 방법"),
    ...section.verification.map((item) => bulletParagraph(item)),
  ];
}

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
            children: [new TextRun({ text: "CIOS — Vercel + Supabase 설정 가이드", bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 320 },
            children: [
              new TextRun({
                text: "Vercel과 Supabase만으로 처음부터 끝까지 직접 설정하는 단계별 안내",
                size: 24,
              }),
            ],
          }),

          labelParagraph("이 문서의 성격"),
          bodyParagraph(
            "docs/Vercel-Supabase-전용-구성-검토.docx에서 '가능하다'고 판정한 내용을 실제로 손으로 따라 할 수 있는 순서로 풀어 쓴 문서입니다. 대부분의 단계는 대시보드 클릭·CLI 명령·SQL 실행만으로 끝나며, 애플리케이션 코드 변경이 필요한 단계는 '[코드 작업 필요]'로 명확히 표시했습니다 — 이런 단계는 이미 코드에 연결 지점(팩토리)이 준비되어 있어, 개발자(또는 다음 Claude Code 세션)에게 이 문서를 그대로 전달하면 됩니다.",
          ),
          bodyParagraph(
            "필수(선택 아님) 항목만 먼저 끝내면 최소 운영 가능한 상태가 됩니다: 1·2·3·4·5·6·8·9·14·15절. 나머지는 조직 규모와 요구사항에 맞춰 선택적으로 진행하십시오.",
          ),
          bodyParagraph("각 절은 '무엇을·왜(목적) → 단계 → 예상 비용 → 완료 확인 방법' 순서로 구성됩니다."),

          labelParagraph("목차"),
          new TableOfContents("목차", { hyperlink: true, headingStyleRange: "1-1" }),

          ...sections.flatMap((section) => renderSection(section)),

          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 360, after: 140 },
            children: [new TextRun({ text: "부록. 관련 문서", bold: true })],
          }),
          bulletParagraph("docs/CIOS-직접-설정-가이드.docx — 전체 설정 항목의 원본 안내(Mapbox/Redis/OpenAI 직접 연동 등 대안 경로 포함)."),
          bulletParagraph("docs/Vercel-Supabase-전용-구성-검토.docx — 이 문서의 각 단계가 왜 가능한지에 대한 기술 근거와 출처."),
          bodyParagraph(
            "이 문서는 `scripts/generate-vercel-supabase-setup-guide.ts`가 생성합니다. 내용이 바뀌어야 하면 스크립트를 수정하고 아래 명령으로 다시 생성하십시오.",
          ),
          codeParagraph("npx tsx scripts/generate-vercel-supabase-setup-guide.ts"),
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
    `Wrote ${join(OUTPUT_PATH)} — ${sections.length} sections, ${buffer.length.toLocaleString()} bytes.`,
  );
}

const invokedDirectly = (process.argv[1] ?? "").endsWith("generate-vercel-supabase-setup-guide.ts");
if (invokedDirectly) {
  void main().catch((error: unknown) => {
    console.error("Failed to generate the Vercel+Supabase setup guide:", error);
    process.exit(1);
  });
}
