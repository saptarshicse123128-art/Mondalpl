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

  // Update category name
  async updateCategoryName(categoryId, newName) {
    try {
      const categoryRef = doc(db, 'categories', categoryId);
      const categoryDoc = await getDoc(categoryRef);
      
      if (!categoryDoc.exists()) {
        throw new Error('Category not found');
      }
      
      const oldName = categoryDoc.data().name;
      const trimmedOldName = oldName ? oldName.trim() : '';
      const trimmedNewName = newName.trim();
      
      console.log(`Renaming category from "${oldName}" to "${trimmedNewName}"`);
      
      // Update category document
      await updateDoc(categoryRef, {
        name: trimmedNewName,
        updatedAt: serverTimestamp()
      });
      
      // Update all products that use this category name
      if (trimmedOldName !== trimmedNewName && trimmedOldName) {
        // Use query first (more efficient) - try both exact match and trimmed match
        let productsQuery = query(
          collection(db, 'products'),
          where('category', '==', oldName) // Try exact match first
        );
        let productsSnapshot = await getDocs(productsQuery);
        
        // If no results with exact match, try with trimmed old name
        if (productsSnapshot.empty && oldName !== trimmedOldName) {
          productsQuery = query(
            collection(db, 'products'),
            where('category', '==', trimmedOldName)
          );
          productsSnapshot = await getDocs(productsQuery);
        }
        
        if (!productsSnapshot.empty) {
          const batch = writeBatch(db);
          let updateCount = 0;
          productsSnapshot.forEach((productDoc) => {
            batch.update(productDoc.ref, {
              category: trimmedNewName,
              updatedAt: serverTimestamp()
            });
            updateCount++;
          });
          await batch.commit();
          console.log(`Updated ${updateCount} products with new category name: ${trimmedNewName}`);
        } else {
          // Fallback: Get all products and filter (in case of case sensitivity or formatting issues)
          const allProductsSnapshot = await getDocs(collection(db, 'products'));
          const matchingProducts = [];
          const foundCategories = new Set(); // For debugging
          
          allProductsSnapshot.forEach((productDoc) => {
            const productData = productDoc.data();
            const productCategory = productData.category ? String(productData.category).trim() : '';
            if (productCategory) {
              foundCategories.add(productCategory);
            }
            // Case-insensitive comparison - normalize both strings
            const normalizedProductCategory = productCategory.toLowerCase().replace(/\s+/g, ' ').trim();
            const normalizedOldName = trimmedOldName.toLowerCase().replace(/\s+/g, ' ').trim();
            
            if (normalizedProductCategory === normalizedOldName) {
              matchingProducts.push(productDoc);
            }
          });
          
          if (matchingProducts.length > 0) {
            const batch = writeBatch(db);
            matchingProducts.forEach((productDoc) => {
              batch.update(productDoc.ref, {
                category: trimmedNewName,
                updatedAt: serverTimestamp()
              });
            });
            await batch.commit();
            console.log(`Updated ${matchingProducts.length} products (fallback method) with new category name: ${trimmedNewName}`);
          } else {
            console.log(`No products found with category: "${oldName}" (trimmed: "${trimmedOldName}")`);
            const foundCategoriesArray = Array.from(foundCategories);
            console.log(`Total unique categories found in products: ${foundCategoriesArray.length}`);
            console.log(`All categories in products:`, JSON.stringify(foundCategoriesArray, null, 2));
            
            // Double-check: Try to find matches again with more flexible matching
            const finalMatchingProducts = [];
            allProductsSnapshot.forEach((productDoc) => {
              const productData = productDoc.data();
              const productCategory = productData.category ? String(productData.category).trim() : '';
              const normalizedProductCategory = productCategory.toLowerCase().replace(/\s+/g, ' ').trim();
              const normalizedOldName = trimmedOldName.toLowerCase().replace(/\s+/g, ' ').trim();
              
              // Try exact match first
              if (normalizedProductCategory === normalizedOldName) {
                finalMatchingProducts.push(productDoc);
              }
            });
            
            if (finalMatchingProducts.length > 0) {
              const batch = writeBatch(db);
              finalMatchingProducts.forEach((productDoc) => {
                batch.update(productDoc.ref, {
                  category: trimmedNewName,
                  updatedAt: serverTimestamp()
                });
              });
              await batch.commit();
              console.log(`Updated ${finalMatchingProducts.length} products (final check) with new category name: ${trimmedNewName}`);
            } else {
              // Check for partial matches as last resort
              const partialMatches = foundCategoriesArray.filter(cat => {
                const catLower = cat.trim().toLowerCase().replace(/\s+/g, ' ');
                const oldLower = trimmedOldName.toLowerCase().replace(/\s+/g, ' ');
                // Check if one contains the other (for cases like "Baishalii" vs "Baishaliiiii")
                return catLower === oldLower || 
                       (catLower.length > 3 && oldLower.length > 3 && 
                        (catLower.includes(oldLower.substring(0, Math.min(5, oldLower.length))) || 
                         oldLower.includes(catLower.substring(0, Math.min(5, catLower.length)))));
              });
              
              if (partialMatches.length > 0 && partialMatches.length <= 3) {
                // Only auto-update if there are very few partial matches (likely the same category)
                console.warn(`Found ${partialMatches.length} potential partial matches:`, partialMatches);
                console.warn(`Attempting to update products with these categories...`);
                
                const batch = writeBatch(db);
                let updateCount = 0;
                allProductsSnapshot.forEach((productDoc) => {
                  const productData = productDoc.data();
                  const productCategory = productData.category ? String(productData.category).trim() : '';
                  const normalizedProductCategory = productCategory.toLowerCase().replace(/\s+/g, ' ').trim();
                  const normalizedOldName = trimmedOldName.toLowerCase().replace(/\s+/g, ' ').trim();
                  
                  // Check if this product's category is in the partial matches
                  const isPartialMatch = partialMatches.some(pm => {
                    const pmLower = pm.trim().toLowerCase().replace(/\s+/g, ' ');
                    return normalizedProductCategory === pmLower || 
                           (normalizedProductCategory.includes(normalizedOldName) || 
                            normalizedOldName.includes(normalizedProductCategory));
                  });
                  
                  if (isPartialMatch) {
                    batch.update(productDoc.ref, {
                      category: trimmedNewName,
                      updatedAt: serverTimestamp()
                    });
                    updateCount++;
                  }
                });
                
                if (updateCount > 0) {
                  await batch.commit();
                  console.log(`Updated ${updateCount} products with partial matching categories to: ${trimmedNewName}`);
                } else {
                  console.error(`No matching categories found. Products may have been created with a different category name.`);
                  console.error(`Expected category: "${trimmedOldName}"`);
                  console.error(`Found categories:`, foundCategoriesArray);
                }
              } else {
                console.error(`No matching categories found. Products may have been created with a different category name.`);
                console.error(`Expected category: "${trimmedOldName}"`);
                console.error(`Found categories:`, foundCategoriesArray);
              }
            }
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error updating category name:', error);
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
  },

  // Rename a subcategory within a category's subcategories array
  async renameSubcategory(categoryId, oldName, newName) {
    try {
      const categoryRef = doc(db, 'categories', categoryId);
      const snap = await getDoc(categoryRef);
      if (!snap.exists()) {
        throw new Error('Category not found');
      }
      const data = snap.data();
      const categoryName = data.name; // Get category name for product queries
      const trimmedCategoryName = categoryName ? categoryName.trim() : '';
      const currentSubs = Array.isArray(data.subcategories) ? data.subcategories : [];
      const trimmedNew = newName.trim();
      const trimmedOld = oldName.trim();
      
      console.log(`Renaming subcategory from "${oldName}" to "${trimmedNew}" in category "${categoryName}"`);
      
      // Update subcategory in category document
      const updatedSubs = currentSubs.map((s) => (s === trimmedOld ? trimmedNew : s));
      await updateDoc(categoryRef, {
        subcategories: updatedSubs,
        updatedAt: serverTimestamp()
      });
      
      // Update all products that use this category and subcategory
      if (trimmedOld !== trimmedNew && trimmedCategoryName) {
        // Get all products and match flexibly (similar to category rename)
        const allProductsSnapshot = await getDocs(collection(db, 'products'));
        const matchingProducts = [];
        const foundSubcategories = new Set(); // For debugging
        
        allProductsSnapshot.forEach((productDoc) => {
          const productData = productDoc.data();
          const productCategory = productData.category ? String(productData.category).trim() : '';
          const productSubcategory = productData.subcategory ? String(productData.subcategory).trim() : '';
          
          if (productCategory && productSubcategory) {
            foundSubcategories.add(`${productCategory} / ${productSubcategory}`);
          }
          
          // Normalized case-insensitive comparison
          const normalizedProductCategory = productCategory.toLowerCase().replace(/\s+/g, ' ').trim();
          const normalizedProductSubcategory = productSubcategory.toLowerCase().replace(/\s+/g, ' ').trim();
          const normalizedCategoryName = trimmedCategoryName.toLowerCase().replace(/\s+/g, ' ').trim();
          const normalizedOldSub = trimmedOld.toLowerCase().replace(/\s+/g, ' ').trim();
          
          if (normalizedProductCategory === normalizedCategoryName &&
              normalizedProductSubcategory === normalizedOldSub) {
            matchingProducts.push(productDoc);
          }
        });
        
        if (matchingProducts.length > 0) {
          const batch = writeBatch(db);
          matchingProducts.forEach((productDoc) => {
            batch.update(productDoc.ref, {
              subcategory: trimmedNew,
              updatedAt: serverTimestamp()
            });
          });
          await batch.commit();
          console.log(`Updated ${matchingProducts.length} products with new subcategory name: ${trimmedNew}`);
          } else {
            console.log(`No products found with category: "${categoryName}" (trimmed: "${trimmedCategoryName}") and subcategory: "${oldName}" (trimmed: "${trimmedOld}")`);
            
            // Filter subcategories by the category we're looking for
            const subcategoriesForCategory = new Set();
            const allProductsForCategory = [];
            
            allProductsSnapshot.forEach((productDoc) => {
              const productData = productDoc.data();
              const productCategory = productData.category ? String(productData.category).trim() : '';
              const productSubcategory = productData.subcategory ? String(productData.subcategory).trim() : '';
              
              const normalizedProductCategory = productCategory.toLowerCase().replace(/\s+/g, ' ').trim();
              const normalizedCategoryName = trimmedCategoryName.toLowerCase().replace(/\s+/g, ' ').trim();
              
              // If category matches, collect its subcategories
              if (normalizedProductCategory === normalizedCategoryName) {
                allProductsForCategory.push({ productDoc, productCategory, productSubcategory });
                if (productSubcategory) {
                  subcategoriesForCategory.add(productSubcategory);
                }
              }
            });
            
            const subcategoriesArray = Array.from(subcategoriesForCategory);
            console.log(`Found ${allProductsForCategory.length} products with category "${trimmedCategoryName}"`);
            console.log(`Subcategories for category "${trimmedCategoryName}":`, JSON.stringify(subcategoriesArray, null, 2));
            
            // Try to find matches with the subcategories we found for this category
            const finalMatchingProducts = [];
            allProductsForCategory.forEach(({ productDoc, productCategory, productSubcategory }) => {
              const normalizedProductSubcategory = productSubcategory.toLowerCase().replace(/\s+/g, ' ').trim();
              const normalizedOldSub = trimmedOld.toLowerCase().replace(/\s+/g, ' ').trim();
              
              // Exact match
              if (normalizedProductSubcategory === normalizedOldSub) {
                finalMatchingProducts.push(productDoc);
              }
            });
            
            if (finalMatchingProducts.length > 0) {
              const batch = writeBatch(db);
              finalMatchingProducts.forEach((productDoc) => {
                batch.update(productDoc.ref, {
                  subcategory: trimmedNew,
                  updatedAt: serverTimestamp()
                });
              });
              await batch.commit();
              console.log(`Updated ${finalMatchingProducts.length} products (final check) with new subcategory name: ${trimmedNew}`);
            } else {
              // Try partial matching as last resort
              const partialMatches = subcategoriesArray.filter(sub => {
                const subLower = sub.toLowerCase().replace(/\s+/g, ' ');
                const oldLower = trimmedOld.toLowerCase().replace(/\s+/g, ' ');
                // Check if one contains the other (for cases like "Roof Tank" vs "Roof Tankkkkkkkkkkkkkkk")
                return subLower === oldLower || 
                       (subLower.length > 3 && oldLower.length > 3 && 
                        (subLower.includes(oldLower.substring(0, Math.min(8, oldLower.length))) || 
                         oldLower.includes(subLower.substring(0, Math.min(8, subLower.length)))));
              });
              
              if (partialMatches.length > 0 && partialMatches.length <= 2) {
                console.warn(`Found ${partialMatches.length} potential partial matches:`, partialMatches);
                console.warn(`Attempting to update products with these subcategories...`);
                
                const batch = writeBatch(db);
                let updateCount = 0;
                allProductsForCategory.forEach(({ productDoc, productSubcategory }) => {
                  const normalizedProductSubcategory = productSubcategory.toLowerCase().replace(/\s+/g, ' ').trim();
                  const normalizedOldSub = trimmedOld.toLowerCase().replace(/\s+/g, ' ').trim();
                  
                  // Check if this product's subcategory is in the partial matches
                  const isPartialMatch = partialMatches.some(pm => {
                    const pmLower = pm.toLowerCase().replace(/\s+/g, ' ');
                    return normalizedProductSubcategory === pmLower || 
                           (normalizedProductSubcategory.includes(normalizedOldSub.substring(0, Math.min(8, normalizedOldSub.length))) || 
                            normalizedOldSub.includes(normalizedProductSubcategory.substring(0, Math.min(8, normalizedProductSubcategory.length))));
                  });
                  
                  if (isPartialMatch) {
                    batch.update(productDoc.ref, {
                      subcategory: trimmedNew,
                      updatedAt: serverTimestamp()
                    });
                    updateCount++;
                  }
                });
                
                if (updateCount > 0) {
                  await batch.commit();
                  console.log(`Updated ${updateCount} products with partial matching subcategories to: ${trimmedNew}`);
                } else {
                  console.error(`No matching subcategories found.`);
                  console.error(`Expected category: "${trimmedCategoryName}", subcategory: "${trimmedOld}"`);
                  console.error(`Found subcategories for this category:`, subcategoriesArray);
                }
              } else {
                // If no match found but we have products in this category, update all of them
                // This handles the case where subcategory name in products doesn't match what's being renamed
                if (allProductsForCategory.length > 0) {
                  console.warn(`No exact match found for subcategory "${trimmedOld}".`);
                  console.warn(`Updating all ${allProductsForCategory.length} products in category "${trimmedCategoryName}" to use new subcategory "${trimmedNew}"`);
                  
                  const batch = writeBatch(db);
                  allProductsForCategory.forEach(({ productDoc }) => {
                    batch.update(productDoc.ref, {
                      subcategory: trimmedNew,
                      updatedAt: serverTimestamp()
                    });
                  });
                  await batch.commit();
                  console.log(`Updated ${allProductsForCategory.length} products in category "${trimmedCategoryName}" to new subcategory: ${trimmedNew}`);
                } else {
                  console.error(`No matching subcategories found and no products in category "${trimmedCategoryName}".`);
                  console.error(`Expected category: "${trimmedCategoryName}", subcategory: "${trimmedOld}"`);
                  console.error(`Found subcategories for this category:`, subcategoriesArray);
                }
              }
            }
          }
      }
      
      return true;
    } catch (error) {
      console.error('Error renaming subcategory:', error);
      throw error;
    }
  }
};

const firebaseServices = {
  productService,
  billService,
  userProfileService,
  customerService,
  inventoryLogService,
  batchOperations,
  categoryService
};

export default firebaseServices;
