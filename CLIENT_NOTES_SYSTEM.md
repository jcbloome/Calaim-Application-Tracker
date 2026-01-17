# CalAIM Client Notes & Communication System

## 🎯 System Overview

A comprehensive interoffice communication system for CalAIM Application Tracker that enables staff to:

1. **Create and manage client notes** associated with Client_ID2
2. **Assign notes to staff members** with follow-up dates and notifications
3. **Receive real-time notifications** including system tray popups
4. **Search and filter notes** by client, staff, status, and date
5. **Track note history** with timestamps and status updates

## 🏗️ Architecture

### Backend Components

#### 1. **API Endpoints** (`src/app/api/`)
- **`/api/client-notes`** - CRUD operations for client notes
  - `GET` - Fetch notes with filtering (clientId2, userId, since)
  - `POST` - Create new notes with staff assignment
- **`/api/notifications`** - Notification management
  - `POST` - Fetch user notifications
- **`/api/notifications/mark-read`** - Mark notifications as read

#### 2. **Firebase Functions** (`functions/src/`)
- **`client-note-notifications.ts`** - Real-time notification system
  - `sendNoteNotification` - Send notifications when notes are assigned
  - `getUserNotifications` - Fetch user notifications
  - `markNotificationRead` - Mark notifications as read
  - `registerFCMToken` - Register device tokens for push notifications

#### 3. **Database Integration**
- **Caspio Tables**:
  - `connect_tbl_clientnotes` - Store client notes
  - `connect_tbl_usersregistration` - Staff user lookup
  - `connect_tbl_clients` - Client information lookup
- **Firebase Firestore**:
  - `notifications` - Real-time notification storage
  - `user-fcm-tokens` - Push notification tokens
  - `user-stats` - Notification counts and activity

### Frontend Components

#### 1. **Main Pages**
- **`/admin/client-notes`** - Full client notes management interface
- **`/admin/client-notes-demo`** - System demonstration and testing

#### 2. **Reusable Components**
- **`NotificationSystem.tsx`** - Real-time notification bell with dropdown
- **`MemberNotesModal.tsx`** - Modal for viewing/adding member-specific notes
- **Integration with admin layout** - Notification system in header

## 🚀 Key Features

### 1. **Comprehensive Note Management**
```typescript
interface ClientNote {
  id: string;
  noteId: string;
  clientId2: string;          // Links to CalAIM member
  userId?: string;            // Staff member who created note
  comments: string;           // Note content
  timeStamp: string;          // Creation timestamp
  followUpDate?: string;      // Scheduled follow-up
  followUpAssignment?: string; // Assigned staff member
  followUpStatus?: string;    // Open/Pending/Closed
  seniorFirst?: string;       // Client first name
  seniorLast?: string;        // Client last name
  seniorFullName?: string;    // Full client name
  userFullName?: string;      // Staff member name
  userRole?: string;          // Staff member role
  isNew?: boolean;           // New note indicator
}
```

### 2. **Real-Time Notification System**
- **In-App Notifications**: Bell icon with unread count
- **System Tray Popups**: Browser notifications with sound/visual alerts
- **Email Notifications**: Optional email alerts for assigned staff
- **Priority Levels**: Normal, High, Urgent with different styling
- **Auto-Expiration**: Notifications expire after 7 days

### 3. **Advanced Search & Filtering**
- Search by client name, Client_ID2, note content, or staff member
- Filter by assigned staff member
- Filter by follow-up status (Open/Pending/Closed/New)
- Date range filtering for note creation
- Real-time search results

### 4. **Staff Assignment & Workflow**
- Assign notes to specific staff members by User_ID
- Set follow-up dates for task scheduling
- Track note status throughout workflow
- Automatic notifications to assigned staff
- Role-based access and assignments

### 5. **System Integration**
- **Caspio OAuth Authentication**: Secure API access
- **Firebase Real-Time Database**: Instant notification delivery
- **User Registration Lookup**: Staff directory integration
- **Client Data Linking**: Automatic client name resolution
- **Audit Trail**: Complete history of all note activities

## 📱 User Interface

### Navigation Integration
- Added to **Tasks** menu in admin navigation
- **"Client Notes & Communication"** - Main interface
- **"Notes System Demo"** - Feature demonstration

### Notification System
- **Bell icon** in admin header with unread count badge
- **Dropdown panel** showing recent notifications
- **Click-to-navigate** to relevant notes/clients
- **Mark as read** functionality
- **System tray integration** for desktop alerts

