'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Input, EmptyState } from '@cmc/ui';
import { Search, ShoppingCart, Eye, Edit, MoreHorizontal, ArrowUpDown } from 'lucide-react';

const mockOrders = [
  { id: 'ORD-A7F3C2', customer: 'John Smith', items: 3, total: 259.97, status: 'completed', payment: 'paid', date: '2026-08-15' },
  { id: 'ORD-B2E1D9', customer: 'Sarah Johnson', items: 1, total: 49.99, status: 'processing', payment: 'authorized', date: '2026-08-15' },
  { id: 'ORD-C9D4F5', customer: 'Mike Chen', items: 2, total: 189.99, status: 'completed', payment: 'paid', date: '2026-08-14' },
  { id: 'ORD-D5F8A1', customer: 'Emily Davis', items: 4, total: 145.50, status: 'pending', payment: 'awaiting', date: '2026-08-14' },
  { id: 'ORD-E3G7B8', customer: 'Alex Wilson', items: 1, total: 349.99, status: 'processing', payment: 'authorized', date: '2026-08-13' },
  { id: 'ORD-F2H4C6', customer: 'Lisa Brown', items: 2, total: 89.98, status: 'cancelled', payment: 'refunded', date: '2026-08-13' },
];

const statusVariant: Record<string, 'success' | 'info' | 'warning' | 'destructive' | 'secondary'> = {
  completed: 'success',
  processing: 'info',
  pending: 'warning',
  cancelled: 'destructive',
};

export default function OrdersPage() {
  const [search, setSearch] = useState('');

  const filtered = mockOrders.filter((o) =>
    o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
    o.customer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Manage customer orders and fulfillment</p>
        </div>
        <Badge variant="outline" className="h-9 px-3">
          {mockOrders.length} total orders
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search orders by number or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState title="No orders found" description={search ? 'Try different search terms' : 'No orders yet'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 font-medium">Order</th>
                    <th className="text-left py-3 font-medium">Customer</th>
                    <th className="text-left py-3 font-medium">Items</th>
                    <th className="text-left py-3 font-medium">Total</th>
                    <th className="text-left py-3 font-medium">Status</th>
                    <th className="text-left py-3 font-medium">Payment</th>
                    <th className="text-left py-3 font-medium">Date</th>
                    <th className="text-right py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 font-medium font-mono text-xs">{order.id}</td>
                      <td className="py-3">{order.customer}</td>
                      <td className="py-3">{order.items}</td>
                      <td className="py-3 font-medium">${order.total.toFixed(2)}</td>
                      <td className="py-3">
                        <Badge variant={statusVariant[order.status]}>{order.status}</Badge>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline">{order.payment}</Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">{order.date}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}