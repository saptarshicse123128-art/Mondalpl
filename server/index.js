const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : null;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.log('Firebase Admin not initialized - using client-side Firebase only');
    }
  } catch (error) {
    console.log('Firebase Admin initialization skipped:', error.message);
  }
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Helper function to check if Firebase Admin is available
const getFirestore = () => {
  if (admin.apps.length === 0) {
    throw new Error('Firebase Admin not initialized');
  }
  return admin.firestore();
};

// Products API
app.get('/api/products', async (req, res) => {
  try {
    const db = getFirestore();
    const productsSnapshot = await db.collection('products').get();
    const products = [];
    productsSnapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const db = getFirestore();
    const product = req.body;
    const docRef = await db.collection('products').add(product);
    res.json({ id: docRef.id, ...product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const db = getFirestore();
    await db.collection('products').doc(req.params.id).delete();
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bills API
app.get('/api/bills', async (req, res) => {
  try {
    const db = getFirestore();
    const billsSnapshot = await db.collection('bills').get();
    const bills = [];
    billsSnapshot.forEach(doc => {
      bills.push({ id: doc.id, ...doc.data() });
    });
    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills', async (req, res) => {
  try {
    const db = getFirestore();
    const bill = req.body;
    const docRef = await db.collection('bills').add(bill);
    res.json({ id: docRef.id, ...bill });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

