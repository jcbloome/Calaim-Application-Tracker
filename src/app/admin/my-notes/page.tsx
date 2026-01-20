'use client';

import { useAdmin } from '@/hooks/use-admin';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Search, Calendar, User, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

interface MyNote {
  id: string;
  content: string;
  memberName: string;
  memberId: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  isPrivate: boolean;
  createdAt: Timestamp;
  authorName: string;
  authorId: string;
}

export default function MyNotesPage() {
  const { isLoading, isAdmin, user: adminUser } = useAdmin();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  
  const [notes, setNotes] = useState<MyNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Load notes created by this user from Firestore
  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIsLoadingNotes(false);
      return;
    }

    setIsLoadingNotes(true);
    
    try {
      // Query notes where the current user is the author
      // Simplified query to avoid index requirements
      const notesQuery = query(
        collection(firestore, 'notes'),
        where('authorId', '==', user.uid)
      );

      const unsubscribe = onSnapshot(notesQuery, (snapshot) => {
        const userNotes: MyNote[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          userNotes.push({
            id: doc.id,
            content: data.content || '',
            memberName: data.memberName || 'Unknown Member',
            memberId: data.memberId || '',
            priority: data.priority || 'Medium',
            isPrivate: data.isPrivate || false,
            createdAt: data.createdAt,
            authorName: data.authorName || user.displayName || 'You',
            authorId: data.authorId || user.uid
          });
        });
        
        // Sort notes by creation date on the client side
        userNotes.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime; // Newest first
        });
        
        setNotes(userNotes);
        setIsLoadingNotes(false);
        
        if (userNotes.length === 0) {
          toast({
            title: 'No Notes Found',
            description: 'You haven\'t created any notes yet. Notes you create will appear here.',
            className: 'bg-blue-100 text-blue-900 border-blue-200',
          });
        }
      }, (error) => {
        console.error('Error loading notes:', error);
        setIsLoadingNotes(false);
        toast({
          variant: 'destructive',
          title: 'Error Loading Notes',
          description: 'Failed to load your notes. Please try again.',
        });
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error setting up notes listener:', error);
      setIsLoadingNotes(false);
    }
  }, [firestore, user?.uid, toast]);

  // Filter notes based on search term
  const filteredNotes = notes.filter(note => 
    note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.memberName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need administrator privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">My Notes</h1>
        <p className="text-muted-foreground">
          View and manage notes you've created in this application.
        </p>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                My Notes ({filteredNotes.length})
              </CardTitle>
              <CardDescription>
                Notes you've created for members in the CalAIM system
              </CardDescription>
            </div>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline" 
              size="sm"
              disabled={isLoadingNotes}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingNotes ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search your notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Notes List */}
          {isLoadingNotes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading your notes...</span>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                {searchTerm ? 'No matching notes found' : 'No notes yet'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchTerm 
                  ? 'Try adjusting your search terms'
                  : 'Notes you create for members will appear here'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredNotes.map((note) => (
                <Card key={note.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{note.memberName}</span>
                        <Badge variant={note.priority === 'High' || note.priority === 'Urgent' ? 'destructive' : 'secondary'}>
                          {note.priority}
                        </Badge>
                        {note.isPrivate && (
                          <Badge variant="outline">Private</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {note.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown date'}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {note.content}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}