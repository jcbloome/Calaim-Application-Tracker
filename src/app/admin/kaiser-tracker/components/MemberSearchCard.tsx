'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import type { KaiserMember } from './shared';
import { getMemberKey } from './shared';

export interface MemberSearchCardProps {
  members: KaiserMember[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function MemberSearchCard({ members, searchTerm, onSearchTermChange }: MemberSearchCardProps) {
  return (
    <Card className="bg-white border-l-4 border-l-orange-500 shadow">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Search className="h-5 w-5 text-gray-400" />
          Member Search by Last Name
        </CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-gray-500 text-sm">Load member data to enable search</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Enter last name..."
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={() => onSearchTermChange('')}>
                Clear
              </Button>
            </div>

            {searchTerm && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {members
                  .filter((member) => {
                    const searchLower = searchTerm.toLowerCase();
                    const lastName = (member.memberLastName || '').toLowerCase();

                    // Exact match for last name only (starts with search term)
                    return lastName.startsWith(searchLower);
                  })
                  .slice(0, 10)
                  .map((member, index) => (
                    <div key={getMemberKey(member, index)} className="p-3 bg-gray-50 rounded border">
                      <div className="font-medium text-gray-900">
                        {member.memberLastName}, {member.memberFirstName}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        ID: {member.client_ID2} | {member.memberCounty} County
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Assigned:</span>{' '}
                        {String(member.Kaiser_User_Assignment || member.Staff_Assigned || '').trim() || 'Unassigned'}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          {member.Kaiser_Status}
                        </Badge>
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          {member.CalAIM_Status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                {members.filter((member) => {
                  const searchLower = searchTerm.toLowerCase();
                  const lastName = (member.memberLastName || '').toLowerCase();
                  return lastName.includes(searchLower);
                }).length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <p className="text-sm">No members found with last name "{searchTerm}"</p>
                  </div>
                )}
              </div>
            )}

            {!searchTerm && (
              <div className="text-center py-2">
                <div className="text-3xl font-bold text-gray-900">{members.length}</div>
                <p className="text-sm text-gray-600">Total Kaiser Members</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

