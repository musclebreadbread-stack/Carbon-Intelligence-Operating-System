import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, Shield, Users, Key, Eye, AlertTriangle } from "lucide-react";

const rbacRoles = [
  { role: "Admin", users: 3, permissions: "Full access", description: "Complete system administration" },
  { role: "Manager", users: 8, permissions: "Read/Write/Approve", description: "Data management and approval workflows" },
  { role: "Analyst", users: 15, permissions: "Read/Write", description: "Data entry and analysis" },
  { role: "Auditor", users: 4, permissions: "Read/Export", description: "Verification and audit access" },
  { role: "Viewer", users: 22, permissions: "Read Only", description: "Dashboard and report viewing" },
];

const auditLog = [
  { action: "User login", user: "john.doe@acme.com", ip: "192.168.1.45", time: "2 min ago", type: "auth" },
  { action: "Emission data modified", user: "jane.smith@acme.com", ip: "10.0.0.12", time: "15 min ago", type: "data" },
  { action: "API key generated", user: "admin@acme.com", ip: "192.168.1.1", time: "1 hour ago", type: "security" },
  { action: "Report exported", user: "auditor@acme.com", ip: "172.16.0.5", time: "2 hours ago", type: "data" },
  { action: "Role assignment changed", user: "admin@acme.com", ip: "192.168.1.1", time: "3 hours ago", type: "security" },
  { action: "Failed login attempt", user: "unknown@external.com", ip: "45.33.12.88", time: "5 hours ago", type: "alert" },
];

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
          <p className="text-sm text-muted-foreground">
            Role-based access control, audit logs, and data encryption management.
          </p>
        </div>
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
          <Shield className="mr-1 size-3" />
          All Systems Secure
        </Badge>
      </div>

      {/* Security Overview */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="size-3" />
              Total Users
            </CardDescription>
            <CardTitle className="text-2xl">52</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Across 5 role levels</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Key className="size-3" />
              Active Sessions
            </CardDescription>
            <CardTitle className="text-2xl">18</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Currently authenticated</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Eye className="size-3" />
              MFA Enabled
            </CardDescription>
            <CardTitle className="text-2xl">94%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">49 of 52 users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="size-3" />
              Security Alerts
            </CardDescription>
            <CardTitle className="text-2xl">1</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Failed login attempt</p>
          </CardContent>
        </Card>
      </div>

      {/* RBAC Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="size-4" />
            <CardTitle>Role-Based Access Control</CardTitle>
          </div>
          <CardDescription>User roles and permission levels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="grid grid-cols-4 gap-4 border-b bg-muted/50 p-3 text-xs font-medium text-muted-foreground">
              <span>Role</span>
              <span>Permissions</span>
              <span>Description</span>
              <span>Users</span>
            </div>
            {rbacRoles.map((role) => (
              <div key={role.role} className="grid grid-cols-4 gap-4 border-b p-3 text-sm last:border-0">
                <span className="font-medium">{role.role}</span>
                <Badge variant="outline" className="w-fit text-xs">{role.permissions}</Badge>
                <span className="text-muted-foreground">{role.description}</span>
                <span className="font-medium">{role.users}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Encryption Status */}
      <Card>
        <CardHeader>
          <CardTitle>Encryption Status</CardTitle>
          <CardDescription>Data protection and encryption configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Data at Rest", algorithm: "AES-256", status: "active" },
              { label: "Data in Transit", algorithm: "TLS 1.3", status: "active" },
              { label: "Database Encryption", algorithm: "AES-256-GCM", status: "active" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-md border p-3">
                <Shield className="size-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.algorithm}</p>
                </div>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Log</CardTitle>
          <CardDescription>Recent security events and user actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="grid grid-cols-5 gap-4 border-b bg-muted/50 p-3 text-xs font-medium text-muted-foreground">
              <span>Action</span>
              <span>User</span>
              <span>IP Address</span>
              <span>Time</span>
              <span>Type</span>
            </div>
            {auditLog.map((log, index) => (
              <div key={index} className="grid grid-cols-5 gap-4 border-b p-3 text-sm last:border-0">
                <span className="font-medium">{log.action}</span>
                <span className="font-mono text-xs text-muted-foreground">{log.user}</span>
                <span className="font-mono text-xs text-muted-foreground">{log.ip}</span>
                <span className="text-muted-foreground">{log.time}</span>
                <Badge
                  variant={log.type === "alert" ? "destructive" : "outline"}
                  className="w-fit text-xs"
                >
                  {log.type}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
