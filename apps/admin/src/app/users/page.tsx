'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge, Input, EmptyState } from '@cmc/ui';
import { Plus, Search, Users, Shield, UserPlus, Edit, Trash2, MoreHorizontal } from 'lucide-react';

const mockUsers = [
  { id: '1', name: 'Admin User', email: 'admin@cmc.io', role: 'Super Admin', status: 'active', lastLogin: '5 min ago' },
  { id: '2', name: 'Jane Editor', email: 'jane@cmc.io', role: 'Editor', status: 'active', lastLogin: '1 hour ago' },
  { id: '3', name: 'John Content', email: 'john@cmc.io', role: 'Author', status: 'active', lastLogin: '3 hours ago' },
  { id: '4', name: 'Sarah Manager', email: 'sarah@cmc.io', role: 'Manager', status: 'active', lastLogin: '1 day ago' },
  { id: '5', name: 'Bob Contributor', email: 'bob@cmc.io', role: 'Contributor', status: 'inactive', lastLogin: '1 week ago' },
];

const roles = ['Super Admin', 'Admin', 'Editor', 'Author', 'Manager', 'Contributor'];

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const filtered = mockUsers.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.includes(search));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users & Roles</h1>
          <p className="text-muted-foreground">Manage team members and their permissions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Shield className="h-4 w-4 mr-2" />Roles</Button>
          <Button><UserPlus className="h-4 w-4 mr-2" />Invite User</Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <EmptyState title="No users found" description="Invite your first team member" action={<Button><UserPlus className="h-4 w-4 mr-2" />Invite User</Button>} />
              ) : (
                <div className="space-y-2">
                  {filtered.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{user.role}</Badge>
                        <Badge variant={user.status === 'active' ? 'success' : 'secondary'}>{user.status}</Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Roles</CardTitle>
              <CardDescription>Permission levels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {roles.map((role) => (
                  <div key={role} className="flex items-center justify-between p-2 rounded hover:bg-accent cursor-pointer">
                    <span className="text-sm">{role}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
}