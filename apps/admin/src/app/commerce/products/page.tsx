'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Input, EmptyState, LoadingState } from '@cmc/ui';
import { Plus, Search, Package, Edit, Trash2, Eye, MoreHorizontal, ArrowUpDown, Image } from 'lucide-react';

const mockProducts = [
  { id: '1', title: 'Wireless Headphones Pro', sku: 'WH-PRO-001', price: 129.99, stock: 45, status: 'active', image: null },
  { id: '2', title: 'Organic Cotton T-Shirt', sku: 'OCT-2024', price: 29.99, stock: 120, status: 'active', image: null },
  { id: '3', title: 'Running Shoes Ultra', sku: 'RS-ULTRA-01', price: 189.99, stock: 0, status: 'out_of_stock', image: null },
  { id: '4', title: 'Smart Watch Series 3', sku: 'SWS-3-2024', price: 349.99, stock: 23, status: 'active', image: null },
  { id: '5', title: 'Yoga Mat Premium', sku: 'YMP-001', price: 69.99, stock: 0, status: 'draft', image: null },
  { id: '6', title: 'Bluetooth Speaker Mini', sku: 'BSM-2024', price: 49.99, stock: 78, status: 'active', image: null },
];

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [loading] = useState(false);

  const filtered = mockProducts.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">Manage your product catalog</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products by name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Badge variant="outline" className="h-9 px-3 cursor-pointer">All Status</Badge>
            <Badge variant="outline" className="h-9 px-3 cursor-pointer">All Categories</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState variant="skeleton" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No products found" description={search ? 'Try different search terms' : 'Add your first product'} action={!search ? <Button><Plus className="h-4 w-4 mr-2" />Add Product</Button> : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 font-medium w-12">Image</th>
                    <th className="text-left py-3 font-medium"><button className="flex items-center gap-1 hover:text-foreground">Product <ArrowUpDown className="h-3 w-3" /></button></th>
                    <th className="text-left py-3 font-medium">SKU</th>
                    <th className="text-left py-3 font-medium">Price</th>
                    <th className="text-left py-3 font-medium">Stock</th>
                    <th className="text-left py-3 font-medium">Status</th>
                    <th className="text-right py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => (
                    <tr key={product.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3">
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          <Image className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </td>
                      <td className="py-3 font-medium">{product.title}</td>
                      <td className="py-3 text-muted-foreground font-mono text-xs">{product.sku}</td>
                      <td className="py-3">${product.price.toFixed(2)}</td>
                      <td className="py-3">
                        <span className={product.stock === 0 ? 'text-destructive' : product.stock < 10 ? 'text-yellow-500' : ''}>
                          {product.stock}
                        </span>
                      </td>
                      <td className="py-3">
                        <Badge variant={product.status === 'active' ? 'success' : product.status === 'out_of_stock' ? 'destructive' : 'secondary'}>
                          {product.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3 w-3" /></Button>
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