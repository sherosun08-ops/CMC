'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from '@cmc/ui';
import { 
  DollarSign, ShoppingCart, Users, FileText, TrendingUp, TrendingDown,
  Activity, Package, Eye, Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

// Simple inline chart components to avoid recharts import issues
function MiniBarChart({ data, height = 60 }: { data: number[]; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((value, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-primary/30"
          style={{ height: `${(value / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function MiniLineChart({ data, height = 60 }: { data: number[]; height?: number }) {
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${(1 - v / max) * 100}`);
  const path = `M${points.join(' L')}`;
  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" style={{ height }}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
      <path d={`${path} L100,100 L0,100 Z`} fill="currentColor" className="text-primary/10" />
    </svg>
  );
}

const stats = [
  {
    title: 'Total Revenue',
    value: '$128,430',
    change: '+12.5%',
    trend: 'up',
    icon: DollarSign,
    chart: [45, 52, 48, 65, 58, 72, 68],
    color: 'text-green-500',
  },
  {
    title: 'Orders',
    value: '1,429',
    change: '+8.2%',
    trend: 'up',
    icon: ShoppingCart,
    chart: [30, 35, 28, 42, 38, 45, 50],
    color: 'text-blue-500',
  },
  {
    title: 'Products',
    value: '3,721',
    change: '+3.1%',
    trend: 'up',
    icon: Package,
    chart: [10, 12, 11, 14, 13, 15, 18],
    color: 'text-purple-500',
  },
  {
    title: 'Active Users',
    value: '847',
    change: '-2.4%',
    trend: 'down',
    icon: Users,
    chart: [40, 38, 42, 35, 37, 33, 30],
    color: 'text-orange-500',
  },
];

const recentOrders = [
  { id: 'ORD-A7F3', customer: 'John Smith', product: 'Wireless Headphones', amount: 129.99, status: 'completed', date: '2 min ago' },
  { id: 'ORD-B2E1', customer: 'Sarah Johnson', product: 'Cotton T-Shirt Pack', amount: 49.99, status: 'processing', date: '15 min ago' },
  { id: 'ORD-C9D4', customer: 'Mike Chen', product: 'Running Shoes', amount: 189.99, status: 'completed', date: '1 hour ago' },
  { id: 'ORD-D5F8', customer: 'Emily Davis', product: 'Yoga Mat + Blocks', amount: 79.99, status: 'pending', date: '2 hours ago' },
  { id: 'ORD-E3G7', customer: 'Alex Wilson', product: 'Smart Watch Pro', amount: 349.99, status: 'processing', date: '3 hours ago' },
];

const recentContent = [
  { title: 'Welcome to Our New Store', status: 'published', author: 'Admin', updated: '1 hour ago' },
  { title: 'Summer Collection 2026', status: 'draft', author: 'Editor', updated: '3 hours ago' },
  { title: 'Shipping Policy Update', status: 'published', author: 'Admin', updated: '5 hours ago' },
  { title: 'About Us Redesign', status: 'review', author: 'Designer', updated: '1 day ago' },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s what&apos;s happening with your platform today.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const TrendIcon = stat.trend === 'up' ? TrendingUp : TrendingDown;
          return (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  <TrendIcon className={`h-3 w-3 ${stat.color}`} />
                  <span className={stat.color}>{stat.change}</span>
                  <span className="text-muted-foreground">vs last month</span>
                </div>
                <div className="mt-3">
                  <MiniBarChart data={stat.chart} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardDescription>Weekly revenue for the past 3 months</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniLineChart data={[30, 45, 38, 52, 48, 65, 58, 72, 68, 82, 75, 90]} height={200} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Traffic Sources</CardTitle>
            <CardDescription>Where your visitors come from</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Direct', value: 35, color: 'bg-blue-500' },
                { name: 'Organic Search', value: 28, color: 'bg-green-500' },
                { name: 'Social Media', value: 20, color: 'bg-purple-500' },
                { name: 'Referral', value: 12, color: 'bg-orange-500' },
                { name: 'Email', value: 5, color: 'bg-pink-500' },
              ].map((source) => (
                <div key={source.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{source.name}</span>
                    <span className="font-medium">{source.value}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${source.color} rounded-full`} style={{ width: `${source.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Latest 5 orders across all stores</CardDescription>
            </div>
            <Badge variant="outline">Live</Badge>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 font-medium">Order</th>
                    <th className="text-left py-2 font-medium">Customer</th>
                    <th className="text-left py-2 font-medium">Amount</th>
                    <th className="text-left py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{order.id}</td>
                      <td className="py-2 text-muted-foreground">{order.customer}</td>
                      <td className="py-2">${order.amount}</td>
                      <td className="py-2">
                        <Badge variant={
                          order.status === 'completed' ? 'success' :
                          order.status === 'processing' ? 'info' : 'warning'
                        }>
                          {order.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Content Updates</CardTitle>
            <CardDescription>Latest changes to your content</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentContent.map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      By {item.author} &middot; {item.updated}
                    </p>
                  </div>
                  <Badge variant={
                    item.status === 'published' ? 'success' :
                    item.status === 'review' ? 'warning' : 'secondary'
                  }>
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'New Product', icon: Package, href: '/commerce/products/new', color: 'bg-blue-500' },
              { label: 'New Page', icon: FileText, href: '/cms/pages/new', color: 'bg-green-500' },
              { label: 'New Order', icon: ShoppingCart, href: '/commerce/orders/new', color: 'bg-purple-500' },
              { label: 'Upload Media', icon: Image, href: '/media', color: 'bg-orange-500' },
            ].map((action, i) => (
              <a
                key={i}
                href={action.href}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors"
              >
                <div className={`w-10 h-10 rounded-full ${action.color} flex items-center justify-center`}>
                  <action.icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-sm font-medium">{action.label}</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}