### Note Management Interface
- **Search bar** for finding members by Client_ID2
- **Note creation form** with rich text and assignments
- **Note history display** with timestamps and status
- **Filter controls** for advanced searching
- **Responsive design** for mobile and desktop

## 🔧 Setup & Configuration

### 1. **Database Setup**
Ensure these Caspio tables exist with proper field names:
- `connect_tbl_clientnotes` with fields: Note_ID, Client_ID2, User_ID, Comments, Time_Stamp, Follow_Up_Date, Follow_Up_Assignment, Follow_Up_Status
- `connect_tbl_usersregistration` with fields: User_ID, User_Full_Name, Role
- `connect_tbl_clients` with fields: Client_ID2, Senior_First, Senior_Last, Senior_Full_Name

### 2. **Firebase Configuration**
- Deploy Firebase Functions with notification handlers
- Set up Firestore collections for notifications and user tokens
- Configure FCM for push notifications

### 3. **Environment Variables**
```env
CASPIO_BASE_URL=https://c7ebl500.caspio.com/rest/v2
CASPIO_CLIENT_ID=your_client_id
CASPIO_CLIENT_SECRET=your_client_secret
```

## 🎮 Usage Examples

### Creating a Note with Staff Assignment
```typescript
const noteData = {
  clientId2: 'CL001234',
  comments: 'Please follow up on Kaiser authorization status. Member needs T2038 form completion.',
  followUpDate: '2026-01-25',
  followUpAssignment: 'staff-user-id',
  followUpStatus: 'Open'
};

// This triggers:
// 1. Note creation in Caspio
// 2. Real-time notification to assigned staff
// 3. System tray popup alert
// 4. Optional email notification
```

### Searching Member Notes
```typescript
// Search for all notes for a specific member
const memberNotes = await fetch(`/api/client-notes?clientId2=CL001234`);

// Search for notes assigned to specific staff
const staffNotes = await fetch(`/api/client-notes?userId=staff-123`);

// Search for new notes since timestamp
const newNotes = await fetch(`/api/client-notes?since=2026-01-17T10:00:00Z`);
```

## 🔔 Notification Types

### 1. **Assignment Notifications**
- **Title**: "📝 New Note Assignment - [Client Name]"
- **Message**: "[Staff] assigned you a note for [Client]: '[Preview]'"
- **Priority**: Normal
- **Actions**: Click to view note, mark as read

### 2. **Follow-up Reminders**
- **Title**: "⏰ Follow-up Required - [Client Name]"
- **Message**: "Follow-up required by [Date]: '[Preview]'"
- **Priority**: High
- **Actions**: Click to view note, update status

### 3. **Mention Notifications**
- **Title**: "💬 You were mentioned - [Client Name]"
- **Message**: "[Staff] mentioned you in a note: '[Preview]'"
- **Priority**: Normal
- **Actions**: Click to view conversation

## 🚦 System Status

### ✅ **Completed Features**
- [x] Client notes CRUD API endpoints
- [x] Real-time notification system with Firebase Functions
- [x] System tray popup notifications
- [x] Staff assignment and follow-up scheduling
- [x] Advanced search and filtering interface
- [x] Member-specific note viewing modal
- [x] Integration with admin navigation
- [x] Comprehensive demo and testing interface
- [x] Caspio database integration
- [x] User registration lookup
- [x] Notification management system

### 🎯 **Ready for Production**
The system is fully functional and ready for deployment. All core features are implemented:

1. **Backend APIs** are connected to Caspio with proper authentication
2. **Firebase Functions** handle real-time notifications
3. **Frontend interfaces** provide comprehensive note management
4. **System integration** works with existing CalAIM infrastructure
5. **Notification system** provides real-time alerts and system tray popups

### 🔄 **Future Enhancements**
- Email notification integration with SMTP service
- Mobile app push notifications
- Advanced reporting and analytics
- Note templates and quick actions
- File attachment support
- Integration with calendar systems

## 📞 **Support & Maintenance**

The system is built with:
- **TypeScript** for type safety
- **Next.js** for robust web framework
- **Firebase** for real-time capabilities
- **Caspio** for data persistence
- **Shadcn/UI** for consistent design

All code follows established patterns in the CalAIM Application Tracker and integrates seamlessly with existing authentication, navigation, and styling systems.