'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Building, ArrowRight, MapPin } from 'lucide-react';
import Link from 'next/link';

export default function TestBillyPage() {
  const [mockUser] = useState({
    uid: 'billy-buckhalter-test',
    email: 'billy.buckhalter@test.com',
    displayName: 'Billy Buckhalter'
  });

  const [assignedData, setAssignedData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBillyAssignments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(mockUser.displayName)}`);
      const data = await response.json();
      setAssignedData(data);
      console.log('Billy\'s assignments:', data);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Test User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Test Mode: Billy Buckhalter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Mock User Details:</h3>
              <p><strong>Name:</strong> {mockUser.displayName}</p>
              <p><strong>Email:</strong> {mockUser.email}</p>
              <p><strong>Role:</strong> Social Worker</p>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={fetchBillyAssignments} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Fetch Billy\'s Assignments'}
              </Button>
              
              <Link href="/sw-visit-verification">
                <Button variant="outline">
                  Go to SW Visit Verification
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Assignment Results */}
        {assignedData && (
          <Card>
            <CardHeader>
              <CardTitle>Billy's Assigned RCFEs & Members</CardTitle>
            </CardHeader>
            <CardContent>
              {assignedData.success ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-green-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {assignedData.totalRCFEs}
                      </div>
                      <div className="text-sm text-green-700">RCFEs Assigned</div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {assignedData.totalMembers}
                      </div>
                      <div className="text-sm text-blue-700">Total Members</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {Math.round(assignedData.totalMembers / assignedData.totalRCFEs) || 0}
                      </div>
                      <div className="text-sm text-purple-700">Avg per RCFE</div>
                    </div>
                  </div>

                  {assignedData.rcfeList && assignedData.rcfeList.length > 0 ? (
                    <div className="space-y-4">
                      <h3 className="font-semibold">Assigned RCFEs:</h3>
                      {assignedData.rcfeList.map((rcfe: any, index: number) => (
                        <div key={rcfe.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-semibold">{rcfe.name}</h4>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {rcfe.address}
                              </p>
                              <Badge variant="secondary" className="mt-2">
                                {rcfe.memberCount} members
                              </Badge>
                            </div>
                            <Building className="h-5 w-5 text-gray-400" />
                          </div>
                          
                          {rcfe.members && rcfe.members.length > 0 && (
                            <div>
                              <h5 className="font-medium mb-2">Members:</h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {rcfe.members.map((member: any, memberIndex: number) => (
                                  <div key={member.id || `member-${index}-${memberIndex}`} className="bg-gray-50 p-2 rounded text-sm">
                                    <span className="font-medium">{member.name}</span>
                                    <span className="text-muted-foreground ml-2">({member.room})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Building className="h-8 w-8 mx-auto mb-4 opacity-50" />
                      <p className="font-medium">No RCFEs assigned to Billy Buckhalter</p>
                      <p className="text-sm">This might mean:</p>
                      <ul className="text-sm mt-2 space-y-1">
                        <li>• Billy's name format doesn't match Caspio data</li>
                        <li>• No members currently assigned to Billy</li>
                        <li>• Social worker field is empty in Caspio</li>
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-red-600">
                  <p><strong>Error:</strong> {assignedData.error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Testing Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-yellow-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">How to test as Billy Buckhalter:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Click "Fetch Billy's Assignments" to see his assigned members</li>
                <li>Click "Go to SW Visit Verification" to access the mobile interface</li>
                <li>The system will recognize you as Billy Buckhalter (social worker)</li>
                <li>Complete a visit questionnaire for any of his assigned members</li>
                <li>Test the scoring and flagging system with different responses</li>
              </ol>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">What Billy will see:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Only RCFEs where he has assigned members</li>
                <li>Only members assigned to him specifically</li>
                <li>Mobile-optimized questionnaire interface</li>
                <li>Real-time scoring and flagging</li>
                <li>Geolocation verification on submission</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}