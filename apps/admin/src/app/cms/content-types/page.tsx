'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, EmptyState, LoadingState, ErrorState } from '@cmc/ui';
import { Plus, FileText, Settings, Trash2, Eye, Copy, MoreHorizontal, Layers } from 'lucide-react';

const mockContentTypes = [
  { id: '1', name: 'article', label: 'Article', fields: 8, items: 45, status: 'active', updatedAt: '2 hours ago' },
  { id: '2', name: 'page', label: 'Page', fields: 12, items: 23, status: 'active', updatedAt: '1 day ago' },
  { id: '3', name: 'product_review', label: 'Product Review', fields: 6, items: 128, status: 'active', updatedAt: '3 days ago' },
  { id: '4', name: 'team_member', label: 'Team Member', fields: 5, items: 12, status: 'draft', updatedAt: '1 week ago' },
  { id: '5', name: 'faq', label: 'FAQ', fields: 4, items: 34, status: 'active', updatedAt: '2 weeks ago' },
];

export default function ContentTypesPage() {
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  const [types] = useState(mockContentTypes);

  if (error) {
    return <ErrorState title="Failed to load content types" message={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Types</h1>
          <p className="text-muted-foreground">Manage your data models and content structures</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Content Type
        </Button>
      </div>

      {loading ? (
        <LoadingState variant="skeleton" />
      ) : types.length === 0 ? (
        <Card>
          <EmptyState
            title="No content types yet"
            description="Create your first content type to start building structured content"
            action={<Button><Plus className="h-4 w-4 mr-2" />Create Content Type</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {types.map((type) => (
            <Card key={type.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Layers className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{type.label}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono">{type.name}</p>
                    </div>
                  </div>
                  <Badge variant={type.status === 'active' ? 'success' : 'secondary'}>{type.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span>{type.fields} fields</span>
                  <span>{type.items} items</span>
                  <span>Updated {type.updatedAt}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Eye className="h-3 w-3 mr-1" />
                    Items
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Settings className="h-3 w-3 mr-1" />
                    Fields
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}