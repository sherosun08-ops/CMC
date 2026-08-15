'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, Input, Switch } from '@cmc/ui';
import { Save, Mail, Globe, Shield, Palette, CreditCard, Database, Bell } from 'lucide-react';

const settingsSections = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'storage', label: 'Storage', icon: Database },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('general');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Configure your platform settings</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <Card>
          <CardContent className="p-2">
            <nav className="space-y-1">
              {settingsSections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                      activeSection === section.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </CardContent>
        </Card>

        {/* Content */}
        <Card>
          <CardHeader>
            <CardTitle>
              {settingsSections.find((s) => s.id === activeSection)?.label || 'Settings'}
            </CardTitle>
            <CardDescription>
              {activeSection === 'general' && 'Site name, description, timezone, and locale settings'}
              {activeSection === 'email' && 'SMTP configuration and email templates'}
              {activeSection === 'security' && 'Authentication, rate limiting, and security policies'}
              {activeSection === 'appearance' && 'Brand colors, logo, favicon, and theme customization'}
              {activeSection === 'payments' && 'Payment gateway configuration (Stripe, PayPal, etc.)'}
              {activeSection === 'storage' && 'File storage configuration (S3, local, GCS)'}
              {activeSection === 'notifications' && 'Notification channels and template settings'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {activeSection === 'general' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Site Name</label>
                  <Input defaultValue="CMC Platform" className="max-w-md" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Site Description</label>
                  <Input defaultValue="Content, Media & Commerce Platform" className="max-w-md" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Locale</label>
                  <select className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="en">English (US)</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="es">Español</option>
                    <option value="ar">العربية</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Timezone</label>
                  <select className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern (US)</option>
                    <option value="Europe/London">London</option>
                    <option value="Asia/Dubai">Dubai</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="maintenance" />
                  <label htmlFor="maintenance" className="text-sm">Maintenance Mode</label>
                </div>
              </>
            )}

            {activeSection === 'email' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">SMTP Host</label>
                  <Input defaultValue="smtp.mailtrap.io" className="max-w-md" />
                </div>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">SMTP Port</label>
                    <Input defaultValue="587" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">SMTP Security</label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option>TLS</option>
                      <option>SSL</option>
                      <option>None</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">SMTP Username</label>
                  <Input className="max-w-md" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">SMTP Password</label>
                  <Input type="password" className="max-w-md" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">From Email</label>
                  <Input defaultValue="noreply@cmc.io" className="max-w-md" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="email_enabled" defaultChecked />
                  <label htmlFor="email_enabled" className="text-sm">Enable Email Sending</label>
                </div>
              </>
            )}

            {activeSection === 'security' && (
              <>
                <div className="flex items-center gap-2">
                  <Switch id="tfa" defaultChecked />
                  <label htmlFor="tfa" className="text-sm">Allow Two-Factor Authentication</label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="registration" defaultChecked />
                  <label htmlFor="registration" className="text-sm">Allow Public Registration</label>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rate Limit (requests per minute)</label>
                  <Input type="number" defaultValue="100" className="max-w-xs" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Session Duration (hours)</label>
                  <Input type="number" defaultValue="24" className="max-w-xs" />
                </div>
              </>
            )}

            {activeSection === 'appearance' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Primary Color</label>
                  <div className="flex gap-2 items-center">
                    <div className="w-10 h-10 rounded border bg-primary" />
                    <Input defaultValue="#2563eb" className="max-w-xs font-mono" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Logo URL</label>
                  <Input className="max-w-md" placeholder="https://example.com/logo.png" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Favicon URL</label>
                  <Input className="max-w-md" placeholder="https://example.com/favicon.ico" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="rounded" defaultChecked />
                  <label htmlFor="rounded" className="text-sm">Rounded Corners</label>
                </div>
              </>
            )}

            {activeSection === 'payments' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Currency</label>
                  <select className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="AED">AED - UAE Dirham</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Stripe Secret Key</label>
                  <Input type="password" className="max-w-md" placeholder="sk_live_..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Stripe Webhook Secret</label>
                  <Input type="password" className="max-w-md" placeholder="whsec_..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">PayPal Client ID</label>
                  <Input className="max-w-md" />
                </div>
              </>
            )}

            {activeSection === 'storage' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Storage Driver</label>
                  <select className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="local">Local Filesystem</option>
                    <option value="s3">S3 Compatible</option>
                    <option value="gcs">Google Cloud Storage</option>
                    <option value="azure">Azure Blob Storage</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">S3 Endpoint</label>
                  <Input className="max-w-md" placeholder="https://s3.amazonaws.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">S3 Bucket</label>
                  <Input className="max-w-md" defaultValue="cmc-media" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">S3 Region</label>
                  <Input className="max-w-md" defaultValue="us-east-1" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Access Key ID</label>
                  <Input className="max-w-md" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Secret Access Key</label>
                  <Input type="password" className="max-w-md" />
                </div>
              </>
            )}

            {activeSection === 'notifications' && (
              <>
                <div className="flex items-center gap-2">
                  <Switch id="notify_email" defaultChecked />
                  <label htmlFor="notify_email" className="text-sm">Email Notifications</label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="notify_push" defaultChecked />
                  <label htmlFor="notify_push" className="text-sm">Push Notifications</label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="notify_slack" />
                  <label htmlFor="notify_slack" className="text-sm">Slack Integration</label>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Slack Webhook URL</label>
                  <Input className="max-w-md" placeholder="https://hooks.slack.com/..." />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}