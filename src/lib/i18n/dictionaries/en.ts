/**
 * English dictionary (switchable locale).
 *
 * Must have the same keys as ko.ts (enforced by the type import).
 */

import type { Dictionary } from "./ko";

const en: Dictionary = {
  // App metadata
  "app.title": "CIOS - Carbon Intelligence Operating System",
  "app.description": "AI-native enterprise carbon management platform for GHG Protocol compliance, ESG disclosure, and decarbonization planning.",

  // Common
  "common.loading": "Loading...",
  "common.error": "An error occurred",
  "common.retry": "Retry",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.create": "Create",
  "common.search": "Search",
  "common.filter": "Filter",
  "common.export": "Export",
  "common.import": "Import",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.back": "Back",
  "common.next": "Next",
  "common.previous": "Previous",
  "common.noData": "No data",
  "common.notFound": "Page not found",
  "common.notFoundDescription": "The page you requested does not exist.",
  "common.unexpectedError": "An unexpected error occurred",
  "common.unexpectedErrorDescription": "If this problem persists, contact an administrator.",
  "common.yes": "Yes",
  "common.no": "No",
  "common.all": "All",
  "common.none": "None",
  "common.or": "or",
  "common.and": "and",

  // Auth
  "auth.login": "Sign in",
  "auth.logout": "Sign out",
  "auth.register": "Sign up",
  "auth.forgotPassword": "Forgot password",
  "auth.resetPassword": "Reset password",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.newPassword": "New password",
  "auth.confirmPassword": "Confirm password",
  "auth.signIn": "Sign In",
  "auth.signingIn": "Signing in...",
  "auth.signUp": "Sign Up",
  "auth.signingUp": "Signing up...",
  "auth.continueWithGoogle": "Continue with Google",
  "auth.continueWithMicrosoft": "Continue with Microsoft",
  "auth.orContinueWithEmail": "or continue with email",
  "auth.noAccount": "Don't have an account?",
  "auth.hasAccount": "Already have an account?",
  "auth.welcomeBack": "Welcome back",
  "auth.signInDescription": "Sign in to your Carbon Intelligence account",
  "auth.createAccount": "Create an account",
  "auth.createAccountDescription": "Create your Carbon Intelligence account",
  "auth.forgotPasswordDescription": "Enter your email and we'll send you a password reset link.",
  "auth.resetPasswordDescription": "Enter your new password.",
  "auth.sendResetLink": "Send reset link",
  "auth.sendingResetLink": "Sending...",
  "auth.updatePassword": "Update password",
  "auth.updatingPassword": "Updating...",
  "auth.emailNotConfirmed": "Confirm your email first",
  "auth.emailNotConfirmedDescription": "The account exists but the address has not been verified, so sign-in is blocked. Send yourself another confirmation link.",
  "auth.resendConfirmation": "Resend confirmation email",
  "auth.confirmationSent": "Confirmation link sent",
  "auth.sending": "Sending...",
  "auth.supabaseNotConfigured": "Supabase is not configured, so authentication is unavailable.",
  "auth.supabaseNotice": "This deployment has no Supabase authentication configured. Set environment variables to enable sign-in.",
  "auth.placeholder.email": "name@company.com",
  "auth.placeholder.password": "Enter your password",

  // Callback errors
  "callback.providerError": "The identity provider did not complete sign-in. This usually means consent was declined, or the link had already been used.",
  "callback.missingCode": "The sign-in link is incomplete. Request a new one \u2014 a link can only be followed once, and only before it expires.",
  "callback.exchangeFailed": "The sign-in link could not be verified. It has most likely expired; request a new one.",
  "callback.supabaseUnconfigured": "This deployment has no identity provider configured, so external sign-in cannot complete. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  "callback.unexpected": "Sign-in could not be completed. Please try again.",

  // Header / Shell
  "shell.demoData": "Demo data",
  "shell.liveDatabase": "Live database",
  "shell.demoBadgeTitle": "No database configured \u2014 figures are computed from the bundled sample data",
  "shell.liveBadgeTitle": "Reading from the configured PostgreSQL database",
  "shell.notifications": "Notifications",
  "shell.settings": "Settings",
  "shell.usersAndRoles": "Users and roles",
  "shell.signOut": "Sign out",
  "shell.demoSession": "Demo session \u2014 Supabase is not configured, so this is the bundled administrator account.",
  "shell.guest": "Guest",
  "shell.notSignedIn": "not signed in",
  "shell.noRoles": "no roles assigned",
  "shell.llmOpenAI": "LLM: OpenAI",
  "shell.llmDeterministic": "LLM: deterministic",

  // Sidebar navigation
  "nav.dashboard": "Dashboard",
  "nav.organization": "Organization",
  "nav.masterData": "Master Data",
  "nav.activityData": "Activity Data",
  "nav.emissionEngine": "Emission Engine",
  "nav.emissionFactors": "Emission Factors",
  "nav.digitalMrv": "Digital MRV",
  "nav.verification": "Verification",
  "nav.esgDisclosure": "ESG Disclosure",
  "nav.carbonFinance": "Carbon Finance",
  "nav.aiEngine": "AI Engine",
  "nav.aiRoadmap": "AI Roadmap",
  "nav.aiSimulator": "AI Simulator",
  "nav.aiAgents": "AI Agents",
  "nav.analytics": "Analytics",
  "nav.notifications": "Notifications",
  "nav.apiGateway": "API Gateway",
  "nav.security": "Security",
  "nav.settings": "Settings",
  "nav.sectionOperations": "Operations",
  "nav.sectionCompliance": "Compliance",
  "nav.sectionIntelligence": "Intelligence",
  "nav.sectionSystem": "System",

  // Language
  "language.switch": "Change language",
  "language.korean": "\uD55C\uAD6D\uC5B4",
  "language.english": "English",

  // Demo mode banner
  "demo.banner": "Demo mode",
  "demo.bannerDescription": "No database is configured. Using bundled sample data. All figures are computed by the real calculation engines.",

  // Dashboard
  "dashboard.title": "Dashboard",
  "dashboard.totalEmissions": "Total Emissions",
  "dashboard.scope1": "Scope 1",
  "dashboard.scope2Location": "Scope 2 (location)",
  "dashboard.scope2Market": "Scope 2 (market)",
  "dashboard.scope3": "Scope 3",
  "dashboard.reductionTarget": "Reduction Target",
  "dashboard.inventoryStatus": "Inventory Status",
  "dashboard.recentActivity": "Recent Activity",
  "dashboard.emissionsTrend": "Emissions Trend",
  "dashboard.unit.tCO2e": "tCO2e",

  // Organization
  "org.title": "Organization Management",
  "org.profile": "Organization Profile",
  "org.businessUnits": "Business Units",
  "org.facilities": "Facilities",
  "org.buildings": "Buildings",
  "org.productionLines": "Production Lines",
  "org.equipment": "Equipment",
  "org.emissionSources": "Emission Sources",

  // Master data
  "master.title": "Master Data Management",
  "master.suppliers": "Suppliers",
  "master.products": "Products",
  "master.fuels": "Fuels",
  "master.vehicles": "Vehicles",
  "master.refrigerants": "Refrigerants",
  "master.rawMaterials": "Raw Materials",
  "master.logistics": "Logistics Routes",
  "master.energySources": "Energy Sources",
  "master.wasteTypes": "Waste Types",
  "master.waterSources": "Water Sources",

  // Activity data
  "activity.title": "Activity Data",
  "activity.entries": "Activity Entries",
  "activity.csvImport": "CSV Import",
  "activity.meterReading": "Meter Reading",
  "activity.newEntry": "New Entry",
  "activity.period": "Period",
  "activity.source": "Emission Source",
  "activity.quantity": "Quantity",
  "activity.unit": "Unit",

  // Emission engine
  "engine.title": "Emission Engine",
  "engine.calculate": "Run Calculation",
  "engine.preview": "Preview",
  "engine.publish": "Publish Inventory",
  "engine.inventory": "Inventory",
  "engine.scopeTotals": "Scope Totals",
  "engine.calculationHistory": "Calculation History",
  "engine.rules": "Rule Sets",

  // Emission factors
  "factors.title": "Emission Factor Management",
  "factors.create": "Create Emission Factor",
  "factors.source": "Source",
  "factors.version": "Version",
  "factors.resolution": "Factor Resolution",
  "factors.supersede": "Supersede",
  "factors.unitConvert": "Unit Conversion",

  // Digital MRV
  "mrv.title": "Digital MRV",
  "mrv.monitoring": "Monitoring",
  "mrv.reporting": "Reporting",
  "mrv.verification": "Verification",
  "mrv.dataQuality": "Data Quality",
  "mrv.auditTrail": "Audit Trail",

  // Verification
  "verification.title": "Verification",
  "verification.engagements": "Verification Engagements",
  "verification.findings": "Findings",
  "verification.materiality": "Materiality Assessment",
  "verification.evidence": "Evidence",
  "verification.readiness": "Readiness",

  // ESG Disclosure
  "disclosure.title": "ESG Disclosure",
  "disclosure.reports": "Reports",
  "disclosure.generate": "Generate Report",
  "disclosure.frameworks": "Frameworks",
  "disclosure.dataPoints": "Data Points",
  "disclosure.completeness": "Completeness",

  // Carbon Finance
  "finance.title": "Carbon Finance",
  "finance.credits": "Carbon Credits",
  "finance.retire": "Retire Credits",
  "finance.carbonPrice": "Internal Carbon Price",
  "finance.netEmissions": "Net Emissions",
  "finance.grossEmissions": "Gross Emissions",
  "finance.retiredCredits": "Retired Credits",

  // AI Engine
  "ai.title": "AI Engine",
  "ai.analysis": "Analysis",
  "ai.anomalyDetection": "Anomaly Detection",
  "ai.recommendations": "Recommendations",
  "ai.dataQuality": "Data Quality",

  // AI Roadmap
  "roadmap.title": "AI Roadmap",
  "roadmap.build": "Build Roadmap",
  "roadmap.investment": "Investment Analysis",
  "roadmap.macc": "Marginal Abatement Cost Curve",
  "roadmap.portfolio": "Portfolio",

  // AI Simulator
  "simulator.title": "AI Simulator",
  "simulator.scenarios": "Scenarios",
  "simulator.projection": "Projection",
  "simulator.compare": "Compare",
  "simulator.carbonBudget": "Carbon Budget",

  // AI Agents
  "agents.title": "AI Agents",
  "agents.tasks": "Tasks",
  "agents.dataSources": "Data Sources",
  "agents.create": "Create Agent",
  "agents.execute": "Execute",

  // Analytics
  "analytics.title": "Analytics",
  "analytics.trends": "Trends",
  "analytics.benchmarks": "Benchmarks",
  "analytics.insights": "Insights",

  // Notifications
  "notifications.title": "Notifications",
  "notifications.unread": "Unread",
  "notifications.markRead": "Mark as read",
  "notifications.empty": "No notifications",

  // API Gateway
  "apiGateway.title": "API Gateway",
  "apiGateway.keys": "API Keys",
  "apiGateway.usage": "Usage",
  "apiGateway.rateLimit": "Rate Limit",
  "apiGateway.status": "Status",
  "apiGateway.writable": "Writable",

  // Security
  "security.title": "Security",
  "security.users": "Users",
  "security.roles": "Roles",
  "security.permissions": "Permissions",
  "security.apiKeys": "API Keys",
  "security.auditLog": "Audit Log",

  // Settings
  "settings.title": "Settings",
  "settings.general": "General",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "settings.integrations": "Integrations",
  "settings.environment": "Environment Status",

  // Targets
  "targets.title": "Targets",
  "targets.create": "Create Target",
  "targets.pathway": "Pathway",
  "targets.progress": "Progress",
  "targets.netZero": "Net Zero",

  // Scope labels
  "scope.scope1": "Scope 1",
  "scope.scope2Location": "Scope 2 (location)",
  "scope.scope2Market": "Scope 2 (market)",
  "scope.scope3": "Scope 3",

  // Format
  "format.na": "\u2014",

  // Landing page
  "landing.title": "Carbon Intelligence Operating System",
  "landing.subtitle": "AI-native enterprise carbon management platform",
  "landing.cta": "Get Started",
  "landing.features": "Key Features",
  "landing.feature.ghg": "GHG Protocol compliant emission calculation",
  "landing.feature.ai": "AI-powered decarbonization roadmap",
  "landing.feature.disclosure": "ESG disclosure automation",
  "landing.feature.mrv": "Digital MRV framework",

  // Table
  "table.noResults": "No results",
  "table.loading": "Loading data...",
  "table.rowsPerPage": "Rows per page",
  "table.page": "Page",
  "table.of": "of",
  "table.showing": "Showing",

  // Forms
  "form.required": "This field is required",
  "form.invalid": "Invalid value",
  "form.submit": "Submit",
  "form.submitting": "Submitting...",

  // Action messages
  "action.success": "Completed successfully",
  "action.error": "An error occurred while processing",

  // Test account
  "testAccount.title": "Test Account",
  "testAccount.description": "Supabase is not configured — running in demo mode. Use the built-in account below to test all features.",
  "testAccount.email": "Email",
  "testAccount.emailValue": "admin@example.com",
  "testAccount.name": "Name",
  "testAccount.nameValue": "Demo Administrator",
  "testAccount.role": "Role",
  "testAccount.roleValue": "Organization Admin (full access)",
  "testAccount.password": "No password needed — automatic login",
  "testAccount.cta": "Go to dashboard",

  "action.error.UNAUTHORIZED": "Your session has expired. Sign in again to continue.",
  "action.error.FORBIDDEN": "You do not have permission to do this. Ask an administrator to grant it.",
  "action.error.VALIDATION_ERROR": "Some values need attention before this can be saved.",
  "action.error.NOT_FOUND": "That record no longer exists. Reload the page and try again.",
  "action.error.CONFLICT": "Someone else changed this record. Reload the page and try again.",
  "action.error.DEMO_MODE": "No database is configured, so this change was not saved. Every figure shown is still computed from the bundled sample data by the real calculation engines.",
  "action.error.RATE_LIMITED": "Too many requests. Wait a moment and try again.",
  "action.error.INTERNAL_ERROR": "Something went wrong. The change was not saved.",
  "action.error.LLM_ERROR": "The language model is unavailable, so no narrative was generated. The numeric result is unaffected.",
  "action.error.LLM_NOT_CONFIGURED": "No OPENAI_API_KEY is configured, so narrative text is generated deterministically.",
  "action.error.CALCULATION_ERROR": "The calculation could not be completed with the values supplied.",
};

export default en;
