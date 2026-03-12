'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import type { KaiserMember } from './shared';
import { getEffectiveKaiserStatus, getMemberKey } from './shared';

export interface MemberSearchCardProps {
  members: KaiserMember[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export function MemberSearchCard({ members, searchTerm, onSearchTermChange }: MemberSearchCardProps) {
  const normalizeSearchText = (value: string) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const matchesSearch = (member: KaiserMember, rawSearch: string) => {
    const q = normalizeSearchText(rawSearch);
    if (!q) return false;

    const lastNameRaw = String(member.memberLastName || '');
    const firstNameRaw = String(member.memberFirstName || '');
    const caspioClientIdRaw = String((member as any).Client_ID2 || member.client_ID2 || '');
    const formulaFieldRaw = String((member as any).Client_Last_First_ID2 || '');

    const candidates = [
      `${lastNameRaw} ${firstNameRaw}`,
      `${firstNameRaw} ${lastNameRaw}`,
      `${lastNameRaw}, ${firstNameRaw}`,
      caspioClientIdRaw,
      formulaFieldRaw,
      `${lastNameRaw} ${firstNameRaw} ${caspioClientIdRaw}`,
      `${firstNameRaw} ${lastNameRaw} ${caspioClientIdRaw}`,
      `${lastNameRaw}, ${firstNameRaw} ${caspioClientIdRaw}`,
    ]
      .map(normalizeSearchText)
      .filter(Boolean);

    return candidates.some((candidate) => candidate.includes(q));
  };

  return (
    <Card className="bg-white border-l-2 border-l-orange-500 shadow-none">
      <CardContent className="py-2 px-3">
        {members.length === 0 ? (
          <div className="text-center py-1">
            <p className="text-gray-500 text-xs">Load member data to enable search</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground shrink-0">
                <Search className="h-3.5 w-3.5" />
                Member search
              </div>
              <Input
                placeholder="Last name, first name, or ID2..."
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                className="flex-1 h-8 text-sm"
              />
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => onSearchTermChange('')}>
                Clear
              </Button>
              <span className="text-[11px] text-muted-foreground shrink-0">
                Total: {members.length}
              </span>
            </div>

            {searchTerm && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {members
                  .filter((member) => matchesSearch(member, searchTerm))
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
                        {String(member.Staff_Assigned || member.Kaiser_User_Assignment || '').trim() || 'Unassigned'}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          {getEffectiveKaiserStatus(member)}
                        </Badge>
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          {member.CalAIM_Status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                {members.filter((member) => matchesSearch(member, searchTerm)).length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <p className="text-sm">No members found for "{searchTerm}"</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

