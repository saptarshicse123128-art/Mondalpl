# Mondalpl

# Inventory Management System

A full-stack inventory management system built with React, Node.js, and Firebase.

## Features

- **Authentication**: Login and Signup with Firebase Authentication
- **Dashboard**: Modern dashboard with sidebar navigation
- **Stock Management**: Add and delete products with real-time updates
- **Bill Generation**: Create bills with product selection and cart functionality

## Tech Stack

- **Frontend**: React 18, React Router
- **Backend**: Node.js, Express
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth

## Setup Instructions

### 1. Install Dependencies

```bash
npm run install-all
```

### 2. Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Authentication (Email/Password)
4. Create a Firestore database
5. Copy your Firebase config from Project Settings
6. Update `client/src/firebase.js` with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

### 3. Firestore Rules

Set up Firestore security rules in Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 4. Run the Application

```bash
npm run dev
```

This will start both the client (React app on port 3000) and server (Node.js on port 5000).

## Project Structure

```
inventory-management-system/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/      # Login & Signup
│   │   │   └── Dashboard/ # Dashboard, Stock, Bills
│   │   ├── contexts/      # Auth context
│   │   └── firebase.js    # Firebase config
│   └── package.json
├── server/                # Node.js backend
│   ├── index.js
│   └── package.json
└── package.json
```

## Usage

1. **Sign Up**: Create a new account
2. **Login**: Sign in with your credentials
3. **Stock Management**: 
   - Add new products with name, category, price, quantity
   - View all products in a table
   - Delete products
4. **Bill Generation**:
   - Enter customer information
   - Select products from available stock
   - Add to cart and adjust quantities
   - Generate bill
   - View all generated bills

## Notes

- Make sure Firebase Authentication and Firestore are enabled in your Firebase project
- The app uses real-time updates, so changes reflect immediately
- All data is stored in Firebase Firestore

