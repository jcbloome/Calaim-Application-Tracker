'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  MessageSquare, 
  Bell, 
  Users, 
  Calendar, 
  Search,
  Plus,
  Send,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import MemberNotesModal from '@/components/MemberNotesModal';
import SyncStatusDashboard from '@/components/SyncStatusDashboard';

export default function ClientNotesDemoPage() {
  const [showMemberNotesModal, setShowMemberNotesModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedClientName, setSelectedClientName] = useState('');
  const { toast } = useToast();

  // Demo data
  const demoMembers = [
    { clientId2: 'CL001234', name: 'John Doe', county: 'Los Angeles', status: 'Authorized' },
    { clientId2: 'CL001235', name: 'Jane Smith', county: 'Orange', status: 'Authorized' },
    { clientId2: 'CL001236', name: 'Bob Johnson', county: 'San Diego', status: 'Authorized' },
    { clientId2: 'CL001237', name: 'Maria Garcia', county: 'Riverside', status: 'Authorized' },
    { clientId2: 'CL001238', name: 'David Wilson', county: 'San Bernardino', status: 'Authorized' }
  ];

  const demoStaff = [
    { id: 'staff-1', name: 'Monica Bloome', role: 'Case Manager' },
    { id: 'staff-2', name: 'Leidy Kanjanapitt', role: 'Social Worker' },
    { id: 'staff-3', name: 'Jason Bloome', role: 'Administrator' },
    { id: 'staff-4', name: 'Deydry Miranda', role: 'Care Coordinator' }
  ];

  const openMemberNotes = (clientId2: string, clientName: string) => {
    setSelectedClientId(clientId2);
    setSelectedClientName(clientName);
    setShowMemberNotesModal(true);
  };

  const simulateNotification = () => {
    toast({
      title: "📝 New Note Assignment",
      description: "Monica Bloome assigned you a note for John Doe",
    });
  };

  const simulateSystemTrayNotification = () => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('📝 New CalAIM Note Assignment', {
          body: 'Monica Bloome assigned you a note for John Doe: "Please follow up on Kaiser authorization status..."',
          icon: '/calaimlogopdf.png',
          tag: 'demo-notification'
        });
        toast({
          title: "System Tray Notification Sent",
          description: "Check your system notifications",
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            simulateSystemTrayNotification();
          }
        });
      } else {
        toast({
          title: "Notifications Blocked",
          description: "Please enable notifications in your browser settings",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">📝 Client Notes & Communication System Demo</h1>
          <p className="text-muted-foreground">
            Demonstration of the robust interoffice communication system with real-time notifications
          </p>
        </div>
      </div>

      {/* System Overview */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This system provides comprehensive client note management with staff assignments, 
          real-time notifications, and system tray popup alerts for seamless interoffice communication.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="features" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="features">System Features</TabsTrigger>
          <TabsTrigger value="members">Member Notes</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="sync">Smart Sync</TabsTrigger>
          <TabsTrigger value="workflow">Workflow Demo</TabsTrigger>
        </TabsList>

        {/* System Features Tab */}
        <TabsContent value="features" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                  <span>Client Notes Management</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>✅ Create notes for any CalAIM member</li>
                  <li>✅ Search members by Client_ID2</li>
                  <li>✅ View complete note history</li>
                  <li>✅ Timestamp tracking</li>
                  <li>✅ Status management (Open/Pending/Closed)</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-green-600" />
                  <span>Staff Assignment</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>✅ Assign notes to specific staff members</li>
                  <li>✅ Role-based assignments</li>
                  <li>✅ Follow-up date scheduling</li>
                  <li>✅ Task tracking and management</li>
                  <li>✅ Workload distribution</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Bell className="w-5 h-5 text-orange-600" />
                  <span>Real-time Notifications</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>✅ Instant notification system</li>
                  <li>✅ System tray popup alerts</li>
                  <li>✅ Email notifications (optional)</li>
                  <li>✅ Priority-based alerts</li>
                  <li>✅ Notification history</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Search className="w-5 h-5 text-purple-600" />
                  <span>Advanced Search</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>✅ Search by client name</li>
                  <li>✅ Search by Client_ID2</li>
                  <li>✅ Filter by staff member</li>
                  <li>✅ Filter by status</li>
                  <li>✅ Date range filtering</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-red-600" />
                  <span>Follow-up Management</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>✅ Schedule follow-up dates</li>
                  <li>✅ Automatic reminders</li>
                  <li>✅ Overdue task alerts</li>
                  <li>✅ Calendar integration</li>
                  <li>✅ Progress tracking</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-teal-600" />
                  <span>Integration</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li>✅ Caspio database integration</li>
                  <li>✅ Real-time data sync</li>
                  <li>✅ Firebase notifications</li>
                  <li>✅ User registration lookup</li>
                  <li>✅ Client data linking</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Member Notes Tab */}
        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>CalAIM Members - Click to View/Add Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {demoMembers.map((member) => (
                  <Card 
                    key={member.clientId2}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => openMemberNotes(member.clientId2, member.name)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold">{member.name}</h3>
                        <Badge variant="outline">{member.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        ID: {member.clientId2}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        📍 {member.county} County
                      </p>
                      <div className="mt-3 flex items-center space-x-2">
                        <MessageSquare className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-blue-600">View Notes</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification System Demo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Test the notification system with these demo buttons:
                </p>
                
                <div className="space-y-3">
                  <Button 
                    onClick={simulateNotification}
                    className="w-full justify-start"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    Simulate In-App Notification
                  </Button>
                  
                  <Button 
                    onClick={simulateSystemTrayNotification}
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Test System Tray Notification
                  </Button>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    System tray notifications require browser permission. 
                    Click the button above to request permission if needed.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Staff Directory</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {demoStaff.map((staff) => (
                    <div 
                      key={staff.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{staff.name}</p>
                        <p className="text-sm text-muted-foreground">{staff.role}</p>
                      </div>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Smart Sync Tab */}
        <TabsContent value="sync" className="space-y-6">
          <SyncStatusDashboard />
        </TabsContent>

        {/* Workflow Demo Tab */}
        <TabsContent value="workflow" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Typical Workflow Example</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-600">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold">Staff Member Creates Note</h3>
                    <p className="text-sm text-muted-foreground">
                      Monica Bloome creates a note for John Doe regarding Kaiser authorization status
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-green-600">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold">Assign to Staff</h3>
                    <p className="text-sm text-muted-foreground">
                      Note is assigned to Leidy Kanjanapitt with a follow-up date of January 25, 2026
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-orange-600">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold">Real-time Notification</h3>
                    <p className="text-sm text-muted-foreground">
                      Leidy receives instant notification in the admin interface and system tray popup
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-purple-600">4</span>
                  </div>
                  <div>
                    <h3 className="font-semibold">Staff Takes Action</h3>
                    <p className="text-sm text-muted-foreground">
                      Leidy reviews the note, takes necessary action, and updates the status
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-teal-600">5</span>
                  </div>
                  <div>
                    <h3 className="font-semibold">Follow-up & Tracking</h3>
                    <p className="text-sm text-muted-foreground">
                      System tracks completion, sends reminders if needed, and maintains audit trail
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">Key Benefits:</h4>
                <ul className="text-sm space-y-1">
                  <li>• No missed communications between staff members</li>
                  <li>• Complete audit trail for all client interactions</li>
                  <li>• Automatic follow-up reminders prevent tasks from falling through cracks</li>
                  <li>• Real-time notifications ensure immediate attention to urgent matters</li>
                  <li>• Centralized system accessible from any admin interface</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Member Notes Modal */}
      <MemberNotesModal
        isOpen={showMemberNotesModal}
        onClose={() => setShowMemberNotesModal(false)}
        clientId2={selectedClientId}
        clientName={selectedClientName}
      />
    </div>
  );
}