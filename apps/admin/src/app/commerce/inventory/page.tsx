'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, Input, EmptyState } from '@cmc/ui';
import { Search, Package, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

const mockInventory = [
  { id: '1', product: 'Wireless Headphones Pro', sku: 'WH-PRO-001', stock: 45, reserved: 3, available: 42, threshold: 5, status: 'in_stock' },
  { id: '2', product: 'Organic Cotton T-Shirt', sku: 'OCT-2024', stock: 120, reserved: 8, available: 112, threshold: 10, status: 'in_stock' },
  { id: '3', product: 'Running Shoes Ultra', sku: 'RS-ULTRA-01', stock: 0, reserved: 0, available: 0, threshold: 5, status: 'out_of_stock' },
  { id: '4', product: 'Smart Watch Series 3', sku: 'SWS-3-2024', stock: 23, reserved: 5, available: 18, threshold: 5, status: 'in_stock' },
  { id: '5', product: 'Yoga Mat Premium', sku: 'YMP-001', stock: 3, reserved: 1, available: 2, threshold: 5, status: 'low_stock' },
  { id: '6', product: 'Bluetooth Speaker Mini', sku: 'BSM-2024', stock: 0, reserved: 0, available: 0, threshold: 10, status: 'out_of_stock' },
];

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const filtered = mockInventory.filter((i) => i.product.toLowerCase().includes(search.toLowerCase()) || i.sku.includes(search));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Stock management across all warehouses</p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>Refresh Stock</Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold">191</p>
              </div>
              <Package className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-2xl font-bold text-green-500">174</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Low Stock</p>
                <p className="text-2xl font-bold text-yellow-500">2</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Out of Stock</p>
                <p className="text-2xl font-bold text-red-500">2</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search inventory..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-3 font-medium">Product</th>
                  <th className="text-left py-3 font-medium">SKU</th>
                  <th className="text-left py-3 font-medium">Stock</th>
                  <th className="text-left py-3 font-medium">Reserved</th>
                  <th className="text-left py-3 font-medium">Available</th>
                  <th className="text-left py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 font-medium">{item.product}</td>
                    <td className="py-3 text-muted-foreground font-mono text-xs">{item.sku}</td>
                    <td className="py-3">{item.stock}</td>
                    <td className="py-3">{item.reserved}</td>
                    <td className="py-3 font-medium">{item.available}</td>
                    <td className="py-3">
                      <Badge variant={item.status === 'in_stock' ? 'success' : item.status === 'low_stock' ? 'warning' : 'destructive'}>
                        {item.status.replace('_', ' ')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}