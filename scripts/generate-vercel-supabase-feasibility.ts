/**
 * Generates `docs/Vercel-Supabase-전용-구성-검토.docx` — a technical review of
 * whether every remaining "the user must do this" item (docs/CIOS-직접-설정-가이드.docx,
 * section 12 and sections 2–11) can be built using only Vercel and Supabase,
 * with no other third-party vendor.
 *
 * Findings were verified against current Vercel/Supabase product documentation
 * (Vercel AI Gateway, Vercel Firewall, Vercel Workflow DevKit/Queues, Vercel
 * Marketplace, Supabase Auth Enterprise SSO, Supabase PITR) rather than
 * asserted from training data, because these products change often.
 *
 * Written as a generator, same convention as generate-setup-guide.ts, so the
 * document stays reviewable in git and can be regenerated when the
 * verified facts change.
 *
 * Run with: npx tsx scripts/generate-vercel-supabase-feasibility.ts
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

export const OUTPUT_PATH = "docs/Vercel-Supabase-전용-구성-검토.docx";

const BODY_FONT = "Malgun Gothic";
const MONO_FONT = "Consolas";

// ---------------------------------------------------------------------------
// docx rendering helpers (same visual conventions as generate-setup-guide.ts)
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

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 140 },
    children: [new TextRun({ text, bold: true })],
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
    shading:
      options.header === true ? { type: ShadingType.CLEAR, fill: "E7E6E6" } : undefined,
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

function spacer(after = 200): Paragraph {
  return new Paragraph({ spacing: { after }, children: [] });
}

// ---------------------------------------------------------------------------
// Content model — one row per item under review
// ---------------------------------------------------------------------------

type Verdict = "완전 가능" | "가능(코드 변경 필요)" | "부분 가능" | "불가능" | "무관";

type Item = {
  readonly feature: string;
  readonly verdict: Verdict;
  readonly finding: string;
  readonly action: string;
};

const CATEGORIES: readonly { readonly title: string; readonly items: readonly Item[] }[] = [
  {
    title: "1. 데이터베이스 · 인증 · 파일 저장소",
    items: [
      {
        feature: "PostgreSQL 데이터베이스",
        verdict: "완전 가능",
        finding:
          "Supabase가 관리형 PostgreSQL을 제공하며, 이 코드베이스는 이미 전적으로 Supabase Postgres를 전제로 설계되어 있습니다(DATABASE_URL/DIRECT_URL).",
        action: "설정 가이드 3절 그대로 진행하면 됩니다. 추가 조치가 필요하지 않습니다.",
      },
      {
        feature: "pgvector 시맨틱 검색",
        verdict: "완전 가능",
        finding: "Supabase Postgres는 pgvector 확장을 대시보드에서 바로 활성화할 수 있습니다.",
        action: "설정 가이드 3절대로 확장을 켜고 `npm run embeddings:backfill`을 실행하십시오.",
      },
      {
        feature: "이메일·비밀번호 로그인, Google/Microsoft OAuth",
        verdict: "완전 가능",
        finding: "Supabase Auth가 이미 이 기능의 기반이며, 설정 가이드 2절이 이를 다룹니다.",
        action: "추가 조치가 필요하지 않습니다.",
      },
      {
        feature: "다요소인증(MFA, TOTP)",
        verdict: "완전 가능",
        finding:
          "Supabase Auth가 TOTP 기반 MFA를 네이티브로 제공합니다(Authentication → Multi-Factor Authentication).",
        action: "설정 가이드 2절의 안내대로 활성화하십시오. 추가 개발이 필요하지 않습니다.",
      },
      {
        feature: "증빙 파일 · 보고서 산출물 저장소",
        verdict: "가능(코드 변경 필요)",
        finding:
          "Supabase Storage가 버킷·정책·서명 URL을 모두 지원합니다. 현재 코드는 src/lib/storage 팩토리 패턴으로 준비되어 있으나, 실제 저장 구현체는 아직 프로세스 메모리(MemoryObjectStorageClient)뿐입니다.",
        action:
          "Supabase Storage에 연결하는 SupabaseObjectStorageClient를 추가 개발해 getObjectStorageClient()가 이를 선택하도록 연결하는 코드 작업이 필요합니다(설정 가이드 2절에서 만든 evidence/reports 버킷 재사용).",
      },
    ],
  },
  {
    title: "2. 테넌트 격리 · 조직 간 데이터 보호",
    items: [
      {
        feature: "Row-Level Security(RLS)",
        verdict: "완전 가능",
        finding:
          "PostgreSQL 네이티브 기능이며 Supabase 대시보드/CLI로 정책을 정의합니다. 애플리케이션 계층 검증(이번 세션에서 구현한 OrganizationMembership 기반 검증)에 더해 데이터베이스 계층 방어를 추가할 수 있습니다.",
        action:
          "실 데이터베이스 프로비저닝 후 조직 단위 RLS 정책을 테이블별로 추가하는 마이그레이션 작업이 필요합니다(별도 개발).",
      },
    ],
  },
  {
    title: "3. 엔터프라이즈 인증 (SSO/SAML)",
    items: [
      {
        feature: "SAML 2.0 기반 SSO (Okta, Azure AD, Google Workspace 등)",
        verdict: "완전 가능",
        finding:
          "Supabase Auth는 SAML 2.0 호환 IdP에 대한 엔터프라이즈 SSO를 네이티브로 지원합니다(공식 문서: supabase.com/docs/guides/auth/enterprise-sso). Pro 플랜 이상에서 제공되며, 설정에는 Supabase CLI가 필요합니다.",
        action:
          "Pro 플랜 이상으로 업그레이드한 뒤 Supabase CLI로 SAML 커넥터를 등록하는 설정 작업입니다. 애플리케이션 코드 변경은 필요하지 않습니다(Supabase Auth가 세션을 그대로 발급).",
      },
    ],
  },
  {
    title: "4. AI / 언어모델 (서술형 근거·설명 생성)",
    items: [
      {
        feature: "서술형 텍스트 생성 (계산 근거, 설명)",
        verdict: "가능(코드 변경 필요)",
        finding:
          "Vercel AI Gateway는 기본 인증 방식이 Vercel 계정의 OIDC 토큰이라 별도의 OpenAI 계정·API 키가 필요하지 않습니다. Vercel 팀마다 매월 무료 크레딧이 제공되고, 이후 사용량은 Vercel 청구서로 결제됩니다(공급자 정가, 마크업 없음).",
        action:
          "현재 src/lib/ai/llm이 OpenAI SDK를 직접 호출하는 구조를 Vercel AI SDK(`ai` 패키지)의 `\"provider/model\"` 문자열 기반 호출로 전환하는 코드 작업이 필요합니다. 전환 후에는 OPENAI_API_KEY 없이 Vercel 프로젝트에서 AI Gateway를 활성화하는 것만으로 동작합니다.",
      },
      {
        feature: "임베딩 생성 (pgvector 시맨틱 검색용)",
        verdict: "부분 가능",
        finding:
          "Vercel AI Gateway는 텍스트·이미지 생성만 중계하며, 임베딩은 대상에서 제외되어 있습니다(공식 가이드에 명시). 즉 실제 OpenAI 임베딩을 쓰려면 여전히 별도 OpenAI 키가 필요합니다.",
        action:
          "① 정밀한 의미 검색이 필요하면 OpenAI 임베딩 키를 그대로 유지하거나, ② Vercel/Supabase만으로 한정하려면 이미 구현되어 있는 결정론적 임베딩(mulberry32 기반, src/lib/ai/embeddings/deterministic-embeddings-client.ts)을 그대로 사용하십시오 — 검색은 동작하지만 실제 의미 유사도 품질은 OpenAI 임베딩보다 낮습니다.",
      },
    ],
  },
  {
    title: "5. 배포 · 도메인 · API 레이트리밋 · 비동기 처리",
    items: [
      {
        feature: "호스팅 · 배포",
        verdict: "완전 가능",
        finding: "설정 가이드 8절이 이미 Vercel을 배포 옵션 중 하나로 다루고 있습니다.",
        action: "Docker 경로 대신 Vercel 경로만 선택해 진행하면 됩니다.",
      },
      {
        feature: "도메인 · DNS · SSL",
        verdict: "완전 가능",
        finding: "Vercel이 도메인 연결, DNS 관리, SSL 인증서 자동 발급·갱신을 자체 제공합니다.",
        action: "Vercel 프로젝트의 Domains 설정에서 진행하십시오. 별도 인증서 공급자가 필요하지 않습니다.",
      },
      {
        feature: "API 키별 레이트리밋 (다중 서버 인스턴스 대응)",
        verdict: "가능(코드 변경 필요)",
        finding:
          "현재 구현은 프로세스 메모리 기반이라 인스턴스마다 한도가 개별 적용됩니다(REDIS_URL은 선택 사항으로 문서화되어 있으나 미구현). Vercel Firewall의 레이트리밋 규칙은 IP·JA4 기준으로는 모든 플랜에서 가능하지만, API 키처럼 특정 헤더 값 기준의 카운팅은 Enterprise 플랜에서만 지원됩니다.",
        action:
          "Redis 없이 다중 인스턴스에서 정확한 API 키별 한도를 적용하려면, Supabase Postgres 테이블(원자적 UPDATE 기반 토큰 버킷)로 레이트리미터를 구현하는 코드 작업을 권장합니다. getRateLimiter() 팩토리 접점이 이미 준비되어 있어 구현체만 교체하면 됩니다. 보조적으로 Vercel Firewall의 IP 단위 레이트리밋 규칙을 무료로 함께 적용할 수 있습니다.",
      },
      {
        feature: "배출량 계산의 비동기 처리 (대량 데이터셋 타임아웃 방지)",
        verdict: "가능(코드 변경 필요)",
        finding:
          "Vercel Workflow DevKit(단계·재시도·일시정지/재개를 지원하는 내구성 워크플로 엔진)과 Vercel Queues(재시도 가능한 이벤트 스트리밍)가 모두 Vercel 자체 인프라로 제공됩니다. 별도 Redis·BullMQ 없이 비동기 작업과 상태 조회를 구현할 수 있습니다.",
        action:
          "POST /api/v1/calculations의 동기 실행을 Vercel Workflow(`\"use workflow\"`/`\"use step\"`)로 전환하고, 실행 상태를 조회하는 폴링 엔드포인트를 추가하는 코드 작업이 필요합니다.",
      },
    ],
  },
  {
    title: "6. 백업 · 모니터링 · 운영",
    items: [
      {
        feature: "데이터베이스 백업",
        verdict: "완전 가능",
        finding:
          "Supabase는 Pro 플랜부터 일 단위 백업(최근 7일)을 기본 제공하며, Point-in-Time Recovery(PITR)를 추가 옵션(7일 보존당 월 100달러)으로 제공합니다.",
        action: "운영 요구 수준에 맞춰 Pro 플랜과 필요 시 PITR을 추가하십시오.",
      },
      {
        feature: "모니터링 · 로그 · 헬스체크",
        verdict: "완전 가능",
        finding:
          "Vercel은 자체 Observability(로그·트레이스, Observability Plus에서 메트릭 API)를 제공하고, Supabase도 자체 로그·Advisor를 제공합니다. 이번 세션에서 실제 DB 연결성을 확인하는 /api/v1/health도 이미 구현되어 있습니다.",
        action:
          "전용 APM(Sentry 등)이 꼭 필요하지 않다면 Vercel Observability와 Supabase 로그만으로 운영 가시성을 확보할 수 있습니다. 더 정교한 알림이 필요하면 Vercel Marketplace에서 옵서버빌리티 카테고리 통합을 추가하는 선택지도 있습니다.",
      },
    ],
  },
  {
    title: "7. 부분적으로만 가능하거나 인프라와 무관한 항목",
    items: [
      {
        feature: "이메일 발송 (규칙 엔진 알림)",
        verdict: "부분 가능",
        finding:
          "Supabase의 내장 이메일은 시간당 2통으로 제한되고 인증 흐름 전용이라 알림 발송에 쓸 수 없습니다. Vercel과 Supabase 자체에는 범용 트랜잭션 이메일 발송 기능이 없습니다. 다만 Resend는 Vercel Marketplace의 공식 파트너 통합으로, 설치와 결제가 Vercel 계정 안에서 통합 처리됩니다.",
        action:
          "완전한 무(無)서드파티를 원한다면 대안이 없습니다. 다만 Resend를 Vercel Marketplace를 통해 설치하면 별도 결제 수단 등록 없이 Vercel 청구서에 합산되므로, '계정·결제 관계'는 사실상 Vercel 하나로 유지됩니다.",
      },
      {
        feature: "인터랙티브 지도 (사업장 위치 시각화)",
        verdict: "불가능",
        finding: "Vercel과 Supabase 어느 쪽에도 지도 제품이 없습니다.",
        action:
          "Mapbox(또는 동급 지도 공급자) 없이는 지도 기능 자체를 제공할 수 없습니다. 다만 이 항목은 원래 선택 사항이며, 토큰이 없으면 자동으로 사업장 좌표 목록으로 대체되어 애플리케이션은 정상 동작합니다.",
      },
      {
        feature: "상용 배출계수 데이터 라이선스",
        verdict: "무관",
        finding: "이것은 인프라·호스팅 선택이 아니라 데이터 라이선스 계약입니다. 어떤 클라우드를 쓰든 별도로 구매해야 합니다.",
        action: "설정 가이드 9절대로 별도로 진행하십시오.",
      },
      {
        feature: "제3자 검증기관 선정, 규제 제출(SBTi/CDP/CSRD 등)",
        verdict: "무관",
        finding: "법적·업무 절차이며 인프라와 무관합니다.",
        action: "설정 가이드 10절대로 별도로 진행하십시오.",
      },
    ],
  },
];

function verdictBadge(verdict: Verdict): string {
  switch (verdict) {
    case "완전 가능":
      return "● 완전 가능";
    case "가능(코드 변경 필요)":
      return "◐ 가능 (코드 변경 필요)";
    case "부분 가능":
      return "◑ 부분 가능";
    case "불가능":
      return "○ 불가능";
    case "무관":
      return "— 인프라와 무관";
  }
}

// ---------------------------------------------------------------------------
// Document assembly
// ---------------------------------------------------------------------------

export function buildDocument(): Document {
  const summaryRows = CATEGORIES.flatMap((category) =>
    category.items.map((item) => [item.feature, verdictBadge(item.verdict)]),
  );

  const categoryBlocks = CATEGORIES.flatMap((category) => [
    h1(category.title),
    ...category.items.flatMap((item) => [
      labelParagraph(item.feature),
      bodyParagraph(`판정: ${verdictBadge(item.verdict)}`, { bold: true }),
      bodyParagraph(`근거: ${item.finding}`),
      bodyParagraph(`필요한 조치: ${item.action}`),
      spacer(160),
    ]),
  ]);

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
            children: [
              new TextRun({ text: "Vercel + Supabase 전용 구성 가능성 검토", bold: true }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 320 },
            children: [
              new TextRun({
                text: "CIOS — 사용자가 직접 개발·설정해야 하는 항목을 Vercel과 Supabase만으로 구현할 수 있는지에 대한 기술 검토",
                size: 24,
              }),
            ],
          }),

          labelParagraph("결론"),
          bodyParagraph(
            "docs/CIOS-직접-설정-가이드.docx에 정리된, 사용자가 직접 해야 하는 항목 대부분은 Vercel과 Supabase만으로 구현할 수 있습니다. 데이터베이스·인증·저장소·테넌트 격리(RLS)·SSO/SAML·MFA·배포·백업·모니터링은 두 플랫폼의 기본 기능만으로 완전히 해결되고, API 레이트리밋·비동기 계산 처리·AI 서술 생성·증빙 파일 저장은 이미 준비된 팩토리/접점 구조에 구현체를 채우는 코드 작업만으로 Vercel(AI Gateway, Workflow DevKit)과 Supabase(Postgres, Storage) 안에서 해결됩니다.",
          ),
          bodyParagraph(
            "완전히 해결되지 않는 항목은 세 가지뿐입니다. ① 인터랙티브 지도는 Vercel·Supabase 어느 쪽에도 대응 제품이 없어 Mapbox 같은 별도 공급자가 필요합니다(다만 선택 사항이며 없어도 목록형 화면으로 정상 동작). ② 트랜잭션 이메일 발송은 두 플랫폼에 범용 발송 기능이 없어 Resend 같은 이메일 API가 필요합니다(다만 Vercel Marketplace로 설치하면 계정·결제는 Vercel 안에서 통합 관리). ③ 임베딩(의미 검색) 품질을 OpenAI 수준으로 유지하려면 별도 OpenAI 키가 필요합니다(다만 이미 구현된 결정론적 대체 경로로 완전히 벗어날 수도 있음). 유료 배출계수 데이터 라이선스와 제3자 검증·규제 제출은 애초에 인프라 선택과 무관한 사업·법적 절차입니다.",
          ),

          labelParagraph("판정 기준"),
          bulletParagraph("완전 가능 — 추가 개발 없이 Vercel·Supabase의 기본 기능/설정만으로 해결됩니다."),
          bulletParagraph(
            "가능(코드 변경 필요) — Vercel·Supabase가 필요한 기능을 제공하지만, 현재 코드의 팩토리/접점에 실제 구현체를 채우는 개발 작업이 필요합니다.",
          ),
          bulletParagraph("부분 가능 — 핵심은 Vercel·Supabase로 해결되지만 일부 조건에서 여전히 제3자가 필요합니다."),
          bulletParagraph("불가능 — Vercel·Supabase에 대응 제품이 없어 제3자 공급자가 필요합니다."),
          bulletParagraph("인프라와 무관 — 클라우드 플랫폼 선택과 관계없는 데이터 라이선스·법적 절차입니다."),
          spacer(240),

          labelParagraph("표 1. 항목별 판정 요약"),
          renderTable(["항목", "판정"], summaryRows),
          spacer(320),

          labelParagraph("목차"),
          new TableOfContents("목차", { hyperlink: true, headingStyleRange: "1-1" }),

          ...categoryBlocks,

          h1("부록. 이 검토의 근거"),
          bodyParagraph(
            "이 문서의 판정은 Claude Code 세션 내에서 Vercel 공식 스킬 문서(AI Gateway, Firewall/WAF, Workflow DevKit, Marketplace)와 Supabase 공식 문서(supabase.com/docs)를 직접 조회해 확인한 내용을 근거로 합니다. Vercel·Supabase 모두 제품과 요금제가 자주 바뀌므로, 실제 계약·구매 전에는 반드시 각 사의 최신 공식 가격 페이지에서 플랜 조건을 재확인하십시오.",
          ),
          bulletParagraph("Vercel AI Gateway: vercel.com/docs/ai-gateway"),
          bulletParagraph("Vercel Firewall / WAF 레이트리밋: vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk"),
          bulletParagraph("Vercel Queues 요금: vercel.com/docs/queues/pricing"),
          bulletParagraph("Vercel Marketplace: vercel.com/docs/integrations"),
          bulletParagraph("Supabase 엔터프라이즈 SSO: supabase.com/docs/guides/auth/enterprise-sso"),
          bulletParagraph("Supabase PITR: supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery"),
          spacer(200),

          h1("부록. 이 문서 재생성 방법"),
          bodyParagraph(
            "이 문서는 `scripts/generate-vercel-supabase-feasibility.ts`가 생성합니다. 판정이 바뀌면(요금제 변경, 신제품 출시 등) 스크립트를 수정하고 아래 명령으로 다시 생성하십시오.",
          ),
          codeParagraph("npx tsx scripts/generate-vercel-supabase-feasibility.ts"),
        ],
      },
    ],
  });
}

async function main(): Promise<void> {
  const outputPath = resolve(process.cwd(), OUTPUT_PATH);
  mkdirSync(dirname(outputPath), { recursive: true });

  const buffer = await Packer.toBuffer(buildDocument());
  writeFileSync(outputPath, buffer);

  const itemCount = CATEGORIES.reduce((total, category) => total + category.items.length, 0);
  console.log(
    `Wrote ${join(OUTPUT_PATH)} — ${CATEGORIES.length} categories, ${itemCount} items, ${buffer.length.toLocaleString()} bytes.`,
  );
}

const invokedDirectly = (process.argv[1] ?? "").endsWith(
  "generate-vercel-supabase-feasibility.ts",
);
if (invokedDirectly) {
  void main().catch((error: unknown) => {
    console.error("Failed to generate the feasibility review:", error);
    process.exit(1);
  });
}
