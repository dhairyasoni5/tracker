# Firebase Firestore Indexes Setup

## Overview
This app requires Firebase Firestore composite indexes for optimal performance. Currently, we're using client-side sorting as a temporary workaround to avoid index errors.

## Required Indexes

### 1. Visits Collection - Supervisor Queries
**Fields:**
- `supervisorId` (Ascending)
- `dateTime` (Descending)

**Usage:** Used in SupervisorDashboard and VisitListScreen for supervisors to fetch their visits sorted by date.

### 2. Visits Collection - Admin Queries  
**Fields:**
- `createdAt` (Descending)

**Usage:** Used in AdminDashboard for displaying recent activity.

### 3. Visits Collection - Student Queries
**Fields:** 
- `assignedStudents` (Arrays)
- `dateTime` (Descending)

**Usage:** Used in VisitListScreen for students to fetch assigned visits sorted by date.

## How to Create Indexes

### Option 1: Automatic Creation (Recommended for Development)
1. Run the app and trigger the queries that need indexes
2. Check the browser console for Firebase error messages
3. Click the provided links in error messages to auto-create indexes
4. Wait 5-10 minutes for indexes to build

### Option 2: Manual Creation via Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `trackingapp-infochip`
3. Navigate to Firestore Database → Indexes
4. Click "Create Index"
5. Set up each index with the fields listed above

### Option 3: Firebase CLI (For Production)
Create a `firestore.indexes.json` file:

```json
{
  "indexes": [
    {
      "collectionGroup": "visits",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "supervisorId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "dateTime", 
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "visits",
      "queryScope": "COLLECTION", 
      "fields": [
        {
          "fieldPath": "assignedStudents",
          "arrayConfig": "CONTAINS"
        },
        {
          "fieldPath": "dateTime",
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

Then run: `firebase deploy --only firestore:indexes`

## Current Workaround
The app currently:
1. Fetches data without `orderBy` clauses
2. Sorts results on the client side using JavaScript
3. Shows user-friendly error messages for index issues

## Performance Impact
- **Without indexes:** Client-side sorting works but is slower for large datasets
- **With indexes:** Server-side sorting is much faster and more efficient
- **Recommendation:** Set up proper indexes for production deployment

## Index Status Check
To check if indexes are properly set up:
1. Monitor browser console for Firebase errors
2. Test all user roles (admin, supervisor, student)
3. Verify visit fetching works without errors
4. Check that data is properly sorted by date

## Error Messages to Watch For
- `failed-precondition: The query requires an index`
- Links containing `firestore/indexes?create_composite=`

When you see these, follow the provided links to create the required indexes. 