'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Input, EmptyState, LoadingState } from '@cmc/ui';
import { Plus, Search, Filter, ArrowUpDown, Edit, Trash2, Copy, Eye, MoreHorizontal, CheckCircle, XCircle } from 'lucide-react';

const mockItems = Array.from({ length: 20 }, (_, i) => ({
  id: `item-${i + 1}`,
  title: `Sample Article ${i + 1}`,
  status: ['published', 'draft', 'review'][i % 3],
  author: ['Admin', 'Editor', 'Contributor'][i % 3],
  updatedAt: `${i + 1}h ago`,
  locale: ['en', 'fr', 'de', 'es'][i % 4],
}));

export default function ContentItemsPage() {
  const [search, setSearch] = useState('');
  const [loading] = useState(false);

  const filtered = mockItems.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Items</h1>
          <p className="text-muted-foreground">Browse and manage all your content</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Content
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search content..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="outline" className="h-9 px-3 cursor-pointer hover:bg-accent">
              All Types
            </Badge>
            <Badge variant="outline" className="h-9 px-3 cursor-pointer hover:bg-accent">
              Published Only
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState variant="skeleton" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No content found"
              description={search ? 'Try different search terms' : 'Create your first content item'}
              action={!search ? <Button><Plus className="h-4 w-4 mr-2" />New Content</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 font-medium">
                      <button className="flex items-center gap-1 hover:text-foreground">
                        Title <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-left py-3 font-medium">Status</th>
                    <th className="text-left py-3 font-medium">Author</th>
                    <th className="text-left py-3 font-medium">Locale</th>
                    <th className="text-left py-3 font-medium">Updated</th>
                    <th className="text-right py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3 font-medium">{item.title}</td>
                      <td className="py-3">
                        <Badge variant={
                          item.status === 'published' ? 'success' :
                          item.status === 'review' ? 'warning' : 'secondary'
                        }>
                          {item.status === 'published' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {item.status === 'draft' && <XCircle className="h-3 w-3 mr-1" />}
                          {item.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">{item.author}</td>
                      <td className="py-3">
                        <Badge variant="outline" className="uppercase">{item.locale}</Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">{item.updatedAt}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Copy className="h-3 w-3" /></Button>
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