'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@cmc/ui';
import { Activity, LogIn, LogOut, Edit, Trash2, Plus, Upload, Globe } from 'lucide-react';

const activities = [
  { id: '1', user: 'Admin User', action: 'published', resource: 'Article', target: 'Welcome to Our Platform', time: '2 min ago', icon: Plus },
  { id: '2', user: 'Jane Editor', action: 'updated', resource: 'Product', target: 'Wireless Headphones Pro', time: '15 min ago', icon: Edit },
  { id: '3', user: 'System', action: 'order.completed', resource: 'Order', target: 'ORD-A7F3C2', time: '30 min ago', icon: Activity },
  { id: '4', user: 'John Content', action: 'uploaded', resource: 'Media', target: 'hero-banner.jpg', time: '1 hour ago', icon: Upload },
  { id: '5', user: 'Admin User', action: 'created', resource: 'User', target: 'Sarah Manager', time: '2 hours ago', icon: Plus },
  { id: '6', user: 'Jane Editor', action: 'deleted', resource: 'Page', target: 'Old Landing Page', time: '3 hours ago', icon: Trash2 },
  { id: '7', user: 'System', action: 'login', resource: 'User', target: 'mike@example.com', time: '4 hours ago', icon: LogIn },
  { id: '8', user: 'Sarah Manager', action: 'updated', resource: 'Settings', target: 'Email Configuration', time: '5 hours ago', icon: Edit },
  { id: '9', user: 'System', action: 'webhook', resource: 'Webhook', target: 'Order Sync → Shopify', time: '6 hours ago', icon: Globe },
  { id: '10', user: 'Bob Contributor', action: 'logout', resource: 'Session', target: 'bob@cmc.io', time: '8 hours ago', icon: LogOut },
];

export default function ActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground">Track all actions performed across the platform</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Badge variant="outline">Real-time</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-6">
              {activities.map((activity) => {
                const Icon = activity.icon;
                return (
                  <div key={activity.id} className="relative flex items-start gap-4 pl-12">
                    <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{activity.user}</span>
                        <span className="text-muted-foreground">{activity.action}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{activity.resource}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{activity.target}</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{activity.time}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}