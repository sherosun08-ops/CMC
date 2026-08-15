'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, Input, EmptyState } from '@cmc/ui';
import { Upload, Image, FolderPlus, Search, Grid, List, Trash2, Download, Edit, MoreHorizontal, File, FileImage, FileVideo, FileAudio, FileArchive } from 'lucide-react';

const mockFiles = Array.from({ length: 24 }, (_, i) => ({
  id: `file-${i + 1}`,
  name: `asset-${i + 1}${['.jpg', '.png', '.mp4', '.pdf', '.svg'][i % 5]}`,
  type: ['image', 'image', 'video', 'document', 'image'][i % 5],
  size: ['1.2 MB', '450 KB', '8.5 MB', '220 KB', '890 KB'][i % 5],
  dimensions: i % 3 === 0 ? '1920x1080' : i % 3 === 1 ? '800x600' : null,
  updatedAt: `${i + 1}h ago`,
}));

export default function MediaPage() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');

  const filtered = mockFiles.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Media Library</h1>
          <p className="text-muted-foreground">Manage your images, videos, and documents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <FolderPlus className="h-4 w-4 mr-2" />
            New Folder
          </Button>
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Upload Files
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search media..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Badge variant="outline" className="h-9 px-3 cursor-pointer hover:bg-accent">All Types</Badge>
        <div className="flex border rounded-md">
          <button onClick={() => setView('grid')} className={`p-2 ${view === 'grid' ? 'bg-accent' : ''}`}>
            <Grid className="h-4 w-4" />
          </button>
          <button onClick={() => setView('list')} className={`p-2 ${view === 'list' ? 'bg-accent' : ''}`}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState title="No media files" description="Upload your first file to get started" icon={<Upload className="h-12 w-12 opacity-30" />} action={<Button><Upload className="h-4 w-4 mr-2" />Upload Files</Button>} />
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filtered.map((file) => (
            <Card key={file.id} className="group cursor-pointer hover:shadow-md transition-shadow">
              <div className="aspect-square bg-muted rounded-t-lg flex items-center justify-center relative">
                {file.type === 'image' ? (
                  <div className="flex items-center justify-center">
                    <Image className="h-10 w-10 text-muted-foreground" />
                  </div>
                ) : file.type === 'video' ? (
                  <FileVideo className="h-10 w-10 text-muted-foreground" />
                ) : (
                  <File className="h-10 w-10 text-muted-foreground" />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Button variant="secondary" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
                  <Button variant="destructive" size="icon" className="h-8 w-8 ml-1"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="text-xs font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{file.size}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 font-medium">Type</th>
                  <th className="text-left py-3 font-medium">Size</th>
                  <th className="text-left py-3 font-medium">Dimensions</th>
                  <th className="text-left py-3 font-medium">Updated</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((file) => (
                  <tr key={file.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                        <FileImage className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="font-medium">{file.name}</span>
                    </td>
                    <td className="py-3"><Badge variant="outline">{file.type}</Badge></td>
                    <td className="py-3 text-muted-foreground">{file.size}</td>
                    <td className="py-3 text-muted-foreground">{file.dimensions || '—'}</td>
                    <td className="py-3 text-muted-foreground">{file.updatedAt}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}