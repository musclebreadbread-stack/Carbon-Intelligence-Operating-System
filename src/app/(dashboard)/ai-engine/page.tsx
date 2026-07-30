import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  AlertTriangle,
  SearchCheck,
  ShieldCheck,
  Lightbulb,
  Play,
} from "lucide-react";

const analysisCards = [
  {
    title: "Anomaly Detection",
    description: "AI-powered detection of unusual patterns in emission data and activity records",
    icon: AlertTriangle,
    color: "text-amber-500",
    stats: { total: 12, critical: 2, high: 4, medium: 6 },
    lastRun: "15 minutes ago",
    status: "active",
  },
  {
    title: "Gap Analysis",
    description: "Identify missing data, incomplete reporting periods, and coverage gaps",
    icon: SearchCheck,
    color: "text-blue-500",
    stats: { total: 8, critical: 1, high: 3, medium: 4 },
    lastRun: "1 hour ago",
    status: "active",
  },
  {
    title: "Quality Assessment",
    description: "Evaluate data quality scores, consistency checks, and confidence levels",
    icon: ShieldCheck,
    color: "text-emerald-500",
    stats: { total: 5, critical: 0, high: 2, medium: 3 },
    lastRun: "30 minutes ago",
    status: "active",
  },
  {
    title: "Recommendations",
    description: "AI-generated insights for emission reduction opportunities and process improvements",
    icon: Lightbulb,
    color: "text-purple-500",
    stats: { total: 18, critical: 0, high: 5, medium: 13 },
    lastRun: "2 hours ago",
    status: "active",
  },
];

const recentFindings = [
  { type: "anomaly", severity: "critical", title: "Electricity consumption spike at Plant A", description: "300% increase detected in March data vs. baseline", time: "15 min ago" },
  { type: "gap", severity: "high", title: "Missing Scope 3 Cat 4 data for Q1", description: "Upstream transportation data not submitted", time: "1 hr ago" },
  { type: "quality", severity: "medium", title: "Low confidence in fleet fuel estimates", description: "Estimated data used instead of metered values", time: "2 hrs ago" },
  { type: "recommendation", severity: "high", title: "Switch to renewable electricity tariff", description: "Could reduce Scope 2 by 45% based on market analysis", time: "3 hrs ago" },
  { type: "anomaly", severity: "high", title: "Refrigerant leakage rate above threshold", description: "R-410A top-up frequency suggests equipment issue", time: "5 hrs ago" },
];

export default function AIEnginePage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Engine</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered carbon intelligence for anomaly detection, gap analysis, quality assessment, and recommendations.
          </p>
        </div>
        <Button size="sm">
          <Play className="size-4" />
          Run Analysis
        </Button>
      </div>

      {/* AI Status */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Brain className="size-5 text-purple-500" />
          <div className="flex-1">
            <p className="text-sm font-medium">AI Engine Status: Active</p>
            <p className="text-xs text-muted-foreground">
              Continuous monitoring enabled. Processing 2,400 data points across 18 categories.
            </p>
          </div>
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Online</Badge>
        </CardContent>
      </Card>

      {/* Analysis Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {analysisCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Icon className={`size-4 ${card.color}`} />
                  {card.title}
                </CardDescription>
                <CardTitle className="text-2xl">{card.stats.total}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 text-xs">
                  {card.stats.critical > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {card.stats.critical} critical
                    </Badge>
                  )}
                  {card.stats.high > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {card.stats.high} high
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Last run: {card.lastRun}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Findings */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Findings</CardTitle>
          <CardDescription>AI-generated insights requiring attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentFindings.map((finding, index) => (
              <div key={index} className="flex items-start gap-3 rounded-md border p-3">
                <Badge
                  variant={finding.severity === "critical" ? "destructive" : "outline"}
                  className="mt-0.5 text-xs"
                >
                  {finding.severity}
                </Badge>
                <div className="flex-1">
                  <p className="text-sm font-medium">{finding.title}</p>
                  <p className="text-xs text-muted-foreground">{finding.description}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{finding.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
