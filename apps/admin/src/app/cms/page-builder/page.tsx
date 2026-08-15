'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@cmc/ui';
import { ExternalLink, Palette, Smartphone, Tablet, Monitor, Undo2, Redo2, Save, Eye, Code } from 'lucide-react';

export default function PageBuilderPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Page Builder</h1>
          <p className="text-muted-foreground">Drag & drop visual page editor powered by GrapesJS</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Code className="h-4 w-4 mr-2" />
            HTML
          </Button>
          <Button variant="outline" size="sm">
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button size="sm">
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* Left panel - Components */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {['Hero', 'Features', 'CTA', 'FAQ', 'Testimonials', 'Pricing', 'Contact Form', 'Footer'].map((comp) => (
              <div
                key={comp}
                className="flex items-center gap-2 p-2 rounded border border-dashed border-border hover:border-primary hover:bg-accent/50 cursor-move transition-colors text-sm"
                draggable
              >
                <Palette className="h-4 w-4 text-muted-foreground" />
                {comp}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Center - Canvas */}
        <Card className="min-h-[600px]">
          <CardHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8"><Undo2 className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"><Redo2 className="h-4 w-4" /></Button>
              </div>
              <div className="flex items-center gap-1 border rounded-md p-1">
                <Button variant="ghost" size="icon" className="h-7 w-7"><Monitor className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Tablet className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7"><Smartphone className="h-3 w-3" /></Button>
              </div>
              <Badge variant="info">Desktop</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex items-center justify-center min-h-[500px] bg-muted/30">
              <div className="text-center">
                <Palette className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Drag components here to build your page</p>
                <p className="text-sm text-muted-foreground/60 mt-1">The GrapesJS visual editor canvas will render here</p>
                <div className="mt-6 p-8 border-2 border-dashed border-border/50 rounded-lg">
                  <div className="w-full max-w-2xl mx-auto bg-background rounded-lg shadow-sm p-8 text-left">
                    <h1 className="text-3xl font-bold mb-4">Your Page Title</h1>
                    <p className="text-muted-foreground mb-6">Drag and drop blocks to build beautiful pages without writing code.</p>
                    <div className="flex gap-2">
                      <div className="h-10 w-32 bg-primary rounded-md" />
                      <div className="h-10 w-32 bg-muted rounded-md border" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}