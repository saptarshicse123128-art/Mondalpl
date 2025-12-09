import { db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy
} from 'firebase/firestore';

/**
 * Utility functions for Firebase operations
 */

// ===================== SEARCH & FILTER UTILITIES =====================

export const searchUtils = {
  // Search products by name
  async searchProductsByName(searchTerm) {
    try {
      const q = query(
        collection(db, 'products'),
        where('name', '>=', searchTerm),
        where('name', '<=', searchTerm + '\uf8ff')
      );
      const snapshot = await getDocs(q);
      const products = [];
      snapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
      });
      return products;
    } catch (error) {
      console.error('Error searching products by name:', error);
      throw error;
    }
  },

  // Search products by price range
  async searchProductsByPriceRange(minPrice, maxPrice) {
    try {
      const q = query(
        collection(db, 'products'),
        where('price', '>=', minPrice),
        where('price', '<=', maxPrice)
      );
      const snapshot = await getDocs(q);
      const products = [];
      snapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
      });
      return products;
    } catch (error) {
      console.error('Error searching products by price:', error);
      throw error;
    }
  },

  // Get low stock products
  async getLowStockProducts(threshold = 10) {
    try {
      const q = query(
        collection(db, 'products'),
        where('quantity', '<=', threshold),
        orderBy('quantity', 'asc')
      );
      const snapshot = await getDocs(q);
      const products = [];
      snapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
      });
      return products;
    } catch (error) {
      console.error('Error fetching low stock products:', error);
      throw error;
    }
  },

  // Get out of stock products
  async getOutOfStockProducts() {
    try {
      const q = query(
        collection(db, 'products'),
        where('quantity', '==', 0)
      );
      const snapshot = await getDocs(q);
      const products = [];
      snapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
      });
      return products;
    } catch (error) {
      console.error('Error fetching out of stock products:', error);
      throw error;
    }
  }
};

// ===================== ANALYTICS UTILITIES =====================

export const analyticsUtils = {
  // Get total sales amount
  async getTotalSalesAmount() {
    try {
      const snapshot = await getDocs(collection(db, 'bills'));
      let totalSales = 0;
      snapshot.forEach((doc) => {
        totalSales += doc.data().total || 0;
      });
      return totalSales;
    } catch (error) {
      console.error('Error calculating total sales:', error);
      throw error;
    }
  },

  // Get sales by date
  async getSalesByDate(date) {
    try {
      const q = query(
        collection(db, 'bills'),
        where('date', '==', date)
      );
      const snapshot = await getDocs(q);
      let totalSales = 0;
      let billCount = 0;
      
      snapshot.forEach((doc) => {
        totalSales += doc.data().total || 0;
        billCount++;
      });

      return { totalSales, billCount, date };
    } catch (error) {
      console.error('Error fetching sales by date:', error);
      throw error;
    }
  },

  // Get top selling products
  async getTopSellingProducts(limit_count = 10) {
    try {
      const snapshot = await getDocs(collection(db, 'bills'));
      const productSales = {};

      snapshot.forEach((doc) => {
        const items = doc.data().items || [];
        items.forEach((item) => {
          const productId = item.productId;
          if (productSales[productId]) {
            productSales[productId].quantity += item.quantity || 0;
            productSales[productId].totalRevenue += (item.price * item.quantity) || 0;
            productSales[productId].billCount++;
          } else {
            productSales[productId] = {
              productId,
              productName: item.productName,
              quantity: item.quantity || 0,
              totalRevenue: (item.price * item.quantity) || 0,
              billCount: 1
            };
          }
        });
      });

      const topProducts = Object.values(productSales)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, limit_count);

      return topProducts;
    } catch (error) {
      console.error('Error fetching top selling products:', error);
      throw error;
    }
  },

  // Get inventory value
  async getInventoryValue() {
    try {
      const snapshot = await getDocs(collection(db, 'products'));
      let totalValue = 0;
      const products = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        const productValue = (data.price || 0) * (data.quantity || 0);
        totalValue += productValue;
        products.push({
          id: doc.id,
          ...data,
          value: productValue
        });
      });

      return { totalValue, products };
    } catch (error) {
      console.error('Error calculating inventory value:', error);
      throw error;
    }
  }
};

// ===================== VALIDATION UTILITIES =====================

export const validationUtils = {
  // Validate product data
  validateProductData(productData) {
    const errors = [];

    if (!productData.name || productData.name.trim() === '') {
      errors.push('Product name is required');
    }

    if (productData.price === undefined || productData.price === '') {
      errors.push('Product price is required');
    } else if (isNaN(productData.price) || productData.price < 0) {
      errors.push('Product price must be a valid positive number');
    }

    if (productData.quantity === undefined || productData.quantity === '') {
      errors.push('Product quantity is required');
    } else if (!Number.isInteger(parseInt(productData.quantity)) || productData.quantity < 0) {
      errors.push('Product quantity must be a valid positive integer');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate bill data
  validateBillData(billData) {
    const errors = [];

    if (!billData.fullName || billData.fullName.trim() === '') {
      errors.push('Customer name is required');
    }

    if (!billData.date) {
      errors.push('Bill date is required');
    }

    if (!billData.items || billData.items.length === 0) {
      errors.push('Bill must contain at least one item');
    }

    if (billData.total === undefined || billData.total < 0) {
      errors.push('Bill total must be valid');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate customer data
  validateCustomerData(customerData) {
    const errors = [];

    if (!customerData.name || customerData.name.trim() === '') {
      errors.push('Customer name is required');
    }

    if (customerData.phone && !/^\d{10}$/.test(customerData.phone.replace(/\D/g, ''))) {
      errors.push('Invalid phone number');
    }

    if (customerData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerData.email)) {
      errors.push('Invalid email address');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

// ===================== DATA EXPORT UTILITIES =====================

export const exportUtils = {
  // Export products to CSV
  exportProductsToCSV(products) {
    try {
      const headers = ['ID', 'Name', 'Category', 'Description', 'Price', 'Quantity', 'Created Date'];
      const rows = products.map((product) => [
        product.id,
        product.name,
        product.category,
        product.description,
        product.price,
        product.quantity,
        product.createdAt?.toDate ? product.createdAt.toDate().toLocaleDateString() : 'N/A'
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell || ''}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error('Error exporting products to CSV:', error);
      throw error;
    }
  },

  // Export bills to CSV
  exportBillsToCSV(bills) {
    try {
      const headers = ['Bill ID', 'Customer Name', 'Date', 'Items Count', 'Subtotal', 'GST', 'Total'];
      const rows = bills.map((bill) => [
        bill.id,
        bill.fullName,
        bill.date,
        bill.items?.length || 0,
        bill.subtotal,
        bill.gstAmount,
        bill.total
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell || ''}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bills_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error('Error exporting bills to CSV:', error);
      throw error;
    }
  }
};

// Named exports are used above (searchUtils, analyticsUtils, validationUtils, exportUtils)
// No default export to avoid circular import / initialization issues.
