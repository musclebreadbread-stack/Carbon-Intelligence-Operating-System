"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Users, Plug, CreditCard } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your organization settings, team, integrations, and billing.
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <Settings className="mr-1 size-3" />
            General
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="mr-1 size-3" />
            Team
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Plug className="mr-1 size-3" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="mr-1 size-3" />
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Basic organization and platform configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input id="org-name" defaultValue="Acme Corporation" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-slug">URL Slug</Label>
                  <Input id="org-slug" defaultValue="acme-corp" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reporting-year">Reporting Year</Label>
                  <Input id="reporting-year" defaultValue="2024" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="base-year">Base Year</Label>
                  <Input id="base-year" defaultValue="2019" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" defaultValue="USD" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" defaultValue="America/New_York" />
                </div>
              </div>
              <Button size="sm">Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>Manage who has access to your CIOS platform</CardDescription>
                </div>
                <Button size="sm">Invite Member</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "John Doe", email: "john.doe@acme.com", role: "Admin", status: "active" },
                  { name: "Jane Smith", email: "jane.smith@acme.com", role: "Manager", status: "active" },
                  { name: "Bob Wilson", email: "bob.wilson@acme.com", role: "Analyst", status: "active" },
                  { name: "Alice Chen", email: "alice.chen@acme.com", role: "Auditor", status: "active" },
                  { name: "Tom Brown", email: "tom.brown@acme.com", role: "Viewer", status: "invited" },
                ].map((member) => (
                  <div key={member.email} className="flex items-center gap-4 rounded-md border p-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {member.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{member.role}</Badge>
                    <Badge
                      variant={member.status === "active" ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {member.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>Connect external services and data sources</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { name: "SAP ERP", category: "ERP", status: "connected", description: "Activity data sync" },
                  { name: "Salesforce", category: "CRM", status: "connected", description: "Customer carbon data" },
                  { name: "AWS IoT", category: "IoT", status: "connected", description: "Sensor data ingestion" },
                  { name: "Power BI", category: "BI", status: "available", description: "Dashboard embedding" },
                  { name: "Slack", category: "Communication", status: "connected", description: "Alert notifications" },
                  { name: "Jira", category: "Project", status: "available", description: "Task management" },
                ].map((integration) => (
                  <div key={integration.name} className="flex items-center gap-3 rounded-md border p-3">
                    <div className="flex size-10 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                      {integration.name.substring(0, 2)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{integration.name}</p>
                        <Badge variant="outline" className="text-xs">{integration.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{integration.description}</p>
                    </div>
                    <Button
                      variant={integration.status === "connected" ? "secondary" : "outline"}
                      size="xs"
                    >
                      {integration.status === "connected" ? "Connected" : "Connect"}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing & Subscription</CardTitle>
              <CardDescription>Manage your plan and payment information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enterprise Plan</p>
                    <p className="text-xs text-muted-foreground">Unlimited users, all modules, priority support</p>
                  </div>
                  <Badge variant="secondary">Active</Badge>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Monthly Cost</p>
                    <p className="text-lg font-semibold">$4,999/mo</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Next Billing</p>
                    <p className="text-lg font-semibold">Apr 1, 2024</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Payment Method</p>
                    <p className="text-lg font-semibold">Visa ****4242</p>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm">Manage Subscription</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
