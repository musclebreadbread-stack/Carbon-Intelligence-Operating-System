/**
 * Korean dictionary (default locale).
 *
 * Every key present here MUST also exist in en.ts (enforced by types).
 */

const ko = {
  // App metadata
  "app.title": "CIOS - 탄소 인텔리전스 운영 시스템",
  "app.description": "AI 기반 기업 탄소 관리 플랫폼 - GHG Protocol 준수, ESG 공시, 탈탄소 계획 수립",

  // Common
  "common.loading": "로딩 중...",
  "common.error": "오류가 발생했습니다",
  "common.retry": "다시 시도",
  "common.save": "저장",
  "common.cancel": "취소",
  "common.delete": "삭제",
  "common.edit": "수정",
  "common.create": "생성",
  "common.search": "검색",
  "common.filter": "필터",
  "common.export": "내보내기",
  "common.import": "가져오기",
  "common.close": "닫기",
  "common.confirm": "확인",
  "common.back": "뒤로",
  "common.next": "다음",
  "common.previous": "이전",
  "common.noData": "데이터 없음",
  "common.notFound": "페이지를 찾을 수 없습니다",
  "common.notFoundDescription": "요청하신 페이지가 존재하지 않습니다.",
  "common.unexpectedError": "예상치 못한 오류가 발생했습니다",
  "common.unexpectedErrorDescription": "문제가 지속되면 관리자에게 문의하세요.",
  "common.yes": "예",
  "common.no": "아니오",
  "common.all": "전체",
  "common.none": "없음",
  "common.or": "또는",
  "common.and": "및",

  // Auth
  "auth.login": "로그인",
  "auth.logout": "로그아웃",
  "auth.register": "회원가입",
  "auth.forgotPassword": "비밀번호 찾기",
  "auth.resetPassword": "비밀번호 재설정",
  "auth.email": "이메일",
  "auth.password": "비밀번호",
  "auth.newPassword": "새 비밀번호",
  "auth.confirmPassword": "비밀번호 확인",
  "auth.signIn": "로그인",
  "auth.signingIn": "로그인 중...",
  "auth.signUp": "회원가입",
  "auth.signingUp": "가입 중...",
  "auth.continueWithGoogle": "Google로 계속",
  "auth.continueWithMicrosoft": "Microsoft로 계속",
  "auth.orContinueWithEmail": "또는 이메일로 계속",
  "auth.noAccount": "계정이 없으신가요?",
  "auth.hasAccount": "이미 계정이 있으신가요?",
  "auth.welcomeBack": "다시 오신 것을 환영합니다",
  "auth.signInDescription": "Carbon Intelligence 계정에 로그인하세요",
  "auth.createAccount": "계정 만들기",
  "auth.createAccountDescription": "Carbon Intelligence 계정을 생성하세요",
  "auth.forgotPasswordDescription": "이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.",
  "auth.resetPasswordDescription": "새 비밀번호를 입력하세요.",
  "auth.sendResetLink": "재설정 링크 전송",
  "auth.sendingResetLink": "전송 중...",
  "auth.updatePassword": "비밀번호 변경",
  "auth.updatingPassword": "변경 중...",
  "auth.emailNotConfirmed": "이메일을 먼저 인증하세요",
  "auth.emailNotConfirmedDescription": "계정은 존재하지만 이메일 주소가 인증되지 않아 로그인이 차단됩니다. 새 인증 링크를 보내세요.",
  "auth.resendConfirmation": "인증 이메일 재전송",
  "auth.confirmationSent": "인증 링크 전송 완료",
  "auth.sending": "전송 중...",
  "auth.supabaseNotConfigured": "Supabase가 구성되지 않아 인증 기능을 사용할 수 없습니다.",
  "auth.supabaseNotice": "이 배포에는 Supabase 인증이 구성되어 있지 않습니다. 환경 변수를 설정하여 로그인을 활성화하세요.",
  "auth.placeholder.email": "name@company.com",
  "auth.placeholder.password": "비밀번호를 입력하세요",

  // Callback errors
  "callback.providerError": "ID 제공자가 로그인을 완료하지 않았습니다. 일반적으로 동의가 거부되었거나 링크가 이미 사용된 경우입니다.",
  "callback.missingCode": "로그인 링크가 불완전합니다. 새 링크를 요청하세요. 링크는 한 번만, 만료 전에만 사용할 수 있습니다.",
  "callback.exchangeFailed": "로그인 링크를 확인할 수 없습니다. 만료되었을 가능성이 높으니 새 링크를 요청하세요.",
  "callback.supabaseUnconfigured": "이 배포에는 ID 제공자가 구성되어 있지 않아 외부 로그인을 완료할 수 없습니다. NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정하세요.",
  "callback.unexpected": "로그인을 완료할 수 없습니다. 다시 시도해 주세요.",

  // Header / Shell
  "shell.demoData": "데모 데이터",
  "shell.liveDatabase": "실제 데이터베이스",
  "shell.demoBadgeTitle": "데이터베이스 미구성 - 내장 샘플 데이터로 계산된 수치입니다",
  "shell.liveBadgeTitle": "구성된 PostgreSQL 데이터베이스에서 읽는 중입니다",
  "shell.notifications": "알림",
  "shell.settings": "설정",
  "shell.usersAndRoles": "사용자 및 역할",
  "shell.signOut": "로그아웃",
  "shell.demoSession": "데모 세션 - Supabase가 구성되지 않아 내장 관리자 계정입니다.",
  "shell.guest": "게스트",
  "shell.notSignedIn": "로그인하지 않음",
  "shell.noRoles": "할당된 역할 없음",
  "shell.llmOpenAI": "LLM: OpenAI",
  "shell.llmDeterministic": "LLM: 결정론적",

  // Sidebar navigation
  "nav.dashboard": "대시보드",
  "nav.organization": "조직",
  "nav.masterData": "기준정보",
  "nav.activityData": "활동 데이터",
  "nav.emissionEngine": "배출 엔진",
  "nav.emissionFactors": "배출계수",
  "nav.digitalMrv": "디지털 MRV",
  "nav.verification": "검증",
  "nav.esgDisclosure": "ESG 공시",
  "nav.carbonFinance": "탄소 금융",
  "nav.aiEngine": "AI 엔진",
  "nav.aiRoadmap": "AI 로드맵",
  "nav.aiSimulator": "AI 시뮬레이터",
  "nav.aiAgents": "AI 에이전트",
  "nav.analytics": "분석",
  "nav.notifications": "알림",
  "nav.apiGateway": "API 게이트웨이",
  "nav.security": "보안",
  "nav.settings": "설정",
  "nav.sectionOperations": "운영",
  "nav.sectionCompliance": "컴플라이언스",
  "nav.sectionIntelligence": "인텔리전스",
  "nav.sectionSystem": "시스템",

  // Language
  "language.switch": "언어 변경",
  "language.korean": "한국어",
  "language.english": "English",

  // Demo mode banner
  "demo.banner": "데모 모드",
  "demo.bannerDescription": "데이터베이스가 구성되지 않아 내장 샘플 데이터를 사용 중입니다. 모든 수치는 실제 계산 엔진으로 계산됩니다.",

  // Dashboard
  "dashboard.title": "대시보드",
  "dashboard.totalEmissions": "총 배출량",
  "dashboard.scope1": "Scope 1",
  "dashboard.scope2Location": "Scope 2 (위치기반)",
  "dashboard.scope2Market": "Scope 2 (시장기반)",
  "dashboard.scope3": "Scope 3",
  "dashboard.reductionTarget": "감축 목표",
  "dashboard.inventoryStatus": "인벤토리 현황",
  "dashboard.recentActivity": "최근 활동",
  "dashboard.emissionsTrend": "배출량 추세",
  "dashboard.unit.tCO2e": "tCO2e",

  // Organization
  "org.title": "조직 관리",
  "org.profile": "조직 프로필",
  "org.businessUnits": "사업부",
  "org.facilities": "사업장",
  "org.buildings": "건물",
  "org.productionLines": "생산라인",
  "org.equipment": "설비",
  "org.emissionSources": "배출원",

  // Master data
  "master.title": "기준정보 관리",
  "master.suppliers": "공급업체",
  "master.products": "제품",
  "master.fuels": "연료",
  "master.vehicles": "차량",
  "master.refrigerants": "냉매",
  "master.rawMaterials": "원자재",
  "master.logistics": "물류 경로",
  "master.energySources": "에너지원",
  "master.wasteTypes": "폐기물 유형",
  "master.waterSources": "수자원",

  // Activity data
  "activity.title": "활동 데이터",
  "activity.entries": "활동 항목",
  "activity.csvImport": "CSV 가져오기",
  "activity.meterReading": "계량기 검침",
  "activity.newEntry": "새 항목",
  "activity.period": "기간",
  "activity.source": "배출원",
  "activity.quantity": "수량",
  "activity.unit": "단위",

  // Emission engine
  "engine.title": "배출 엔진",
  "engine.calculate": "계산 실행",
  "engine.preview": "미리보기",
  "engine.publish": "인벤토리 발행",
  "engine.inventory": "인벤토리",
  "engine.scopeTotals": "Scope별 합계",
  "engine.calculationHistory": "계산 이력",
  "engine.rules": "규칙 세트",

  // Emission factors
  "factors.title": "배출계수 관리",
  "factors.create": "배출계수 등록",
  "factors.source": "출처",
  "factors.version": "버전",
  "factors.resolution": "계수 결정",
  "factors.supersede": "대체",
  "factors.unitConvert": "단위 변환",

  // Digital MRV
  "mrv.title": "디지털 MRV",
  "mrv.monitoring": "모니터링",
  "mrv.reporting": "보고",
  "mrv.verification": "검증",
  "mrv.dataQuality": "데이터 품질",
  "mrv.auditTrail": "감사 추적",

  // Verification
  "verification.title": "검증",
  "verification.engagements": "검증 계약",
  "verification.findings": "발견사항",
  "verification.materiality": "중요성 평가",
  "verification.evidence": "증빙",
  "verification.readiness": "준비도",

  // ESG Disclosure
  "disclosure.title": "ESG 공시",
  "disclosure.reports": "보고서",
  "disclosure.generate": "보고서 생성",
  "disclosure.frameworks": "프레임워크",
  "disclosure.dataPoints": "데이터 포인트",
  "disclosure.completeness": "완성도",

  // Carbon Finance
  "finance.title": "탄소 금융",
  "finance.credits": "탄소 크레딧",
  "finance.retire": "크레딧 상각",
  "finance.carbonPrice": "내부 탄소가격",
  "finance.netEmissions": "순 배출량",
  "finance.grossEmissions": "총 배출량",
  "finance.retiredCredits": "상각된 크레딧",

  // AI Engine
  "ai.title": "AI 엔진",
  "ai.analysis": "분석",
  "ai.anomalyDetection": "이상 감지",
  "ai.recommendations": "권고사항",
  "ai.dataQuality": "데이터 품질",

  // AI Roadmap
  "roadmap.title": "AI 로드맵",
  "roadmap.build": "로드맵 생성",
  "roadmap.investment": "투자 분석",
  "roadmap.macc": "한계저감비용 곡선",
  "roadmap.portfolio": "포트폴리오",

  // AI Simulator
  "simulator.title": "AI 시뮬레이터",
  "simulator.scenarios": "시나리오",
  "simulator.projection": "전망",
  "simulator.compare": "비교",
  "simulator.carbonBudget": "탄소 예산",

  // AI Agents
  "agents.title": "AI 에이전트",
  "agents.tasks": "작업",
  "agents.dataSources": "데이터 소스",
  "agents.create": "에이전트 생성",
  "agents.execute": "실행",

  // Analytics
  "analytics.title": "분석",
  "analytics.trends": "추세",
  "analytics.benchmarks": "벤치마크",
  "analytics.insights": "인사이트",

  // Notifications
  "notifications.title": "알림",
  "notifications.unread": "읽지 않음",
  "notifications.markRead": "읽음 표시",
  "notifications.empty": "알림이 없습니다",

  // API Gateway
  "apiGateway.title": "API 게이트웨이",
  "apiGateway.keys": "API 키",
  "apiGateway.usage": "사용량",
  "apiGateway.rateLimit": "요청 제한",
  "apiGateway.status": "상태",
  "apiGateway.writable": "쓰기 가능",

  // Security
  "security.title": "보안",
  "security.users": "사용자",
  "security.roles": "역할",
  "security.permissions": "권한",
  "security.apiKeys": "API 키",
  "security.auditLog": "감사 로그",

  // Settings
  "settings.title": "설정",
  "settings.general": "일반",
  "settings.language": "언어",
  "settings.theme": "테마",
  "settings.integrations": "연동",
  "settings.environment": "환경 상태",

  // Targets
  "targets.title": "목표",
  "targets.create": "목표 설정",
  "targets.pathway": "경로",
  "targets.progress": "진행률",
  "targets.netZero": "넷제로",

  // Scope labels
  "scope.scope1": "Scope 1",
  "scope.scope2Location": "Scope 2 (위치기반)",
  "scope.scope2Market": "Scope 2 (시장기반)",
  "scope.scope3": "Scope 3",

  // Format
  "format.na": "\u2014",

  // Landing page
  "landing.title": "탄소 인텔리전스 운영 시스템",
  "landing.subtitle": "AI 기반 기업 탄소 관리 플랫폼",
  "landing.cta": "시작하기",
  "landing.features": "주요 기능",
  "landing.feature.ghg": "GHG Protocol 준수 배출량 산정",
  "landing.feature.ai": "AI 기반 감축 로드맵 수립",
  "landing.feature.disclosure": "ESG 공시 자동화",
  "landing.feature.mrv": "디지털 MRV 체계",

  // Table
  "table.noResults": "결과가 없습니다",
  "table.loading": "데이터를 불러오는 중...",
  "table.rowsPerPage": "페이지당 행 수",
  "table.page": "페이지",
  "table.of": "/",
  "table.showing": "표시 중",

  // Forms
  "form.required": "필수 항목입니다",
  "form.invalid": "유효하지 않은 값입니다",
  "form.submit": "제출",
  "form.submitting": "제출 중...",

  // Action messages
  "action.success": "성공적으로 처리되었습니다",
  "action.error": "처리 중 오류가 발생했습니다",

  // Test account
  "testAccount.title": "테스트 계정",
  "testAccount.description": "Supabase가 구성되지 않아 데모 모드로 동작합니다. 아래 내장 계정으로 모든 기능을 테스트할 수 있습니다.",
  "testAccount.email": "이메일",
  "testAccount.emailValue": "admin@example.com",
  "testAccount.name": "이름",
  "testAccount.nameValue": "데모 관리자",
  "testAccount.role": "역할",
  "testAccount.roleValue": "조직 관리자 (전체 권한)",
  "testAccount.password": "비밀번호 불필요 — 자동 로그인",
  "testAccount.cta": "대시보드로 이동",

  "action.error.UNAUTHORIZED": "세션이 만료되었습니다. 다시 로그인해 주세요.",
  "action.error.FORBIDDEN": "권한이 없습니다. 관리자에게 권한 부여를 요청하세요.",
  "action.error.VALIDATION_ERROR": "저장하기 전에 확인이 필요한 값이 있습니다.",
  "action.error.NOT_FOUND": "해당 레코드가 존재하지 않습니다. 페이지를 새로고침한 후 다시 시도하세요.",
  "action.error.CONFLICT": "다른 사용자가 이 레코드를 변경했습니다. 페이지를 새로고침한 후 다시 시도하세요.",
  "action.error.DEMO_MODE": "데이터베이스가 구성되지 않아 변경 내용이 저장되지 않았습니다. 화면의 모든 수치는 내장 샘플 데이터를 실제 계산 엔진으로 계산한 값입니다.",
  "action.error.RATE_LIMITED": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "action.error.INTERNAL_ERROR": "오류가 발생했습니다. 변경 내용이 저장되지 않았습니다.",
  "action.error.LLM_ERROR": "언어 모델을 사용할 수 없어 서술이 생성되지 않았습니다. 수치 결과에는 영향이 없습니다.",
  "action.error.LLM_NOT_CONFIGURED": "OPENAI_API_KEY가 설정되지 않아 서술이 결정론적으로 생성됩니다.",
  "action.error.CALCULATION_ERROR": "제공된 값으로 계산을 완료할 수 없습니다.",
} as const;

export type Dictionary = { readonly [K in keyof typeof ko]: string };
export type DictionaryKey = keyof typeof ko;
export default ko;
