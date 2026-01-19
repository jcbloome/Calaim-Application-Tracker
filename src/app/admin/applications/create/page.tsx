'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, UserPlus, Search, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface User {
  uid: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

export default function CreateApplicationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const [searchEmail, setSearchEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [createNewUser, setCreateNewUser] = useState(false);
  const [newUserData, setNewUserData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    displayName: ''
  });

  const searchUsers = async () => {
    if (!searchEmail.trim() || !firestore) return;
    
    setIsSearching(true);
    try {
      const usersRef = collection(firestore, 'users');
      const q = query(usersRef, where('email', '==', searchEmail.trim().toLowerCase()));
      const querySnapshot = await getDocs(q);
      
      const users: User[] = [];
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        users.push({
          uid: doc.id,
          email: userData.email,
          displayName: userData.displayName,
          firstName: userData.firstName,
          lastName: userData.lastName,
        });
      });
      
      setSearchResults(users);
      
      if (users.length === 0) {
        toast({
          title: "No User Found",
          description: "No user found with that email address. You can create a new user below.",
          variant: "default",
        });
        setCreateNewUser(true);
        setNewUserData({ ...newUserData, email: searchEmail.trim() });
      } else {
        setCreateNewUser(false);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      toast({
        title: "Search Error",
        description: "Failed to search for users. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const createUserAndApplication = async () => {
    if (!firestore || !newUserData.email || !newUserData.firstName || !newUserData.lastName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      // Create a new user document (this is just for tracking, not Firebase Auth)
      const userId = `admin_created_${Date.now()}`;
      const userRef = doc(firestore, 'users', userId);
      
      await setDoc(userRef, {
        email: newUserData.email.toLowerCase(),
        firstName: newUserData.firstName,
        lastName: newUserData.lastName,
        displayName: newUserData.displayName || `${newUserData.firstName} ${newUserData.lastName}`,
        createdAt: serverTimestamp(),
        createdByAdmin: true,
      });

      // Redirect to CS Summary form with the new user ID
      router.push(`/admin/applications/create/cs-summary?userId=${userId}`);
      
    } catch (error) {
      console.error('Error creating user:', error);
      toast({
        title: "Creation Error",
        description: "Failed to create user. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const createApplicationForUser = (user: User) => {
    router.push(`/admin/applications/create/cs-summary?userId=${user.uid}`);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="outline" asChild>
          <Link href="/admin/applications">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Applications
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create New Application</h1>
        <p className="text-gray-600 mt-2">
          Create a CS Summary form for an existing user or create a new user account.
        </p>
      </div>

      {/* User Search */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="mr-2 h-5 w-5" />
            Find Existing User
          </CardTitle>
          <CardDescription>
            Search for an existing user by email address to create an application for them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="searchEmail">Email Address</Label>
              <Input
                id="searchEmail"
                type="email"
                placeholder="Enter user's email address"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchUsers()}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={searchUsers} disabled={isSearching || !searchEmail.trim()}>
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Search
              </Button>
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <Label>Found Users:</Label>
              {searchResults.map((user) => (
                <div key={user.uid} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{user.displayName || `${user.firstName} ${user.lastName}`}</p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                  <Button onClick={() => createApplicationForUser(user)}>
                    Create Application
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create New User */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <UserPlus className="mr-2 h-5 w-5" />
            Create New User
          </CardTitle>
          <CardDescription>
            Create a new user account and then create an application for them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {createNewUser && (
            <Alert>
              <AlertTitle>User Not Found</AlertTitle>
              <AlertDescription>
                No user found with email "{searchEmail}". You can create a new user with this email below.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="newEmail">Email Address *</Label>
              <Input
                id="newEmail"
                type="email"
                placeholder="user@example.com"
                value={newUserData.email}
                onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="Full Name"
                value={newUserData.displayName}
                onChange={(e) => setNewUserData({ ...newUserData, displayName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                placeholder="First Name"
                value={newUserData.firstName}
                onChange={(e) => setNewUserData({ ...newUserData, firstName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                placeholder="Last Name"
                value={newUserData.lastName}
                onChange={(e) => setNewUserData({ ...newUserData, lastName: e.target.value })}
              />
            </div>
          </div>

          <Button 
            onClick={createUserAndApplication}
            disabled={isCreating || !newUserData.email || !newUserData.firstName || !newUserData.lastName}
            className="w-full"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating User & Application...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Create User & Start Application
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}