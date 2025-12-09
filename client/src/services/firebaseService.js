import {
  collection,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';

// ===================== PRODUCTS SERVICE =====================

export const productService = {
  // Add new product
  async addProduct(productData) {
    try {
      const docRef = await addDoc(collection(db, 'products'), {
        ...productData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { id: docRef.id, ...productData };
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
  },

  // Get all products
  async getAllProducts() {
    try {
      const snapshot = await getDocs(collection(db, 'products'));
      const products = [];
      snapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
      });
      return products;
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  },

  // Get product by ID
  async getProductById(productId) {
    try {
      const docRef = doc(db, 'products', productId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.error('Error fetching product:', error);
      throw error;
    }
  },

  // Get products by category
  async getProductsByCategory(category) {
    try {
      const q = query(collection(db, 'products'), where('category', '==', category));
      const snapshot = await getDocs(q);
      const products = [];
      snapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
      });
      return products;
    } catch (error) {
      console.error('Error fetching products by category:', error);
      throw error;
    }
  },

  // Update product
  async updateProduct(productId, updateData) {
    try {
      const docRef = doc(db, 'products', productId);
      await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      return { id: productId, ...updateData };
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  },

  // Delete product
  async deleteProduct(productId) {
    try {
      await deleteDoc(doc(db, 'products', productId));
      return productId;
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  },

  // Update product quantity
  async updateProductQuantity(productId, quantityChange) {
    try {
      const productRef = doc(db, 'products', productId);
      const productDoc = await getDoc(productRef);
      
      if (productDoc.exists()) {
        const currentQuantity = productDoc.data().quantity || 0;
        const newQuantity = Math.max(0, currentQuantity + quantityChange);
        
        await updateDoc(productRef, {
          quantity: newQuantity,
          updatedAt: serverTimestamp()
        });
        return newQuantity;
      }
    } catch (error) {
      console.error('Error updating product quantity:', error);
      throw error;
    }
  },

  // Real-time listener for products
  onProductsChange(callback) {
    try {
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      return onSnapshot(q, (snapshot) => {
        const products = [];
        snapshot.forEach((doc) => {
          products.push({ id: doc.id, ...doc.data() });
        });
        callback(products);
      }, (error) => {
        console.error('Error listening to products:', error);
        callback(null, error);
      });
    } catch (error) {
      console.error('Error setting up listener:', error);
      throw error;
    }
  }
};

// ===================== BILLS SERVICE =====================

export const billService = {
  // Add new bill
  async addBill(billData) {
    try {
      const docRef = await addDoc(collection(db, 'bills'), {
        ...billData,
        createdAt: serverTimestamp()
      });
      return { id: docRef.id, ...billData };
    } catch (error) {
      console.error('Error adding bill:', error);
      throw error;
    }
  },

  // Get all bills
  async getAllBills() {
    try {
      const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const bills = [];
      snapshot.forEach((doc) => {
        bills.push({ id: doc.id, ...doc.data() });
      });
      return bills;
    } catch (error) {
      console.error('Error fetching bills:', error);
      throw error;
    }
  },

  // Get bill by ID
  async getBillById(billId) {
    try {
      const docRef = doc(db, 'bills', billId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.error('Error fetching bill:', error);
      throw error;
    }
  },

  // Get bills by customer name
  async getBillsByCustomer(customerName) {
    try {
      const q = query(
        collection(db, 'bills'),
        where('fullName', '==', customerName),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const bills = [];
      snapshot.forEach((doc) => {
        bills.push({ id: doc.id, ...doc.data() });
      });
      return bills;
    } catch (error) {
      console.error('Error fetching customer bills:', error);
      throw error;
    }
  },

  // Get bills within date range
  async getBillsByDateRange(startDate, endDate) {
    try {
      const q = query(
        collection(db, 'bills'),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(q);
      const bills = [];
      snapshot.forEach((doc) => {
        bills.push({ id: doc.id, ...doc.data() });
      });
      return bills;
    } catch (error) {
      console.error('Error fetching bills by date range:', error);
      throw error;
    }
  },

  // Update bill (for modifications)
  async updateBill(billId, updateData) {
    try {
      const docRef = doc(db, 'bills', billId);
      await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      return { id: billId, ...updateData };
    } catch (error) {
      console.error('Error updating bill:', error);
      throw error;
    }
  },

  // Delete bill
  async deleteBill(billId) {
    try {
      await deleteDoc(doc(db, 'bills', billId));
      return billId;
    } catch (error) {
      console.error('Error deleting bill:', error);
      throw error;
    }
  },

  // Real-time listener for bills
  onBillsChange(callback) {
    try {
      const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
      return onSnapshot(q, (snapshot) => {
        const bills = [];
        snapshot.forEach((doc) => {
          bills.push({ id: doc.id, ...doc.data() });
        });
        callback(bills);
      }, (error) => {
        console.error('Error listening to bills:', error);
        callback(null, error);
      });
    } catch (error) {
      console.error('Error setting up listener:', error);
      throw error;
    }
  }
};

// ===================== USER PROFILE SERVICE =====================

export const userProfileService = {
  // Create or update user profile
  async createUserProfile(userId, profileData) {
    try {
      const docRef = doc(db, 'users', userId);
      await updateDoc(docRef, {
        ...profileData,
        updatedAt: serverTimestamp()
      }).catch(() => {
        // If document doesn't exist, create it
        return setDoc(docRef, {
          ...profileData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      return { id: userId, ...profileData };
    } catch (error) {
      console.error('Error creating/updating user profile:', error);
      throw error;
    }
  },

  // Get user profile
  async getUserProfile(userId) {
    try {
      const docRef = doc(db, 'users', userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  },

  // Update user profile
  async updateUserProfile(userId, updateData) {
    try {
      const docRef = doc(db, 'users', userId);
      await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      return { id: userId, ...updateData };
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }
};

// ===================== CUSTOMER SERVICE =====================

export const customerService = {
  // Add new customer
  async addCustomer(customerData) {
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...customerData,
        createdAt: serverTimestamp()
      });
      return { id: docRef.id, ...customerData };
    } catch (error) {
      console.error('Error adding customer:', error);
      throw error;
    }
  },

  // Get all customers
  async getAllCustomers() {
    try {
      const snapshot = await getDocs(collection(db, 'customers'));
      const customers = [];
      snapshot.forEach((doc) => {
        customers.push({ id: doc.id, ...doc.data() });
      });
      return customers;
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }
  },

  // Get customer by ID
  async getCustomerById(customerId) {
    try {
      const docRef = doc(db, 'customers', customerId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
  },

  // Search customer by name or phone
  async searchCustomer(searchTerm) {
    try {
      const snapshot = await getDocs(collection(db, 'customers'));
      const customers = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (
          data.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          data.phone?.includes(searchTerm)
        ) {
          customers.push({ id: doc.id, ...data });
        }
      });
      return customers;
    } catch (error) {
      console.error('Error searching customers:', error);
      throw error;
    }
  },

  // Update customer
  async updateCustomer(customerId, updateData) {
    try {
      const docRef = doc(db, 'customers', customerId);
      await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      return { id: customerId, ...updateData };
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  },

  // Delete customer
  async deleteCustomer(customerId) {
    try {
      await deleteDoc(doc(db, 'customers', customerId));
      return customerId;
    } catch (error) {
      console.error('Error deleting customer:', error);
      throw error;
    }
  }
};

// ===================== INVENTORY LOGS SERVICE =====================

export const inventoryLogService = {
  // Add inventory log
  async addInventoryLog(logData) {
    try {
      const docRef = await addDoc(collection(db, 'inventoryLogs'), {
        ...logData,
        timestamp: serverTimestamp()
      });
      return { id: docRef.id, ...logData };
    } catch (error) {
      console.error('Error adding inventory log:', error);
      throw error;
    }
  },

  // Get logs for a product
  async getLogsForProduct(productId) {
    try {
      const q = query(
        collection(db, 'inventoryLogs'),
        where('productId', '==', productId),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const logs = [];
      snapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() });
      });
      return logs;
    } catch (error) {
      console.error('Error fetching inventory logs:', error);
      throw error;
    }
  },

  // Get all logs
  async getAllLogs() {
    try {
      const q = query(collection(db, 'inventoryLogs'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const logs = [];
      snapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() });
      });
      return logs;
    } catch (error) {
      console.error('Error fetching inventory logs:', error);
      throw error;
    }
  }
};

// ===================== BATCH OPERATIONS =====================

export const batchOperations = {
  // Batch update products (for bulk operations)
  async batchUpdateProducts(updates) {
    try {
      const batch = writeBatch(db);
      
      updates.forEach(({ productId, data }) => {
        const docRef = doc(db, 'products', productId);
        batch.update(docRef, {
          ...data,
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
      return true;
    } catch (error) {
      console.error('Error batch updating products:', error);
      throw error;
    }
  },

  // Transaction for bill generation (updates products and adds bill)
  async generateBillTransaction(billData, productUpdates) {
    try {
      return await runTransaction(db, async (transaction) => {
        // Update all products atomically
        for (const { productId, newQuantity } of productUpdates) {
          const productRef = doc(db, 'products', productId);
          transaction.update(productRef, {
            quantity: newQuantity,
            updatedAt: serverTimestamp()
          });
        }

        // Add bill
        const billRef = doc(collection(db, 'bills'));
        transaction.set(billRef, {
          ...billData,
          createdAt: serverTimestamp()
        });

        return billRef.id;
      });
    } catch (error) {
      console.error('Error in bill generation transaction:', error);
      throw error;
    }
  }
};

// ===================== CATEGORY SERVICE =====================

export const categoryService = {
  // Add new category (with optional initial subcategories array)
  async addCategory(name, subcategories = []) {
    try {
      const docRef = await addDoc(collection(db, 'categories'), {
        name: name.trim(),
        subcategories,
        createdAt: serverTimestamp()
      });
      return { id: docRef.id, name: name.trim(), subcategories };
    } catch (error) {
      console.error('Error adding category:', error);
      throw error;
    }
  },

  // Add a subcategory to an existing category document
  async addSubcategory(categoryId, subcategoryName) {
    try {
      const categoryRef = doc(db, 'categories', categoryId);
      await updateDoc(categoryRef, {
        subcategories: arrayUnion(subcategoryName.trim()),
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error adding subcategory:', error);
      throw error;
    }
  },

  // Get all categories
  async getAllCategories() {
    try {
      const snapshot = await getDocs(collection(db, 'categories'));
      const categories = [];
      snapshot.forEach((doc) => {
        categories.push({ id: doc.id, ...doc.data() });
      });
      return categories;
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  },

  // Real-time listener for categories
  onCategoriesChange(callback) {
    try {
      const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
      return onSnapshot(q, (snapshot) => {
        const categories = [];
        snapshot.forEach((doc) => {
          categories.push({ id: doc.id, ...doc.data() });
        });
        callback(categories);
      }, (error) => {
        console.error('Error listening to categories:', error);
        callback(null, error);
      });
    } catch (error) {
      console.error('Error setting up categories listener:', error);
      throw error;
    }
  }
  ,
  // Delete a category document entirely
  async deleteCategory(categoryId) {
    try {
      await deleteDoc(doc(db, 'categories', categoryId));
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  },

  // Remove a subcategory string from the category's subcategories array
  async removeSubcategory(categoryId, subcategoryName) {
    try {
      const categoryRef = doc(db, 'categories', categoryId);
      await updateDoc(categoryRef, {
        subcategories: arrayRemove(subcategoryName.trim()),
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error removing subcategory:', error);
      throw error;
    }
  }
};

export default {
  productService,
  billService,
  userProfileService,
  customerService,
  inventoryLogService,
  batchOperations
  ,categoryService
};
