import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, ExternalLink } from "lucide-react";

const frameworks = [
  {
    name: "ISSB",
    fullName: "International Sustainability Standards Board",
    standards: ["IFRS S1", "IFRS S2"],
    status: "in_progress" as const,
    completion: 65,
    dueDate: "2024-12-31",
    description: "Climate-related financial disclosures under IFRS S2",
  },
  {
    name: "CDP",
    fullName: "Carbon Disclosure Project",
    standards: ["Climate Change 2024"],
    status: "in_progress" as const,
    completion: 45,
    dueDate: "2024-07-31",
    description: "Annual climate disclosure questionnaire",
  },
  {
    name: "CSRD",
    fullName: "Corporate Sustainability Reporting Directive",
    standards: ["ESRS E1", "ESRS E2"],
    status: "not_started" as const,
    completion: 10,
    dueDate: "2025-01-01",
    description: "EU mandatory sustainability reporting",
  },
  {
    name: "ESRS",
    fullName: "European Sustainability Reporting Standards",
    standards: ["E1 Climate", "E2 Pollution", "E3 Water"],
    status: "not_started" as const,
    completion: 8,
    dueDate: "2025-01-01",
    description: "Detailed reporting standards under CSRD",
  },
  {
    name: "TCFD",
    fullName: "Task Force on Climate-related Financial Disclosures",
    standards: ["Governance", "Strategy", "Risk Management", "Metrics"],
    status: "submitted" as const,
    completion: 100,
    dueDate: "2024-03-31",
    description: "Climate-related risk and opportunity disclosure",
  },
];

function getStatusColor(status: string) {
  switch (status) {
    case "submitted":
      return "bg-emerald-100 text-emerald-700";
    case "in_progress":
      return "bg-blue-100 text-blue-700";
    case "not_started":
      return "bg-slate-100 text-slate-700";
    default:
      return "";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "in_progress":
      return "In Progress";
    case "not_started":
      return "Not Started";
    default:
      return status;
  }
}

export default function ESGDisclosurePage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ESG Disclosure</h1>
          <p className="text-sm text-muted-foreground">
            Manage compliance with global ESG reporting frameworks and standards.
          </p>
        </div>
        <Button variant="outline" size="sm">
          <FileText className="size-4" />
          Generate Report
        </Button>
      </div>

      {/* Overview */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Frameworks Tracked</CardDescription>
            <CardTitle className="text-2xl">5</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">ISSB, CDP, CSRD, ESRS, TCFD</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Overall Completion</CardDescription>
            <CardTitle className="text-2xl">46%</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={46} className="h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Next Deadline</CardDescription>
            <CardTitle className="text-2xl">Jul 31</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">CDP Climate Change submission</p>
          </CardContent>
        </Card>
      </div>

      {/* Framework Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {frameworks.map((framework) => (
          <Card key={framework.name} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{framework.name}</CardTitle>
                <Badge className={`text-xs ${getStatusColor(framework.status)}`}>
                  {getStatusLabel(framework.status)}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {framework.fullName}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">{framework.description}</p>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Completion</span>
                    <span className="font-medium">{framework.completion}%</span>
                  </div>
                  <Progress value={framework.completion} className="mt-1 h-1.5" />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Due Date</span>
                  <span className="font-medium">{framework.dueDate}</span>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Standards:</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {framework.standards.map((std) => (
                      <Badge key={std} variant="outline" className="text-xs">
                        {std}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Disclosure Timeline Placeholder */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Disclosure Calendar</CardTitle>
            <Button variant="ghost" size="sm">
              <ExternalLink className="size-4" />
              View Full Calendar
            </Button>
          </div>
          <CardDescription>Upcoming submission deadlines and milestones</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-48 items-center justify-center rounded-md border border-dashed bg-muted/50">
            <p className="text-sm text-muted-foreground">Disclosure timeline calendar placeholder</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
