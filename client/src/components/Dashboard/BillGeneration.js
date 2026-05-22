import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatProductWithVariation, normalizeSizeNamePosition } from '../../utils/productDisplay';
import './BillGeneration.css';

function BillGeneration() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [billForm, setBillForm] = useState({
    fullName: '',
    date: new Date().toISOString().split('T')[0],
    address: '',
    gst: '',
    phone: '',
    discount: '',
    paidAmount: ''
  });
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedVariation, setSelectedVariation] = useState('');
  const [productQuantity, setProductQuantity] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [bills, setBills] = useState([]);
  const [showBills, setShowBills] = useState(false);
  const [generatedBill, setGeneratedBill] = useState(null);
  const [billSearchQuery, setBillSearchQuery] = useState('');
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [customProductMode, setCustomProductMode] = useState(false);
  const [customProduct, setCustomProduct] = useState({
    name: '',
    quantity: 1,
    price: ''
  });
  const [editingCustomItem, setEditingCustomItem] = useState(null);
  const [editingQuantityItemId, setEditingQuantityItemId] = useState(null);
  const [editingQuantityValue, setEditingQuantityValue] = useState('');
  const [editingDueBillId, setEditingDueBillId] = useState(null);
  const [editingDueAmount, setEditingDueAmount] = useState('');
  const [currentDueAmount, setCurrentDueAmount] = useState(0);
  const [openMenuBillId, setOpenMenuBillId] = useState(null);
  const [returningBillId, setReturningBillId] = useState(null);
  const [returnItems, setReturnItems] = useState([]);
  const [adjustBillSearchQuery, setAdjustBillSearchQuery] = useState('');
  const [showAdjustBillDropdown, setShowAdjustBillDropdown] = useState(false);
  const [adjustments, setAdjustments] = useState([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const productsList = [];
      snapshot.forEach((doc) => {
        productsList.push({ id: doc.id, ...doc.data() });
      });
      setProducts(productsList);
    });

    return () => unsubscribe();
  }, []);

  const positionForSavedBillItem = (item) => {
    const pid = item.productId;
    if (!pid) return 'left';
    const p = products.find((x) => x.id === pid);
    return normalizeSizeNamePosition(p?.sizeNamePosition);
  };

  const positionForCartItem = (item) => {
    if (item.isCustomProduct) return 'left';
    const p = products.find((x) => x.id === item.id);
    return normalizeSizeNamePosition(p?.sizeNamePosition);
  };

  const getOriginalItemQuantity = (item) => {
    const currentQuantity = parseInt(item.quantity || 0);
    const returnedQuantity = parseInt(item.returnedQuantity || 0);

    if (returnedQuantity > 0) {
      return currentQuantity + returnedQuantity;
    }

    return parseInt(item.originalQuantity || item.quantity || 0);
  };

  const getOriginalBillSubtotal = (bill) => {
    if (bill.originalSubtotal !== undefined && bill.originalSubtotal !== null) {
      return parseFloat(bill.originalSubtotal || 0);
    }

    return (bill.items || []).reduce((sum, item) => {
      const price = parseFloat(item.price || 0);
      return sum + (price * getOriginalItemQuantity(item));
    }, 0);
  };

  const getOriginalBillDiscount = (bill) => {
    if (bill.originalDiscount !== undefined && bill.originalDiscount !== null) {
      return parseFloat(bill.originalDiscount || 0);
    }

    return parseFloat(bill.discount || 0);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuBillId && !event.target.closest('.bill-menu-container')) {
        setOpenMenuBillId(null);
      }
    };

    if (openMenuBillId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openMenuBillId]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'bills'), (snapshot) => {
      const billsList = [];
      snapshot.forEach((doc) => {
        billsList.push({ id: doc.id, ...doc.data() });
      });
      // Sort by bill number value (descending - newest first), or by date if no bill number
      setBills(billsList.sort((a, b) => {
        if (a.billNumberValue && b.billNumberValue) {
          return b.billNumberValue - a.billNumberValue;
        }
        return new Date(b.createdAt?.toDate()) - new Date(a.createdAt?.toDate());
      }));
    });

    return () => unsubscribe();
  }, []);

  const handleFormChange = (e) => {
    setBillForm({
      ...billForm,
      [e.target.name]: e.target.value
    });
  };

  // Prevent number input from changing value on scroll
  const handleNumberInputWheel = (e) => {
    e.target.blur();
  };

  const handleAddCustomProduct = () => {
    if (!customProduct.name.trim()) {
      alert('Please enter product name');
      return;
    }
    if (customProduct.quantity <= 0) {
      alert('Quantity must be greater than 0');
      return;
    }
    if (!customProduct.price || parseFloat(customProduct.price) <= 0) {
      alert('Please enter a valid price');
      return;
    }

    // Create a custom product object (not from stock)
    const customProductItem = {
      id: `custom_${Date.now()}`, // Unique ID for custom products
      name: customProduct.name.trim(),
      price: parseFloat(customProduct.price),
      quantity: parseInt(customProduct.quantity),
      category: '',
      subcategory: '',
      isCustomProduct: true // Flag to identify custom products
    };

    // Check if same custom product already exists in cart
    const existingCustomItem = cart.find(item => 
      item.isCustomProduct && 
      item.name.toLowerCase() === customProductItem.name.toLowerCase()
    );

    if (existingCustomItem) {
      // Update quantity if same custom product exists
      setCart(cart.map(item =>
        item.id === existingCustomItem.id
          ? { ...item, quantity: existingCustomItem.quantity + customProductItem.quantity }
          : item
      ));
    } else {
      // Add new custom product to cart
      setCart([...cart, customProductItem]);
    }

    // Reset custom product form and turn off switch
    setCustomProduct({
      name: '',
      quantity: 1,
      price: ''
    });
    setCustomProductMode(false);
  };

  const handleAddProduct = async () => {
    if (customProductMode) {
      handleAddCustomProduct();
      return;
    }

    if (!selectedProduct) {
      alert('Please select a product');
      return;
    }
    const qty = typeof productQuantity === 'string' && productQuantity.trim() === '' ? 0 : parseInt(productQuantity) || 0;
    if (qty <= 0) {
      alert('Please enter a quantity greater than 0');
      return;
    }

    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    // Check if product has variations
    const hasVariations = product.variations && Array.isArray(product.variations) && product.variations.length > 0;
    
    if (hasVariations && !selectedVariation) {
      alert('Please select a size/variation for this product');
      return;
    }

    let availableQuantity = product.quantity;
    let productPrice = product.price;

    // If product has variations, use selected variation
    if (hasVariations && selectedVariation) {
      const variation = product.variations.find(v => v.size === selectedVariation);
      if (!variation) {
        alert('Selected variation not found');
        return;
      }
      availableQuantity = variation.quantity || 0;
      productPrice = variation.price || product.price;
    }
    if (availableQuantity < qty) {
      alert(`Only ${availableQuantity} items available in stock for this size`);
      return;
    }

    // Create unique cart ID that includes variation if applicable
    const cartItemId = hasVariations && selectedVariation 
      ? `${product.id}_${selectedVariation}` 
      : product.id;

    const existingItem = cart.find(item => {
      const itemId = item.variationSize ? `${item.id}_${item.variationSize}` : item.id;
      return itemId === cartItemId;
    });

    const newCartQuantity = existingItem ? existingItem.quantity + qty : qty;
    
    if (availableQuantity < newCartQuantity) {
      alert(`Only ${availableQuantity} items available in stock for this size`);
      return;
    }

    try {
      // Update product/variation quantity in Firestore
      const productRef = doc(db, 'products', product.id);
      
      if (hasVariations && selectedVariation) {
        // Update the specific variation's quantity
        const updatedVariations = product.variations.map(v => {
          if (v.size === selectedVariation) {
            return { ...v, quantity: (v.quantity || 0) - qty };
          }
          return v;
        });
        
        const newTotalQuantity = updatedVariations.reduce((sum, v) => sum + (v.quantity || 0), 0);
        
        await updateDoc(productRef, {
          variations: updatedVariations,
          quantity: newTotalQuantity,
          updatedAt: serverTimestamp()
        });
      } else {
        // Update regular product quantity
        const newStockQuantity = product.quantity - qty;
        await updateDoc(productRef, {
          quantity: newStockQuantity,
          updatedAt: serverTimestamp()
        });
      }

      // Update cart
      const cartItem = {
        ...product,
        quantity: newCartQuantity,
        price: productPrice,
        variationSize: hasVariations ? selectedVariation : undefined
      };

      if (existingItem) {
        setCart(cart.map(item => {
          const itemId = item.variationSize ? `${item.id}_${item.variationSize}` : item.id;
          return itemId === cartItemId ? cartItem : item;
        }));
      } else {
        setCart([...cart, cartItem]);
      }

      setSelectedProduct('');
      setSelectedVariation('');
      setProductQuantity('');
      setProductSearchQuery('');
    } catch (error) {
      console.error('Error updating product quantity:', error);
      alert('Failed to update product stock. Please try again.');
    }
  };

  const updateCartQuantity = async (productId, newQuantity) => {
    // Find cart item - need to find by index since items with same id but different variations can exist
    // For now, find the first item matching the productId (should work for most cases)
    // In the future, we might need to pass an index or unique identifier
    const cartItem = cart.find(item => item.id === productId);
    
    if (!cartItem) return;

    // If it's a custom product, just update quantity without stock management
    if (cartItem.isCustomProduct) {
      const safeQuantity = parseInt(newQuantity, 10) || 0;
      if (safeQuantity <= 0) {
        setCart(cart.filter(item => {
          const itemId = item.variationSize ? `${item.id}_${item.variationSize}` : item.id;
          const searchId = cartItem.variationSize ? `${cartItem.id}_${cartItem.variationSize}` : cartItem.id;
          return itemId !== searchId;
        }));
      } else {
        setCart(cart.map(item => {
          const itemId = item.variationSize ? `${item.id}_${item.variationSize}` : item.id;
          const searchId = cartItem.variationSize ? `${cartItem.id}_${cartItem.variationSize}` : cartItem.id;
          return itemId === searchId ? { ...item, quantity: safeQuantity } : item;
        }));
      }
      return;
    }

    if (newQuantity <= 0) {
      // Remove from cart and restore stock
      await restoreProductStock(productId, cartItem.quantity, cartItem.variationSize);
      setCart(cart.filter(item => {
        const itemId = item.variationSize ? `${item.id}_${item.variationSize}` : item.id;
        const searchId = cartItem.variationSize ? `${cartItem.id}_${cartItem.variationSize}` : cartItem.id;
        return itemId !== searchId;
      }));
    } else {
      // Calculate the difference in quantity
      const quantityDifference = newQuantity - cartItem.quantity;
      const product = products.find(p => p.id === productId);
      
      if (!product) return;

      // Check if product has variations
      const hasVariations = cartItem.variationSize && product.variations && Array.isArray(product.variations);
      let availableQuantity = product.quantity;

      if (hasVariations) {
        const variation = product.variations.find(v => v.size === cartItem.variationSize);
        availableQuantity = variation?.quantity || 0;
      }

      // Check if enough stock is available
      if (availableQuantity < quantityDifference) {
        alert(`Only ${availableQuantity} items available in stock${hasVariations ? ' for this size' : ''}`);
        return;
      }

      try {
        // Update product quantity in Firestore
        const productRef = doc(db, 'products', productId);
        
        if (hasVariations && cartItem.variationSize) {
          // Update the specific variation's quantity
          const updatedVariations = product.variations.map(v => {
            if (v.size === cartItem.variationSize) {
              return { ...v, quantity: (v.quantity || 0) - quantityDifference };
            }
            return v;
          });
          
          const newTotalQuantity = updatedVariations.reduce((sum, v) => sum + (v.quantity || 0), 0);
          
          await updateDoc(productRef, {
            variations: updatedVariations,
            quantity: newTotalQuantity,
            updatedAt: serverTimestamp()
          });
        } else {
          // Update regular product quantity
          const newStockQuantity = product.quantity - quantityDifference;
          await updateDoc(productRef, {
            quantity: newStockQuantity,
            updatedAt: serverTimestamp()
          });
        }

        // Update cart
        setCart(cart.map(item => {
          const itemId = item.variationSize ? `${item.id}_${item.variationSize}` : item.id;
          const searchId = cartItem.variationSize ? `${cartItem.id}_${cartItem.variationSize}` : cartItem.id;
          return itemId === searchId ? { ...item, quantity: newQuantity } : item;
        }));
      } catch (error) {
        console.error('Error updating product quantity:', error);
        alert('Failed to update product stock. Please try again.');
      }
    }
  };

  const restoreProductStock = async (productId, quantityToRestore, variationSize = null) => {
    try {
      const productRef = doc(db, 'products', productId);
      const productDoc = await getDoc(productRef);
      
      if (productDoc.exists()) {
        const productData = productDoc.data();
        
        if (variationSize && productData.variations && Array.isArray(productData.variations)) {
          // Restore variation quantity
          const updatedVariations = productData.variations.map(v => {
            if (v.size === variationSize) {
              return { ...v, quantity: (v.quantity || 0) + quantityToRestore };
            }
            return v;
          });
          
          const newTotalQuantity = updatedVariations.reduce((sum, v) => sum + (v.quantity || 0), 0);
          
          await updateDoc(productRef, {
            variations: updatedVariations,
            quantity: newTotalQuantity,
            updatedAt: serverTimestamp()
          });
        } else {
          // Restore regular product quantity
          const currentQuantity = productData.quantity || 0;
          await updateDoc(productRef, {
            quantity: currentQuantity + quantityToRestore,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (error) {
      console.error('Error restoring product stock:', error);
    }
  };

  const removeFromCart = async (productId) => {
    const cartItem = cart.find(item => item.id === productId);
    if (cartItem && !cartItem.isCustomProduct) {
      // Restore stock when removing from cart (only for stock products)
      await restoreProductStock(productId, cartItem.quantity, cartItem.variationSize);
    }
    setCart(cart.filter(item => {
      const itemId = item.variationSize ? `${item.id}_${item.variationSize}` : item.id;
      const searchId = cartItem?.variationSize ? `${productId}_${cartItem.variationSize}` : productId;
      return itemId !== searchId;
    }));
  };

  const handleDeleteBill = async (billId) => {
    if (!window.confirm('Are you sure you want to delete this bill? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'bills', billId));
      alert('Bill deleted successfully.');
    } catch (error) {
      console.error('Error deleting bill:', error);
      alert('Failed to delete bill. Please try again.');
    }
  };

  const parseAmountValue = (value) => {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleEditDueAmount = (bill) => {
    const currentDueNumeric = parseAmountValue(bill.due);
    setEditingDueBillId(bill.id);
    setCurrentDueAmount(currentDueNumeric);
    setEditingDueAmount(''); // This will be the "amount paid"
  };

  const handleSaveDueAmount = async (billId) => {
    if (!editingDueAmount.trim()) {
      alert('Please enter amount paid');
      return;
    }

    const amountPaid = parseAmountValue(editingDueAmount);
    
    if (amountPaid < 0) {
      alert('Please enter a valid amount paid');
      return;
    }

    if (amountPaid > currentDueAmount) {
      alert(`Amount paid (₹${amountPaid.toFixed(2)}) cannot be greater than current due amount (₹${currentDueAmount.toFixed(2)})`);
      return;
    }

    try {
      const billRef = doc(db, 'bills', billId);
      const billDoc = await getDoc(billRef);
      
      if (!billDoc.exists()) {
        alert('Bill not found');
        return;
      }

      // Calculate new due amount
      const newDueAmount = Math.max(0, currentDueAmount - amountPaid);

      // Get existing due history or initialize
      const existingHistory = billDoc.data().dueHistory || [];
      const today = new Date().toISOString().split('T')[0];
      
      // Add new entry to history with amount paid
      const newHistoryEntry = {
        amountPaid: amountPaid,
        previousDue: currentDueAmount,
        newDue: newDueAmount,
        date: today
      };
      
      const updatedHistory = [...existingHistory, newHistoryEntry];

      // Update bill with new due amount and history
      await updateDoc(billRef, {
        due: newDueAmount > 0 ? newDueAmount.toString() : null,
        dueHistory: updatedHistory,
        updatedAt: serverTimestamp()
      });

      setEditingDueBillId(null);
      setEditingDueAmount('');
      setCurrentDueAmount(0);
      alert(`Amount paid: ₹${amountPaid.toFixed(2)}\nNew due amount: ₹${newDueAmount.toFixed(2)}`);
    } catch (error) {
      console.error('Error updating due amount:', error);
      alert('Failed to update due amount. Please try again.');
    }
  };

  const handleCancelEditDue = () => {
    setEditingDueBillId(null);
    setEditingDueAmount('');
    setCurrentDueAmount(0);
  };

  const handleReturnBill = (bill) => {
    // Initialize return items with bill items
    // Account for already returned quantities
    const initialReturnItems = (bill.items || []).map((item, index) => {
      const originalQuantity = item.originalQuantity || item.quantity || 0;
      const alreadyReturned = item.returnedQuantity || 0;
      const currentQuantity = item.quantity || 0;
      // Max returnable is the current quantity (what's left after previous returns)
      const maxReturnable = currentQuantity;
      
      return {
        ...item,
        returnQuantity: 0,
        maxReturnQuantity: maxReturnable,
        originalIndex: index,
        originalQuantity: originalQuantity,
        alreadyReturned: alreadyReturned
      };
    });
    setReturnItems(initialReturnItems);
    setReturningBillId(bill.id);
  };

  const handleReturnQuantityChange = (index, value) => {
    const updatedItems = [...returnItems];
    const maxQty = updatedItems[index].maxReturnQuantity;
    const returnQty = Math.max(0, Math.min(parseInt(value) || 0, maxQty));
    updatedItems[index].returnQuantity = returnQty;
    setReturnItems(updatedItems);
  };

  const handleProcessReturn = async () => {
    const itemsToReturn = returnItems.filter(item => item.returnQuantity > 0);
    
    if (itemsToReturn.length === 0) {
      alert('Please select items and quantities to return');
      return;
    }

    if (!window.confirm(`Are you sure you want to return ${itemsToReturn.length} item(s)?`)) {
      return;
    }

    try {
      const billRef = doc(db, 'bills', returningBillId);
      const billDoc = await getDoc(billRef);
      
      if (!billDoc.exists()) {
        alert('Bill not found');
        return;
      }

      const billData = billDoc.data();
      const batch = writeBatch(db);

      // Update stock for each returned item
      for (const item of itemsToReturn) {
        if (item.productId) {
          await restoreProductStock(
            item.productId,
            item.returnQuantity,
            item.variationSize || null
          );
        }
      }

      // Update bill items with returned quantities
      const updatedItems = billData.items.map((item, index) => {
        const returnItem = returnItems.find(ri => ri.originalIndex === index);
        if (returnItem && returnItem.returnQuantity > 0) {
          const currentQuantity = item.quantity || 0;
          const previouslyReturned = item.returnedQuantity || 0;
          const newQuantity = Math.max(0, currentQuantity - returnItem.returnQuantity);
          const newSubtotal = (item.price || 0) * newQuantity;
          const totalReturned = previouslyReturned + returnItem.returnQuantity;
          return {
            ...item,
            quantity: newQuantity,
            subtotal: newSubtotal,
            returnedQuantity: totalReturned,
            originalQuantity: item.originalQuantity || currentQuantity + previouslyReturned
          };
        }
        return item;
      });

      // Calculate original discount percentage
      const totalReturnedSoFar = (billData.returnedItems || []).reduce((sum, item) => sum + (item.subtotal || 0), 0);
      const originalSubtotal = (billData.subtotal || 0) + totalReturnedSoFar;
      const discountPercent = originalSubtotal > 0 ? (parseFloat(billData.discount || 0) / originalSubtotal) : 0;

      // Calculate new subtotal (remaining items)
      const newSubtotal = updatedItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
      
      // Calculate remaining discount
      const newDiscount = newSubtotal * discountPercent;
      const newTotal = newSubtotal - newDiscount;
      
      // Calculate discounted returned amount for items being returned now
      const summary = calculateReturnSummary(billData, itemsToReturn);
      const discountedReturnedAmount = summary.cashReturn;
      
      // Calculate new due (reduce due by discounted returned amount)
      const currentDue = parseFloat(billData.due || 0);
      const newDue = Math.max(0, currentDue - discountedReturnedAmount);

      // Get existing returnedItems if any
      const existingReturnedItems = billData.returnedItems || [];
      const returnBatchId = `return-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const returnedAt = new Date();
      
      // Prepare new returned items with regular timestamp (serverTimestamp() not supported in arrays)
      const newReturnedItems = itemsToReturn.map(item => ({
        returnBatchId: returnBatchId,
        productId: item.productId,
        productName: item.productName,
        variationSize: item.variationSize || null,
        quantity: item.returnQuantity,
        price: item.price,
        subtotal: (item.price || 0) * item.returnQuantity,
        returnedAt: returnedAt
      }));

      // Update bill
      batch.update(billRef, {
        items: updatedItems,
        originalSubtotal: billData.originalSubtotal ?? originalSubtotal,
        originalDiscount: billData.originalDiscount ?? parseFloat(billData.discount || 0),
        originalTotal: billData.originalTotal ?? parseFloat(billData.total || 0),
        subtotal: newSubtotal,
        total: newTotal,
        discount: newDiscount,
        due: newDue > 0 ? newDue : null,
        returnedItems: [...existingReturnedItems, ...newReturnedItems],
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      
      alert(`Return processed successfully! Stock updated for ${itemsToReturn.length} item(s).`);
      setReturningBillId(null);
      setReturnItems([]);
    } catch (error) {
      console.error('Error processing return:', error);
      alert('Failed to process return. Please try again.');
    }
  };

  const handleCancelReturn = () => {
    setReturningBillId(null);
    setReturnItems([]);
  };

  const generateBillNumber = (billNumber) => {
    return `MPS/${String(billNumber).padStart(5, '0')}`;
  };

  const getNextBillNumber = async () => {
    try {
      const billsSnapshot = await getDocs(collection(db, 'bills'));
      const billsList = [];
      billsSnapshot.forEach((doc) => {
        billsList.push({ id: doc.id, ...doc.data() });
      });
      
      if (billsList.length === 0) {
        return 1;
      }

      // Extract bill numbers and find the highest
      const billNumbers = billsList
        .map(bill => bill.billNumber)
        .filter(bn => bn && bn.startsWith('MPS/'))
        .map(bn => {
          const numStr = bn.replace('MPS/', '');
          return parseInt(numStr, 10);
        })
        .filter(num => !isNaN(num));

      if (billNumbers.length === 0) {
        return 1;
      }

      const maxBillNumber = Math.max(...billNumbers);
      return maxBillNumber + 1;
    } catch (error) {
      console.error('Error getting next bill number:', error);
      return 1;
    }
  };

  const handleResetAllBills = async () => {
    if (!window.confirm('Are you sure you want to delete ALL bills? This action cannot be undone and will reset bill numbers to MPS/00001.')) {
      return;
    }

    if (!window.confirm('This will permanently delete all bills. Are you absolutely sure?')) {
      return;
    }

    try {
      const billsSnapshot = await getDocs(collection(db, 'bills'));
      const batch = writeBatch(db);
      let count = 0;

      billsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
      });

      await batch.commit();
      alert(`Successfully deleted ${count} bill(s). New bills will start from MPS/00001.`);
      setBillSearchQuery('');
    } catch (error) {
      console.error('Error deleting all bills:', error);
      alert('Failed to delete all bills. Please try again.');
    }
  };

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateDiscount = () => {
    return parseFloat(billForm.discount) || 0;
  };

  const calculateFinalTotal = () => {
    const subtotal = calculateSubtotal();
    const discount = calculateDiscount();
    return Math.max(0, subtotal - discount);
  };

  const calculatePaidAmount = () => {
    return parseAmountValue(billForm.paidAmount);
  };

  const hasPaidAmountEntry = () => {
    return String(billForm.paidAmount ?? '').trim() !== '';
  };

  const calculateTotalAdjustments = () => {
    return adjustments.reduce((total, adj) => {
      if (adj.type === 'due') return total + adj.amount;
      if (adj.type === 'cashReturn') return total - adj.amount;
      return total;
    }, 0);
  };

  const calculateAdjustedTotal = () => {
    return Math.max(0, calculateFinalTotal() + calculateTotalAdjustments());
  };

  const calculateDueAmount = () => {
    const adjustedTotal = calculateAdjustedTotal();
    const paid = calculatePaidAmount();
    if (!hasPaidAmountEntry()) return 0;
    return Math.max(0, adjustedTotal - paid);
  };

  const calculateReturnSummary = (bill, items) => {
    const returnSubtotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.returnQuantity || item.quantity || 0)), 0);
    
    // Calculate original discount percentage
    const totalReturnedSoFar = (bill.returnedItems || []).reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const originalSubtotal = (bill.subtotal || 0) + totalReturnedSoFar;
    const discountPercent = originalSubtotal > 0 ? (parseFloat(bill.discount || 0) / originalSubtotal) : 0;
    
    const discountAdjustment = returnSubtotal * discountPercent;
    const rawCashReturn = returnSubtotal - discountAdjustment;
    const cashReturn = Math.round(rawCashReturn);
    const roundOff = cashReturn - rawCashReturn;
    
    return {
      subtotal: returnSubtotal,
      discountPercent: discountPercent * 100,
      discountAdjustment: discountAdjustment,
      totalBeforeRoundOff: rawCashReturn,
      roundOff: roundOff,
      cashReturn: cashReturn
    };
  };

  const toDateObject = (value) => {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatPdfHistoryDate = (value) => {
    if (typeof value === 'string') {
      const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        return `${isoMatch[2]}-${isoMatch[3]}-${isoMatch[1]}`;
      }
    }

    const date = toDateObject(value);
    if (!date) return 'N/A';
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
  };

  const formatReturnSectionDate = (value) => {
    const date = toDateObject(value);
    return date ? date.toLocaleDateString('en-GB') : 'N/A';
  };

  const getPaidAgainstDue = (bill) => {
    return (bill.dueHistory || []).reduce((sum, entry) => {
      return sum + parseAmountValue(entry.amountPaid || 0);
    }, 0);
  };

  const getInitialDueForBill = (bill) => {
    const currentDue = parseAmountValue(bill.due);
    const dueHistory = bill.dueHistory || [];
    let initialDue = parseAmountValue(bill.initialDueAmount);

    if (initialDue === 0 && dueHistory.length > 0) {
      const firstEntry = dueHistory[0];
      if (firstEntry.amount !== undefined && firstEntry.amountPaid === undefined) {
        initialDue = parseFloat(firstEntry.amount || 0);
      } else if (firstEntry.newDue !== undefined) {
        let maxPreviousDue = 0;
        dueHistory.forEach(entry => {
          if (entry.previousDue !== undefined) {
            maxPreviousDue = Math.max(maxPreviousDue, parseFloat(entry.previousDue || 0));
          }
        });
        initialDue = maxPreviousDue > 0 ? maxPreviousDue : parseFloat(firstEntry.newDue || 0);
      }
    }

    return initialDue === 0 ? currentDue : initialDue;
  };

  const calculateReturnSettlement = (bill, returnSummary) => {
    const currentDue = parseAmountValue(bill.due);
    const returnAmount = Math.max(0, parseFloat(returnSummary?.cashReturn || 0));

    if (currentDue > 0) {
      return { due: currentDue, cashReturn: 0 };
    }

    const initialDue = getInitialDueForBill(bill);
    if (initialDue <= 0) {
      return { due: 0, cashReturn: returnAmount };
    }

    const paidAgainstDue = getPaidAgainstDue(bill);
    const dueBeforeReturns = Math.max(0, initialDue - paidAgainstDue);
    return { due: 0, cashReturn: Math.max(0, returnAmount - dueBeforeReturns) };
  };

  const groupReturnedItemsByEvent = (returnedItems) => {
    const groups = new Map();

    returnedItems.forEach((item, index) => {
      const dateValue = item.returnedAt || item.returnDate || item.date;
      const date = toDateObject(dateValue);
      const timestamp = date ? date.getTime() : index;
      const key = item.returnBatchId || item.returnId || `legacy-${Math.floor(timestamp / 60000)}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          dateValue,
          timestamp,
          items: []
        });
      }

      groups.get(key).items.push(item);
    });

    return Array.from(groups.values()).sort((a, b) => a.timestamp - b.timestamp);
  };

  const calculateReturnEventCashReturn = (bill, previousReturnedItems, currentReturnedItems) => {
    if (parseAmountValue(bill.due) > 0) return 0;

    const initialDue = getInitialDueForBill(bill);
    const dueBeforeReturns = Math.max(0, initialDue - getPaidAgainstDue(bill));
    const previousSummary = previousReturnedItems.length > 0
      ? calculateReturnSummary(bill, previousReturnedItems)
      : { cashReturn: 0 };
    const currentSummary = calculateReturnSummary(bill, [...previousReturnedItems, ...currentReturnedItems]);
    const previousExcess = Math.max(0, previousSummary.cashReturn - dueBeforeReturns);
    const currentExcess = Math.max(0, currentSummary.cashReturn - dueBeforeReturns);
    return Math.max(0, currentExcess - previousExcess);
  };

  const drawFinalBalanceBox = (pdfDoc, label, amount, y) => {
    const boxX = 108;
    const boxY = y - 6.5;
    const boxWidth = 82;
    const boxHeight = 10;

    pdfDoc.setFillColor(215, 214, 200);
    pdfDoc.setDrawColor(175, 175, 165);
    pdfDoc.setLineWidth(0.3);
    pdfDoc.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'FD');

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setFontSize(11);
    pdfDoc.setTextColor(30, 30, 30);
    pdfDoc.text(`${label} Rs.`, boxX + 4, y, { align: 'left' });
    pdfDoc.text(amount.toFixed(2), boxX + boxWidth - 4, y, { align: 'right' });
  };

  const drawReturnedItemsSection = (pdfDoc, bill, returnGroup, startY, previousReturnedItems) => {
    let finalY = startY + 5;
    const returnedItems = returnGroup.items;

    pdfDoc.setFontSize(12);
    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setTextColor(40, 40, 40);
    pdfDoc.text('RETURNED ITEMS', 20, finalY);

    pdfDoc.setFontSize(10);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setTextColor(100, 100, 100);
    pdfDoc.text(`Date - ${formatReturnSectionDate(returnGroup.dateValue)}`, 190, finalY, { align: 'right' });

    finalY += 5;

    const returnedTableData = returnedItems.map((item, index) => {
      const productName = formatProductWithVariation(
        item.productName || item.name,
        item.variationSize,
        positionForSavedBillItem(item)
      );
      const quantity = item.quantity || 0;
      const price = item.price || 0;
      const amount = item.subtotal || (quantity * price);
      return [
        String(index + 1),
        productName,
        String(quantity),
        'Rs. ' + price.toFixed(2),
        'Rs. ' + amount.toFixed(2)
      ];
    });

    pdfDoc.autoTable({
      startY: finalY,
      head: [['SL No.', 'Product', 'Qty.', 'Price', 'Amount']],
      body: returnedTableData,
      theme: 'striped',
      headStyles: {
        fillColor: [100, 100, 100],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10
      },
      styles: {
        fontSize: 9,
        font: 'helvetica',
        textColor: [0, 0, 0]
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      margin: { left: 20, right: 20 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 70 },
        2: { cellWidth: 20 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30 }
      }
    });

    let returnSummaryY = pdfDoc.lastAutoTable.finalY + 10;
    const returnSummary = calculateReturnSummary(bill, returnedItems);
    const cashReturn = calculateReturnEventCashReturn(bill, previousReturnedItems, returnedItems);

    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(0, 0, 0);
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text('Sub total Rs.', 150, returnSummaryY, { align: 'right' });
    pdfDoc.text(returnSummary.subtotal.toFixed(2), 190, returnSummaryY, { align: 'right' });
    returnSummaryY += 7;

    if (returnSummary.discountAdjustment > 0) {
      pdfDoc.text('Prev. Discount Adjusted -', 150, returnSummaryY, { align: 'right' });
      pdfDoc.text(`(-${returnSummary.discountAdjustment.toFixed(2)})`, 190, returnSummaryY, { align: 'right' });
      returnSummaryY += 7;
    }

    pdfDoc.text('Round off :', 150, returnSummaryY, { align: 'right' });
    pdfDoc.text(returnSummary.roundOff.toFixed(2), 190, returnSummaryY, { align: 'right' });
    returnSummaryY += 7;

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.text('Total :', 150, returnSummaryY, { align: 'right' });
    pdfDoc.text(returnSummary.cashReturn.toFixed(2), 190, returnSummaryY, { align: 'right' });
    returnSummaryY += 8;

    if (cashReturn > 0) {
      drawFinalBalanceBox(pdfDoc, 'CASH RETURN', cashReturn, returnSummaryY);
      returnSummaryY += 11;
    }

    return returnSummaryY + 10;
  };

  const getBillAdjustmentInfo = (bill) => {
    const currentDue = parseAmountValue(bill.due);
    const returnedItems = bill.returnedItems || [];
    
    if (returnedItems.length === 0) {
      return { due: currentDue, cashReturn: 0 };
    }
    
    const summary = calculateReturnSummary(bill, returnedItems);
    const settlement = calculateReturnSettlement(bill, summary);
    return { due: currentDue, cashReturn: Math.round(settlement.cashReturn) };
  };

  const handleAdjustBill = (bill) => {
    if (adjustments.find(a => a.billId === bill.id)) {
      alert('This bill is already adjusted in the current bill.');
      return;
    }
    const info = getBillAdjustmentInfo(bill);
    const newAdjustments = [];
    if (info.due > 0) {
      newAdjustments.push({
        billId: bill.id,
        billNumber: bill.billNumber || bill.id.slice(0, 8),
        type: 'due',
        amount: info.due
      });
    }
    if (info.cashReturn > 0) {
      newAdjustments.push({
        billId: bill.id,
        billNumber: bill.billNumber || bill.id.slice(0, 8),
        type: 'cashReturn',
        amount: info.cashReturn
      });
    }
    if (newAdjustments.length === 0) {
      alert('This bill has no due or cash return to adjust.');
      return;
    }
    setAdjustments([...adjustments, ...newAdjustments]);
    setAdjustBillSearchQuery('');
    setShowAdjustBillDropdown(false);
  };

  const removeAdjustment = (billId) => {
    setAdjustments(adjustments.filter(a => a.billId !== billId));
  };

  const handleGenerateBill = async () => {
    if (cart.length === 0) {
      alert('Please add products to the bill');
      return;
    }
    if (!billForm.fullName.trim()) {
      alert('Please enter customer full name');
      return;
    }
    if (!billForm.date) {
      alert('Please select a date');
      return;
    }

    // Basic numeric validations
    const subtotal = calculateSubtotal();
    const discountValue = calculateDiscount();
    if (discountValue < 0) {
      alert('Discount cannot be negative');
      return;
    }
    if (discountValue > subtotal) {
      alert('Discount cannot be greater than subtotal');
      return;
    }

    const finalTotal = Math.max(0, subtotal - discountValue);
    const adjustedTotal = calculateAdjustedTotal();

    // Parse paid amount
    const paidAmountEntered = hasPaidAmountEntry();
    const paidAmountValue = calculatePaidAmount();
    if (paidAmountValue < 0) {
      alert('Paid amount cannot be negative');
      return;
    }
    if (paidAmountValue > adjustedTotal) {
      alert('Paid amount cannot be greater than the adjusted total');
      return;
    }

    // Calculate due (remaining balance)
    const dueAmount = paidAmountEntered ? Math.max(0, adjustedTotal - paidAmountValue) : 0;

    // If there is a due amount (partial payment), phone number becomes mandatory
    let ensuredPhone = (billForm.phone || '').trim();
    if (dueAmount > 0 && !ensuredPhone) {
      const entered = window.prompt('Partial payment detected. Please enter customer phone number:', '');
      ensuredPhone = (entered || '').trim();
      if (!ensuredPhone) {
        alert('Phone number is required when there is a due amount.');
        return;
      }
      // Update form so the UI also reflects the phone number we just collected
      setBillForm(prev => ({ ...prev, phone: ensuredPhone }));
    }

    try {
      const subtotal = calculateSubtotal();
      const discount = calculateDiscount();
      const finalTotal = calculateFinalTotal();
      const nextBillNumber = await getNextBillNumber();
      const billNumber = generateBillNumber(nextBillNumber);

      // Calculate due amount (remaining balance = adjustedTotal - paid)
      const paidWasEntered = hasPaidAmountEntry();
      const paidAmt = calculatePaidAmount();
      const adjTotal = calculateAdjustedTotal();
      const dueAmt = paidWasEntered ? Math.max(0, adjTotal - paidAmt) : 0;
      
      // Initialize due history if there's a due amount
      let dueHistory = [];
      let initialDueAmount = 0;
      if (dueAmt > 0) {
        initialDueAmount = dueAmt;
        dueHistory = [{
          amount: dueAmt,
          date: new Date().toISOString().split('T')[0]
        }];
      }

      const billData = {
        fullName: billForm.fullName,
        date: billForm.date,
        address: billForm.address,
        phone: ensuredPhone || billForm.phone,
        discount: discount,
        due: dueAmt > 0 ? dueAmt.toString() : null,
        paidAmount: paidWasEntered ? paidAmt : adjTotal, // Blank means paid in full; entered 0 means no payment
        initialDueAmount: initialDueAmount, // Store initial due amount
        dueHistory: dueHistory,
        adjustments: adjustments.length > 0 ? adjustments.map(a => ({ billId: a.billId, billNumber: a.billNumber, type: a.type, amount: a.amount })) : null,
        adjustedTotal: adjustments.length > 0 ? adjTotal : null,
        billNumber: billNumber,
        billNumberValue: nextBillNumber,
        items: cart.map(item => ({
          productId: item.id,
          productName: item.name,
          price: item.price,
          quantity: item.quantity,
          originalQuantity: item.quantity,
          subtotal: item.price * item.quantity,
          variationSize: item.variationSize || null
        })),
        subtotal: subtotal,
        originalSubtotal: subtotal,
        total: finalTotal,
        originalDiscount: discount,
        originalTotal: finalTotal,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'bills'), billData);
      const billWithId = { id: docRef.id, ...billData };

      // Update previous bills that were adjusted (clear their due/cash return)
      for (const adj of adjustments) {
        try {
          const prevBillRef = doc(db, 'bills', adj.billId);
          if (adj.type === 'due') {
            await updateDoc(prevBillRef, {
              due: null,
              adjustedInBill: billNumber,
              updatedAt: serverTimestamp()
            });
          }
        } catch (err) {
          console.error('Error updating previous bill:', err);
        }
      }
      
      // Automatically open print dialog for the newly generated bill
      setTimeout(() => {
        printPDF(billWithId);
      }, 500);
      
      // Note: Stock is already updated when products were added to cart
      // So we just clear the cart and form
      setCart([]);
      setAdjustments([]);
      setAdjustBillSearchQuery('');
      setBillForm({
        fullName: '',
        date: new Date().toISOString().split('T')[0],
        address: '',
        gst: '',
        phone: '',
        discount: '',
        paidAmount: ''
      });
      setGeneratedBill(null); // Clear generatedBill since we directly trigger print
      
      alert('Bill generated successfully! Print dialog will open automatically.');
    } catch (error) {
      console.error('Error generating bill:', error);
      alert('Failed to generate bill');
    }
  };

  const downloadPDF = (bill = null) => {
    try {
      const billToDownload = bill || generatedBill;
      if (!billToDownload) {
        alert('Please generate a bill first');
        return;
      }

      const pdfDoc = new jsPDF();
      
      // Set default font
      pdfDoc.setFont('helvetica');
      
      // Company Information
      const companyName = 'MONDAL PLUMBING & SANITATION';
      const companyAddress = '89, COLLEGE ROAD, DIAMOND HARBOUR';
      const companyEmail = 'mondalplumbingsanitation@gmail.com';
      const companyPhone = '9434504491';
      
      // CASH MEMO at top right
      pdfDoc.setFontSize(24);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(100, 100, 100); // Grey color
      const cashMemoY = 20;
      pdfDoc.text('CASH MEMO', 190, cashMemoY, { align: 'right' });
      
      // Horizontal line from left that passes through the middle of CASH MEMO text
      // Font size 24: text baseline is at y=20, text extends upward ~18-20pt
      // Moving line lower to pass through middle of text
      const lineY = cashMemoY - 2.5; // Line passes through middle of text (decreased height slightly more)
      pdfDoc.setDrawColor(200, 200, 200);
      pdfDoc.line(20, lineY, 135, lineY); // Decreased length from right
      
      // Company Name - Right aligned
      pdfDoc.setFontSize(16);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.text(companyName, 190, 35, { align: 'right' });
      
      // Company Details - Right aligned
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setTextColor(120, 120, 120);
      pdfDoc.text(companyAddress, 190, 42, { align: 'right' });
      pdfDoc.text('Email - ' + companyEmail, 190, 48, { align: 'right' });
      pdfDoc.text('Phone - ' + companyPhone, 190, 54, { align: 'right' });
      
      // Horizontal line (moved down to increase height from top, shortened from both sides)
      pdfDoc.setDrawColor(200, 200, 200);
      pdfDoc.line(45, 68, 190, 68);
      
      // Reset text color to black
      pdfDoc.setTextColor(0, 0, 0);
      
      // BILL TO section on left
      let startY = 70;
      pdfDoc.setFontSize(16);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.text('BILL TO', 20, startY);
      
      // Customer details
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setTextColor(0, 0, 0);
      const customerName = String(billToDownload.fullName || billToDownload.customerName || 'N/A');
      pdfDoc.text(customerName, 20, startY + 10);
      
      let currentY = startY + 17;
      if (billToDownload.address) {
        const addressText = String(billToDownload.address);
        const addressLines = pdfDoc.splitTextToSize(addressText, 80);
        pdfDoc.text(addressLines, 20, currentY);
        currentY += (addressLines.length * 5);
      }
      
      // Always show phone number field
      const phoneNumber = billToDownload.phone || billToDownload.customerPhone || '';
      pdfDoc.text('Phone - ' + phoneNumber, 20, currentY);
      currentY += 7;
      
      // BILL NO and DATE on right (lowered)
      const billNumber = billToDownload.billNumber || billToDownload.id?.slice(0, 8).toUpperCase() || 'MPS/0001';
      const billDate = billToDownload.date || (billToDownload.createdAt?.toDate ? billToDownload.createdAt.toDate().toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));
      
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setTextColor(120, 120, 120);
      pdfDoc.text('BILL NO. : ' + billNumber, 190, startY + 5, { align: 'right' });
      pdfDoc.text('DATE : ' + billDate, 190, startY + 12, { align: 'right' });
      
      // Items Table
      if (!billToDownload.items || billToDownload.items.length === 0) {
        alert('No items found in this bill');
        return;
      }
      
      // Prepare table data with SL No.
      const tableData = billToDownload.items.map((item, index) => {
        const price = parseFloat(item.price || 0);
        const quantity = getOriginalItemQuantity(item);
        const amount = price * quantity;
        
        const productName = formatProductWithVariation(
          item.productName || 'N/A',
          item.variationSize,
          positionForSavedBillItem(item)
        );
        
        return [
          String(index + 1), // SL No.
          productName, // Product (with variation size if applicable)
          String(quantity), // Qty.
          'Rs. ' + price.toFixed(2), // Price
          'Rs. ' + amount.toFixed(2) // Amount
        ];
      });
      
      // Calculate table start Y (after customer info) - decreased height from top
      const tableStartY = Math.max(currentY, startY + 1);
      
      // Check if bill is fully paid (no due and no initial due) - show "PAID IN FULL" stamp on left
      const due = parseFloat(billToDownload.due || 0);
      const initialDueForStamp = parseFloat(billToDownload.initialDueAmount || 0);
      if (due === 0 && initialDueForStamp === 0) {
        // Draw "PAID IN FULL" stamp on the left side
        const stampX = 20;
        const stampY = tableStartY + 30; // Position stamp below customer info, above/beside table
        pdfDoc.setDrawColor(100, 100, 100);
        pdfDoc.setLineWidth(2);
        pdfDoc.roundedRect(stampX, stampY - 8, 50, 12, 2, 2); // Rounded rectangle
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(80, 80, 80);
        pdfDoc.text('PAID IN FULL', stampX + 25, stampY, { align: 'center' });
        pdfDoc.setLineWidth(0.5); // Reset line width
        pdfDoc.setDrawColor(0, 0, 0); // Reset draw color
      }
      
      pdfDoc.autoTable({
        startY: tableStartY,
        head: [['SL No.', 'Product', 'Qty.', 'Price', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { 
          fillColor: [100, 100, 100], // Grey header
          textColor: [255, 255, 255], // White text
          fontStyle: 'bold',
          fontSize: 10
        },
        styles: { 
          fontSize: 9,
          font: 'helvetica',
          textColor: [0, 0, 0]
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245] // Light grey for alternating rows
        },
        margin: { left: 20, right: 20 },
        columnStyles: {
          0: { cellWidth: 20 }, // SL No.
          1: { cellWidth: 70 }, // Product
          2: { cellWidth: 20 }, // Qty.
          3: { cellWidth: 30 }, // Price
          4: { cellWidth: 30 }  // Amount
        }
      });
      
      // Calculate final Y position after table
      let finalY = pdfDoc.lastAutoTable.finalY + 10;
      
      // Main Summary section directly below main table
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(0, 0, 0);
      
      const subtotal = getOriginalBillSubtotal(billToDownload);
      const discount = getOriginalBillDiscount(billToDownload);
      const total = billToDownload.originalTotal !== undefined && billToDownload.originalTotal !== null
        ? parseFloat(billToDownload.originalTotal || 0)
        : subtotal - discount;
      
      let summaryY = finalY;
      
      // 1. SUBTOTAL
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text('Subtotal Rs.', 150, summaryY, { align: 'right' });
      pdfDoc.text(subtotal.toFixed(2), 190, summaryY, { align: 'right' });
      summaryY += 7;
      
      // 2. DISCOUNT
      if (discount > 0) {
        pdfDoc.text('Discount Rs.', 150, summaryY, { align: 'right' });
        pdfDoc.text(discount.toFixed(2), 190, summaryY, { align: 'right' });
        summaryY += 7;
      }
      
      // 3. Total Rs.
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('Total Rs.', 150, summaryY, { align: 'right' });
      pdfDoc.text(total.toFixed(2), 190, summaryY, { align: 'right' });
      summaryY += 9;

      // 4. Bill no. X, Adjusted Amount Rs.  +  Adjusted Total Rs.
      const billAdjustments = billToDownload.adjustments || [];
      if (billAdjustments.length > 0) {
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.setFontSize(9);
        billAdjustments.forEach(adj => {
          pdfDoc.setTextColor(80, 80, 80);
          const prefix = adj.type === 'due' ? '+' : '-';
          pdfDoc.text(`Bill no. ${adj.billNumber}, Adjusted Amount Rs.`, 150, summaryY, { align: 'right' });
          pdfDoc.text(`${prefix}${adj.amount.toFixed(2)}`, 190, summaryY, { align: 'right' });
          summaryY += 6;
        });
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(0, 0, 0);
        const adjTotal = parseFloat(billToDownload.adjustedTotal || total);
        pdfDoc.text('Adjusted Total Rs.', 150, summaryY, { align: 'right' });
        pdfDoc.text(adjTotal.toFixed(2), 190, summaryY, { align: 'right' });
        summaryY += 9;
      }
      
      // 5. Paid Rs.
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(40, 40, 40);
      
      let initialDue = getInitialDueForBill(billToDownload);
      const dueHistory = billToDownload.dueHistory || [];
      const currentOutstandingDue = parseFloat(billToDownload.due || 0);
      const dueBeforePayments = currentOutstandingDue + getPaidAgainstDue(billToDownload);
      
      const paidAmount = billToDownload.paidAmount !== undefined ? parseFloat(billToDownload.paidAmount) : (initialDue > 0 ? (total - initialDue) : total);
      pdfDoc.text('Paid Rs.', 150, summaryY, { align: 'right' });
      pdfDoc.text(paidAmount.toFixed(2), 190, summaryY, { align: 'right' });
      summaryY += 7;
      
      // 6. DUE
      if (currentOutstandingDue > 0) {
        pdfDoc.setTextColor(40, 40, 40);
        pdfDoc.text('Due Rs.', 150, summaryY, { align: 'right' });
        pdfDoc.text(dueBeforePayments.toFixed(2), 190, summaryY, { align: 'right' });
        summaryY += 7;
        
        // 7. DUE HISTORY entries (Dd.mm.yyyy paid ..... due ....)
        const filteredHistory = dueHistory.filter(entry => entry.amountPaid !== undefined);
        if (filteredHistory.length > 0) {
          pdfDoc.setFontSize(9);
          filteredHistory.forEach((entry) => {
            const entryDate = formatPdfHistoryDate(entry.date || entry.timestamp);
            const amountPaid = parseFloat(entry.amountPaid || 0);
            pdfDoc.setTextColor(40, 40, 40);
            pdfDoc.text(`${entryDate}  Paid Rs. ${amountPaid.toFixed(2)}`, 190, summaryY, { align: 'right' });
            summaryY += 6;
          });
        }
      }
      
      // 8. Due Amount (current outstanding — bold red, always last)
      if (currentOutstandingDue > 0) {
        drawFinalBalanceBox(pdfDoc, 'DUE AMOUNT', currentOutstandingDue, summaryY);
        summaryY += 11;
      }
      
      finalY = summaryY + 10;

      // Check for returned items and add returned items table and summary
      const returnedItems = billToDownload.returnedItems || [];
      if (returnedItems.length > 0) {
        let previousReturnedItems = [];
        groupReturnedItemsByEvent(returnedItems).forEach((returnGroup) => {
          finalY = drawReturnedItemsSection(pdfDoc, billToDownload, returnGroup, finalY, previousReturnedItems);
          previousReturnedItems = [...previousReturnedItems, ...returnGroup.items];
        });
      }

      if (false && returnedItems.length > 0) {
        // Add spacing before returned items section
        finalY += 5;
        
        // "Returned Items" heading
        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setTextColor(40, 40, 40);
        pdfDoc.text('RETURNED ITEMS', 20, finalY);
        
        // Return Date (Top-right of Returned Items section)
        pdfDoc.setFontSize(10);
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.setTextColor(100, 100, 100);
        const lastReturn = returnedItems[returnedItems.length - 1];
        const returnDate = lastReturn?.returnedAt?.toDate ? lastReturn.returnedAt.toDate().toLocaleDateString('en-GB') : (lastReturn?.returnedAt instanceof Date ? lastReturn.returnedAt.toLocaleDateString('en-GB') : 'N/A');
        pdfDoc.text(`Date - ${returnDate}`, 190, finalY, { align: 'right' });
        
        finalY += 5;
        
        const returnedTableData = returnedItems.map((item, index) => {
          const productName = formatProductWithVariation(
            item.productName || item.name,
            item.variationSize,
            positionForSavedBillItem(item)
          );
          const quantity = item.quantity || 0;
          const price = item.price || 0;
          const amount = item.subtotal || (quantity * price);
          return [
            String(index + 1), // SL No.
            productName, // Product
            String(quantity), // Qty.
            'Rs. ' + price.toFixed(2), // Price
            'Rs. ' + amount.toFixed(2) // Amount
          ];
        });
        
        pdfDoc.autoTable({
          startY: finalY,
          head: [['SL No.', 'Product', 'Qty.', 'Price', 'Amount']],
          body: returnedTableData,
          theme: 'striped',
          headStyles: { 
            fillColor: [100, 100, 100],
            textColor: [255, 255, 255], // White text
            fontStyle: 'bold',
            fontSize: 10
          },
          styles: { 
            fontSize: 9,
            font: 'helvetica',
            textColor: [0, 0, 0]
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245]
          },
          margin: { left: 20, right: 20 },
          columnStyles: {
            0: { cellWidth: 20 }, // SL No.
            1: { cellWidth: 70 }, // Product
            2: { cellWidth: 20 }, // Qty.
            3: { cellWidth: 30 }, // Price
            4: { cellWidth: 30 }  // Amount
          }
        });
        
        let returnSummaryY = pdfDoc.lastAutoTable.finalY + 10;
        
        // Calculate return summary
        const returnSummary = calculateReturnSummary(billToDownload, returnedItems);
        const returnSettlement = calculateReturnSettlement(billToDownload, returnSummary);
        
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(0, 0, 0);
        
        // Sub total Rs.
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.text('Sub total Rs.', 150, returnSummaryY, { align: 'right' });
        pdfDoc.text(returnSummary.subtotal.toFixed(2), 190, returnSummaryY, { align: 'right' });
        returnSummaryY += 7;
        
        // Prev. Discount Adjusted - (-x)
        if (returnSummary.discountAdjustment > 0) {
          pdfDoc.text('Prev. Discount Adjusted -', 150, returnSummaryY, { align: 'right' });
          pdfDoc.text(`(-${returnSummary.discountAdjustment.toFixed(2)})`, 190, returnSummaryY, { align: 'right' });
          returnSummaryY += 7;
        }
        
        // Round off :
        pdfDoc.text('Round off :', 150, returnSummaryY, { align: 'right' });
        pdfDoc.text(returnSummary.roundOff.toFixed(2), 190, returnSummaryY, { align: 'right' });
        returnSummaryY += 7;
        
        // Total :
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Total :', 150, returnSummaryY, { align: 'right' });
        pdfDoc.text(returnSummary.cashReturn.toFixed(2), 190, returnSummaryY, { align: 'right' });
        returnSummaryY += 8;
        
        if (returnSettlement.cashReturn > 0) {
          // Cash Return : (green bold, double-underlined)
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setFontSize(11);
          pdfDoc.setTextColor(0, 150, 0);
          pdfDoc.text('Cash Return :', 150, returnSummaryY, { align: 'right' });
          pdfDoc.text(returnSettlement.cashReturn.toFixed(2), 190, returnSummaryY, { align: 'right' });
          returnSummaryY += 7;
          pdfDoc.setDrawColor(0, 150, 0);
          pdfDoc.setLineWidth(0.5);
          pdfDoc.line(155, returnSummaryY - 5.5, 190, returnSummaryY - 5.5);
          pdfDoc.line(155, returnSummaryY - 4.5, 190, returnSummaryY - 4.5);
        }
        
        finalY = returnSummaryY + 10;
      }
      
      // Reset text color to black for any remaining content
      pdfDoc.setTextColor(0, 0, 0);
      
      // Save PDF
      const fileName = `CashMemo_${billNumber}_${customerName.replace(/\s+/g, '_')}_${billDate.replace(/\//g, '-')}.pdf`;
      pdfDoc.save(fileName);
      
      // Show success message
      alert('PDF downloaded successfully! Check your Downloads folder.');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  const printPDF = (bill = null) => {
    try {
      const billToPrint = bill || generatedBill;
      if (!billToPrint) {
        alert('Please generate a bill first');
        return;
      }

      const pdfDoc = new jsPDF();
      
      // Set default font
      pdfDoc.setFont('helvetica');
      
      // Company Information
      const companyName = 'MONDAL PLUMBING & SANITATION';
      const companyAddress = '89, COLLEGE ROAD, DIAMOND HARBOUR';
      const companyEmail = 'mondalplumbingsanitation@gmail.com';
      const companyPhone = '9434504491';
      
      // CASH MEMO at top right
      pdfDoc.setFontSize(24);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(100, 100, 100); // Grey color
      const cashMemoY = 20;
      pdfDoc.text('CASH MEMO', 190, cashMemoY, { align: 'right' });
      
      // Horizontal line from left that passes through the middle of CASH MEMO text
      // Font size 24: text baseline is at y=20, text extends upward ~18-20pt
      // Moving line lower to pass through middle of text
      const lineY = cashMemoY - 2.5; // Line passes through middle of text (decreased height slightly more)
      pdfDoc.setDrawColor(200, 200, 200);
      pdfDoc.line(20, lineY, 135, lineY); // Decreased length from right
      
      // Company Name - Right aligned
      pdfDoc.setFontSize(16);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.text(companyName, 190, 35, { align: 'right' });
      
      // Company Details - Right aligned
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setTextColor(120, 120, 120);
      pdfDoc.text(companyAddress, 190, 42, { align: 'right' });
      pdfDoc.text('Email - ' + companyEmail, 190, 48, { align: 'right' });
      pdfDoc.text('Phone - ' + companyPhone, 190, 54, { align: 'right' });
      
      // Horizontal line (moved down to increase height from top, shortened from both sides)
      pdfDoc.setDrawColor(200, 200, 200);
      pdfDoc.line(45, 68, 190, 68);
      
      // Reset text color to black
      pdfDoc.setTextColor(0, 0, 0);
      
      // BILL TO section on left
      let startY = 70;
      pdfDoc.setFontSize(16);
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.setTextColor(100, 100, 100);
      pdfDoc.text('BILL TO', 20, startY);
      
      // Customer details
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setTextColor(0, 0, 0);
      const customerName = String(billToPrint.fullName || billToPrint.customerName || 'N/A');
      pdfDoc.text(customerName, 20, startY + 10);
      
      let currentY = startY + 17;
      if (billToPrint.address) {
        const addressText = String(billToPrint.address);
        const addressLines = pdfDoc.splitTextToSize(addressText, 80);
        pdfDoc.text(addressLines, 20, currentY);
        currentY += (addressLines.length * 5);
      }
      
      // Always show phone number field
      const phoneNumber = billToPrint.phone || billToPrint.customerPhone || '';
      pdfDoc.text('Phone - ' + phoneNumber, 20, currentY);
      currentY += 7;
      
      // BILL NO and DATE on right (lowered)
      const billNumber = billToPrint.billNumber || billToPrint.id?.slice(0, 8).toUpperCase() || 'MPS/0001';
      const billDate = billToPrint.date || (billToPrint.createdAt?.toDate ? billToPrint.createdAt.toDate().toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));
      
      pdfDoc.setFontSize(10);
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setTextColor(120, 120, 120);
      pdfDoc.text('BILL NO. : ' + billNumber, 190, startY + 5, { align: 'right' });
      pdfDoc.text('DATE : ' + billDate, 190, startY + 12, { align: 'right' });
      
      // Items Table
      if (!billToPrint.items || billToPrint.items.length === 0) {
        alert('No items found in this bill');
        return;
      }
      
      // Prepare table data with SL No.
      const tableData = billToPrint.items.map((item, index) => {
        const price = parseFloat(item.price || 0);
        const quantity = getOriginalItemQuantity(item);
        const amount = price * quantity;
        
        const productName = formatProductWithVariation(
          item.productName || 'N/A',
          item.variationSize,
          positionForSavedBillItem(item)
        );
        
        return [
          String(index + 1), // SL No.
          productName, // Product (with variation size if applicable)
          String(quantity), // Qty.
          'Rs. ' + price.toFixed(2), // Price
          'Rs. ' + amount.toFixed(2) // Amount
        ];
      });
      
      // Calculate table start Y (after customer info) - decreased height from top
      const tableStartY = Math.max(currentY, startY + 1);
      
      // Check if bill is fully paid (no due and no initial due) - show "PAID IN FULL" stamp on left
      const due = parseFloat(billToPrint.due || 0);
      const initialDueForStamp = parseFloat(billToPrint.initialDueAmount || 0);
      if (due === 0 && initialDueForStamp === 0) {
        // Draw "PAID IN FULL" stamp on the left side
        const stampX = 20;
        const stampY = tableStartY + 30; // Position stamp below customer info, above/beside table
        pdfDoc.setDrawColor(100, 100, 100);
        pdfDoc.setLineWidth(2);
        pdfDoc.roundedRect(stampX, stampY - 8, 50, 12, 2, 2); // Rounded rectangle
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(80, 80, 80);
        pdfDoc.text('PAID IN FULL', stampX + 25, stampY, { align: 'center' });
        pdfDoc.setLineWidth(0.5); // Reset line width
        pdfDoc.setDrawColor(0, 0, 0); // Reset draw color
      }
      
      pdfDoc.autoTable({
        startY: tableStartY,
        head: [['SL No.', 'Product', 'Qty.', 'Price', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { 
          fillColor: [100, 100, 100], // Grey header
          textColor: [255, 255, 255], // White text
          fontStyle: 'bold',
          fontSize: 10
        },
        styles: { 
          fontSize: 9,
          font: 'helvetica',
          textColor: [0, 0, 0]
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245] // Light grey for alternating rows
        },
        margin: { left: 20, right: 20 },
        columnStyles: {
          0: { cellWidth: 20 }, // SL No.
          1: { cellWidth: 70 }, // Product
          2: { cellWidth: 20 }, // Qty.
          3: { cellWidth: 30 }, // Price
          4: { cellWidth: 30 }  // Amount
        }
      });
      
      // Calculate final Y position after table
      let finalY = pdfDoc.lastAutoTable.finalY + 10;
      
      // Main Summary section directly below main table
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(0, 0, 0);
      
      const subtotal = getOriginalBillSubtotal(billToPrint);
      const discount = getOriginalBillDiscount(billToPrint);
      const total = billToPrint.originalTotal !== undefined && billToPrint.originalTotal !== null
        ? parseFloat(billToPrint.originalTotal || 0)
        : subtotal - discount;
      
      let summaryY = finalY;
      
      // 1. SUBTOTAL
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.text('Subtotal Rs.', 150, summaryY, { align: 'right' });
      pdfDoc.text(subtotal.toFixed(2), 190, summaryY, { align: 'right' });
      summaryY += 7;
      
      // 2. DISCOUNT
      if (discount > 0) {
        pdfDoc.text('Discount Rs.', 150, summaryY, { align: 'right' });
        pdfDoc.text(discount.toFixed(2), 190, summaryY, { align: 'right' });
        summaryY += 7;
      }
      
      // 3. Total Rs.
      pdfDoc.setFont('helvetica', 'bold');
      pdfDoc.text('Total Rs.', 150, summaryY, { align: 'right' });
      pdfDoc.text(total.toFixed(2), 190, summaryY, { align: 'right' });
      summaryY += 9;

      // 4. Bill no. X, Adjusted Amount Rs.  +  Adjusted Total Rs.
      const billAdjustments = billToPrint.adjustments || [];
      if (billAdjustments.length > 0) {
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.setFontSize(9);
        billAdjustments.forEach(adj => {
          pdfDoc.setTextColor(80, 80, 80);
          const prefix = adj.type === 'due' ? '+' : '-';
          pdfDoc.text(`Bill no. ${adj.billNumber}, Adjusted Amount Rs.`, 150, summaryY, { align: 'right' });
          pdfDoc.text(`${prefix}${adj.amount.toFixed(2)}`, 190, summaryY, { align: 'right' });
          summaryY += 6;
        });
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(0, 0, 0);
        const adjTotal = parseFloat(billToPrint.adjustedTotal || total);
        pdfDoc.text('Adjusted Total Rs.', 150, summaryY, { align: 'right' });
        pdfDoc.text(adjTotal.toFixed(2), 190, summaryY, { align: 'right' });
        summaryY += 9;
      }
      
      // 5. Paid Rs.
      pdfDoc.setFont('helvetica', 'normal');
      pdfDoc.setFontSize(10);
      pdfDoc.setTextColor(40, 40, 40);
      
      let initialDue = getInitialDueForBill(billToPrint);
      const dueHistory = billToPrint.dueHistory || [];
      const currentOutstandingDue = parseFloat(billToPrint.due || 0);
      const dueBeforePayments = currentOutstandingDue + getPaidAgainstDue(billToPrint);
      
      const paidAmount = billToPrint.paidAmount !== undefined ? parseFloat(billToPrint.paidAmount) : (initialDue > 0 ? (total - initialDue) : total);
      pdfDoc.text('Paid Rs.', 150, summaryY, { align: 'right' });
      pdfDoc.text(paidAmount.toFixed(2), 190, summaryY, { align: 'right' });
      summaryY += 7;
      
      // 6. Due Rs. (initial due at bill creation)
      if (currentOutstandingDue > 0) {
        pdfDoc.setTextColor(40, 40, 40);
        pdfDoc.text('Due Rs.', 150, summaryY, { align: 'right' });
        pdfDoc.text(dueBeforePayments.toFixed(2), 190, summaryY, { align: 'right' });
        summaryY += 10;
        
        // 7. Dd.mm.yyyy  Paid .....  Due ....
        const filteredHistory = dueHistory.filter(entry => entry.amountPaid !== undefined);
        if (filteredHistory.length > 0) {
          pdfDoc.setFontSize(9);
          filteredHistory.forEach(entry => {
            const entryDate = formatPdfHistoryDate(entry.date || entry.timestamp);
            const amtPaid = parseFloat(entry.amountPaid || 0);
            pdfDoc.setTextColor(40, 40, 40);
            pdfDoc.text(
              `${entryDate}  Paid Rs. ${amtPaid.toFixed(2)}`,
              190, summaryY, { align: 'right' }
            );
            summaryY += 6;
          });
          summaryY += 4;
        }
      }
      
      // 8. Due Amount (current outstanding — bold red, always last)
      if (currentOutstandingDue > 0) {
        drawFinalBalanceBox(pdfDoc, 'DUE AMOUNT', currentOutstandingDue, summaryY);
        summaryY += 11;
      }
      
      finalY = summaryY + 10;

      // Check for returned items and add returned items table and summary
      const returnedItems = billToPrint.returnedItems || [];
      if (returnedItems.length > 0) {
        let previousReturnedItems = [];
        groupReturnedItemsByEvent(returnedItems).forEach((returnGroup) => {
          finalY = drawReturnedItemsSection(pdfDoc, billToPrint, returnGroup, finalY, previousReturnedItems);
          previousReturnedItems = [...previousReturnedItems, ...returnGroup.items];
        });
      }

      if (false && returnedItems.length > 0) {
        // Add spacing before returned items section
        finalY += 5;
        
        // "Returned Items" heading
        pdfDoc.setFontSize(12);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setTextColor(40, 40, 40);
        pdfDoc.text('RETURNED ITEMS', 20, finalY);
        
        // Return Date (Top-right of Returned Items section)
        pdfDoc.setFontSize(10);
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.setTextColor(100, 100, 100);
        const lastReturn = returnedItems[returnedItems.length - 1];
        const returnDate = lastReturn?.returnedAt?.toDate ? lastReturn.returnedAt.toDate().toLocaleDateString('en-GB') : (lastReturn?.returnedAt instanceof Date ? lastReturn.returnedAt.toLocaleDateString('en-GB') : 'N/A');
        pdfDoc.text(`Date - ${returnDate}`, 190, finalY, { align: 'right' });
        
        finalY += 5;
        
        const returnedTableData = returnedItems.map((item, index) => {
          const productName = formatProductWithVariation(
            item.productName || item.name,
            item.variationSize,
            positionForSavedBillItem(item)
          );
          const quantity = item.quantity || 0;
          const price = item.price || 0;
          const amount = item.subtotal || (quantity * price);
          return [
            String(index + 1), // SL No.
            productName, // Product
            String(quantity), // Qty.
            'Rs. ' + price.toFixed(2), // Price
            'Rs. ' + amount.toFixed(2) // Amount
          ];
        });
        
        pdfDoc.autoTable({
          startY: finalY,
          head: [['SL No.', 'Product', 'Qty.', 'Price', 'Amount']],
          body: returnedTableData,
          theme: 'striped',
          headStyles: { 
            fillColor: [100, 100, 100],
            textColor: [255, 255, 255], // White text
            fontStyle: 'bold',
            fontSize: 10
          },
          styles: { 
            fontSize: 9,
            font: 'helvetica',
            textColor: [0, 0, 0]
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245]
          },
          margin: { left: 20, right: 20 },
          columnStyles: {
            0: { cellWidth: 20 }, // SL No.
            1: { cellWidth: 70 }, // Product
            2: { cellWidth: 20 }, // Qty.
            3: { cellWidth: 30 }, // Price
            4: { cellWidth: 30 }  // Amount
          }
        });
        
        let returnSummaryY = pdfDoc.lastAutoTable.finalY + 10;
        
        // Calculate return summary
        const returnSummary = calculateReturnSummary(billToPrint, returnedItems);
        const returnSettlement = calculateReturnSettlement(billToPrint, returnSummary);
        
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(0, 0, 0);
        
        // Sub total Rs.
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(0, 0, 0);
        pdfDoc.text('Sub total Rs.', 150, returnSummaryY, { align: 'right' });
        pdfDoc.text(returnSummary.subtotal.toFixed(2), 190, returnSummaryY, { align: 'right' });
        returnSummaryY += 7;
        
        // Prev. Discount Adjusted - (-x)
        if (returnSummary.discountAdjustment > 0) {
          pdfDoc.text('Prev. Discount Adjusted -', 150, returnSummaryY, { align: 'right' });
          pdfDoc.text(`(-${returnSummary.discountAdjustment.toFixed(2)})`, 190, returnSummaryY, { align: 'right' });
          returnSummaryY += 7;
        }
        
        // Round off :
        pdfDoc.text('Round off :', 150, returnSummaryY, { align: 'right' });
        pdfDoc.text(returnSummary.roundOff.toFixed(2), 190, returnSummaryY, { align: 'right' });
        returnSummaryY += 7;
        
        // Total :
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text('Total :', 150, returnSummaryY, { align: 'right' });
        pdfDoc.text(returnSummary.cashReturn.toFixed(2), 190, returnSummaryY, { align: 'right' });
        returnSummaryY += 8;
        
        if (returnSettlement.cashReturn > 0) {
          // Cash Return : (green bold, double-underlined)
          pdfDoc.setFont('helvetica', 'bold');
          pdfDoc.setFontSize(11);
          pdfDoc.setTextColor(0, 150, 0);
          pdfDoc.text('Cash Return :', 150, returnSummaryY, { align: 'right' });
          pdfDoc.text(returnSettlement.cashReturn.toFixed(2), 190, returnSummaryY, { align: 'right' });
          returnSummaryY += 7;
          pdfDoc.setDrawColor(0, 150, 0);
          pdfDoc.setLineWidth(0.5);
          pdfDoc.line(155, returnSummaryY - 5.5, 190, returnSummaryY - 5.5);
          pdfDoc.line(155, returnSummaryY - 4.5, 190, returnSummaryY - 4.5);
        }
        
        finalY = returnSummaryY + 10;
      }
      
      // Reset text color to black for any remaining content
      pdfDoc.setTextColor(0, 0, 0);
      
      // Open a lightweight print window we fully control to avoid PDF viewer cross-origin restrictions
      const pdfBlob = pdfDoc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open('', '_blank', 'width=900,height=650');

      if (!printWindow) {
        alert('Popup blocked. Please allow popups to print the bill.');
        return;
      }

      // Minimal HTML to render the PDF and trigger print, then auto-close
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print Bill</title>
            <style>
              html, body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
              }
              embed, iframe, object {
                width: 100%;
                height: 100%;
              }
            </style>
          </head>
          <body>
            <embed src="${pdfUrl}" type="application/pdf" />
            <script>
              const invokePrint = () => {
                try {
                  window.focus();
                  window.print();
                } catch (err) {
                  console.error('Print invocation failed', err);
                }
              };
              // Give the PDF a moment to load before printing
              setTimeout(invokePrint, 400);
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error('Error printing PDF:', error);
      alert('Error printing PDF. Please try again.');
    }
  };

  // Optimized search function that handles:
  // 1. Partial word matching (missing words don't break search)
  // 2. Word order independence
  // 3. Ignoring spaces (e.g., "WaterTank" matches "Water Tank")
  // 4. Handling numbers in parentheses (e.g., "75" matches "(75 mm)", "75mm" matches "(75 mm)")
  const matchesProductSearch = (text, query) => {
    if (!text || !query) return false;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    // Normalize: remove parentheses, spaces, and keep alphanumeric characters
    // This allows "75mm" to match "(75 mm)" and "75" to match "(75 mm)"
    const normalizeText = (str) => {
      return str.replace(/[()\s]+/g, '').toLowerCase();
    };
    
    const normalizedText = normalizeText(lowerText);
    const normalizedQuery = normalizeText(lowerQuery);
    
    // For single-word queries (like "pump"), check if it appears as a whole substring first
    // This prevents "p" from matching "P Trap" - we need the whole word "pump"
    if (!lowerQuery.includes(' ') && lowerQuery.length >= 2) {
      // Single word query - must appear as a whole substring
      if (lowerText.includes(lowerQuery) || normalizedText.includes(normalizedQuery)) {
        return true;
      }
      // For single-word queries, if it doesn't match as a whole, don't continue
      return false;
    }
    
    // For multi-word queries, first check if normalized query appears in normalized text
    if (normalizedText.includes(normalizedQuery)) return true;
    
    // Third check: split query into words and check if all/most words appear
    // Extract words and numbers separately (for multi-word queries)
    const queryWords = lowerQuery
      .split(/\s+/) // Split by spaces only
      .filter(word => word.length > 0)
      .map(word => word.replace(/[()]/g, '')) // Remove parentheses from individual words
      .filter(word => word.length >= 2); // Ignore single letters (require at least 2 chars)
    
    if (queryWords.length === 0) return false;
    
    // Normalize text words similarly
    const textWords = lowerText
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word.replace(/[()]/g, ''))
      .filter(word => word.length > 0);
    
    // Check if each query word appears in the text (with or without spaces, parentheses)
    const matchedWords = queryWords.filter(queryWord => {
      const normalizedQueryWord = normalizeText(queryWord);
      
      // Check in normalized text
      if (normalizedText.includes(normalizedQueryWord)) return true;
      
      // Check in text with spaces
      if (lowerText.includes(queryWord)) return true;
      
      // Check if query word is part of any text word
      return textWords.some(textWord => {
        const normalizedTextWord = normalizeText(textWord);
        return normalizedTextWord.includes(normalizedQueryWord) || 
               normalizedQueryWord.includes(normalizedTextWord) ||
               textWord.includes(queryWord) || 
               queryWord.includes(textWord);
      });
    });
    
    // Match if at least 70% of words are found (handles missing words like "type")
    const matchThreshold = Math.max(1, Math.ceil(queryWords.length * 0.7));
    return matchedWords.length >= matchThreshold;
  };

  // Relevance scoring similar to Stock Management search
  const calculateProductSearchRelevance = (product, query) => {
    if (!query.trim()) return 0;
    
    const lowerQuery = query.toLowerCase().trim();
    const lowerName = (product.name || '').toLowerCase();
    const lowerCategory = (product.category || '').toLowerCase();
    const lowerSubcategory = (product.subcategory || '').toLowerCase();
    
    let score = 0;
    
    // Exact phrase match in name
    if (lowerName.includes(lowerQuery)) {
      score += 1000;
      if (lowerName.startsWith(lowerQuery)) {
        score += 500;
      }
    }
    
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
    const nameWords = lowerName.split(/\s+/);
    
    if (queryWords.length > 1) {
      let wordIndex = 0;
      for (let i = 0; i < nameWords.length && wordIndex < queryWords.length; i++) {
        if (nameWords[i].includes(queryWords[wordIndex])) {
          wordIndex++;
        }
      }
      if (wordIndex === queryWords.length) {
        score += 800;
        let adjacentCount = 0;
        for (let i = 0; i < nameWords.length - 1; i++) {
          const twoWords = nameWords[i] + ' ' + nameWords[i + 1];
          if (lowerQuery.includes(twoWords) || twoWords.includes(lowerQuery)) {
            adjacentCount++;
          }
        }
        if (adjacentCount > 0) {
          score += 300;
        }
      }
    }
    
    const allWordsMatch = queryWords.every(qw =>
      nameWords.some(nw => nw.includes(qw) || qw.includes(nw))
    );
    if (allWordsMatch) {
      score += 400;
    }
    
    if (lowerCategory.includes(lowerQuery)) {
      score += 200;
    }
    if (lowerSubcategory.includes(lowerQuery)) {
      score += 150;
    }
    
    queryWords.forEach(qw => {
      if (lowerName.includes(qw)) {
        score += 100;
      }
    });
    
    return score;
  };

  return (
    <div className="bill-generation">
      <div className="bill-header">
        <h2>Bill Generation</h2>
        <div className="bill-header-right">
        <button
          className="toggle-bills-btn"
          onClick={() => setShowBills(!showBills)}
        >
          {showBills ? 'Hide Bills' : 'View All Bills'}
        </button>
          {showBills && (
            <label className="bill-due-toggle">
              <input
                type="checkbox"
                checked={showDueOnly}
                onChange={(e) => setShowDueOnly(e.target.checked)}
              />
              <span>Show due bills only</span>
            </label>
          )}
        </div>
      </div>

      {showBills ? (
        <div className="bills-list">
          <div className="bills-list-header">
            <h3>All Bills</h3>
            <div className="bills-controls">
              <input
                type="text"
                placeholder="Search by bill no, customer name, or phone..."
                value={billSearchQuery}
                onChange={(e) => setBillSearchQuery(e.target.value)}
                className="bill-search-input"
              />
              <button
                className="reset-bills-btn"
                onClick={handleResetAllBills}
                title="Delete all bills"
              >
                🔄 Reset All Bills
              </button>
            </div>
          </div>
          {bills.length === 0 ? (
            <p className="no-bills">No bills generated yet.</p>
          ) : (
            <>
              {(() => {
                const filteredBills = bills.filter(bill => {
                  const searchTerm = billSearchQuery.toLowerCase().trim();
                  const billNum = (bill.billNumber || '').toLowerCase();
                  const customerName = (bill.fullName || bill.customerName || '').toLowerCase();
                  const billId = (bill.id || '').toLowerCase();
                  const phone = (bill.phone || bill.customerPhone || '').toLowerCase();

                  // Match search (if empty, everything matches)
                  const matchesSearch =
                    !searchTerm ||
                    billNum.includes(searchTerm) ||
                    customerName.includes(searchTerm) ||
                    phone.includes(searchTerm) ||
                    billId.includes(searchTerm);

                  if (!matchesSearch) return false;

                  // If not filtering by due, we're done
                  if (!showDueOnly) return true;

                  // Only keep bills with a positive numeric due
                  const rawDue = bill.due;
                  if (rawDue == null || rawDue === '') return false;
                  if (typeof rawDue === 'number') return rawDue > 0;
                  const cleaned = String(rawDue).replace(/[^0-9.-]/g, '');
                  const num = parseFloat(cleaned);
                  return !isNaN(num) && num > 0;
                });
                
                return filteredBills.length === 0 ? (
                  <p className="no-bills">No bills found matching your search.</p>
                ) : (
                  <div className="bills-grid">
                    {filteredBills.map((bill) => (
                      <div key={bill.id} className="bill-card">
                        <div className="bill-card-header">
                          <h4>Bill #{bill.billNumber || bill.id.slice(0, 8)}</h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="bill-date">
                            {bill.createdAt?.toDate().toLocaleDateString()}
                          </span>
                            <div className="bill-menu-container" style={{ position: 'relative' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuBillId(openMenuBillId === bill.id ? null : bill.id);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '20px',
                                  padding: '4px 8px',
                                  color: '#333',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '4px',
                                  transition: 'background 0.2s',
                                  fontWeight: 'bold',
                                  lineHeight: '0.5',
                                  gap: '2px'
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                                title="More options"
                              >
                                <span>•</span>
                                <span>•</span>
                                <span>•</span>
                              </button>
                              {openMenuBillId === bill.id && (
                                <div
                                  className="bill-menu-dropdown"
                                  style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    backgroundColor: 'white',
                                    border: '1px solid #ddd',
                                    borderRadius: '5px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                    zIndex: 1000,
                                    minWidth: '150px',
                                    marginTop: '5px',
                                    overflow: 'hidden'
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadPDF(bill);
                                      setOpenMenuBillId(null);
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '10px 15px',
                                      border: 'none',
                                      background: 'none',
                                      textAlign: 'left',
                                      cursor: 'pointer',
                                      fontSize: '14px',
                                      color: '#333',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px'
                                    }}
                                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                                    onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                                  >
                                    📄 Download PDF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteBill(bill.id);
                                      setOpenMenuBillId(null);
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '10px 15px',
                                      border: 'none',
                                      background: 'none',
                                      textAlign: 'left',
                                      cursor: 'pointer',
                                      fontSize: '14px',
                                      color: '#e74c3c',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      borderTop: '1px solid #eee'
                                    }}
                                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                                    onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                  <div className="bill-card-body">
                    <p><strong>Customer:</strong> {bill.fullName || bill.customerName}</p>
                    {bill.phone && (
                      <p><strong>Phone:</strong> {bill.phone}</p>
                    )}
                    {bill.date && (
                      <p><strong>Date:</strong> {bill.date}</p>
                    )}
                    <p><strong>Items:</strong> {bill.items?.length || 0}</p>
                    <p className="bill-total"><strong>Total:</strong> ₹{bill.total?.toFixed(2)}</p>
                    {(() => {
                      const rawDue = bill.due;
                      let dueNumeric = 0;
                      if (rawDue != null && rawDue !== '') {
                        if (typeof rawDue === 'number') {
                          dueNumeric = rawDue;
                        } else {
                          const cleaned = String(rawDue).replace(/[^0-9.-]/g, '');
                          const num = parseFloat(cleaned);
                          if (!isNaN(num)) dueNumeric = num;
                        }
                      }
                      const hasDue = dueNumeric > 0;
                      return hasDue ? (
                        <div className="bill-due-indicator">
                          <span className="due-badge">Due: ₹{dueNumeric.toFixed(2)}</span>
                        </div>
                      ) : null;
                    })()}
                    {editingDueBillId === bill.id ? (
                      <div className="edit-due-form">
                        <label className="edit-due-label">Amount Paid</label>
                        <div className="due-info-display">
                          <span className="due-info-item">Current Due: ₹{currentDueAmount.toFixed(2)}</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={currentDueAmount}
                          value={editingDueAmount}
                          onChange={(e) => setEditingDueAmount(e.target.value)}
                          onWheel={handleNumberInputWheel}
                          placeholder="Enter amount paid"
                          className="edit-due-input"
                        />
                        {editingDueAmount && !isNaN(parseFloat(editingDueAmount.replace(/[^0-9.-]/g, ''))) && (
                          <div className="due-calculation">
                            <span className="due-calculation-label">New Due Amount:</span>
                            <span className="due-calculation-value">
                              ₹{Math.max(0, currentDueAmount - parseFloat(editingDueAmount.replace(/[^0-9.-]/g, '') || 0)).toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="edit-due-buttons">
                          <button
                            className="save-due-btn"
                            onClick={() => handleSaveDueAmount(bill.id)}
                            disabled={!editingDueAmount.trim() || parseFloat(editingDueAmount.replace(/[^0-9.-]/g, '') || 0) <= 0}
                          >
                            Save
                          </button>
                          <button
                            className="cancel-due-btn"
                            onClick={handleCancelEditDue}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="bill-actions">
                      <button
                        className="return-bill-btn"
                        onClick={() => handleReturnBill(bill)}
                        title="Return Bill"
                      >
                        ↩️ Return
                      </button>
                      <button
                        className="print-bill-btn"
                        onClick={() => printPDF(bill)}
                        title="Print Bill"
                      >
                        🖨️ Print
                      </button>
                      {(() => {
                        const rawDue = bill.due;
                        let dueNumeric = 0;
                        if (rawDue != null && rawDue !== '') {
                          if (typeof rawDue === 'number') {
                            dueNumeric = rawDue;
                          } else {
                            const cleaned = String(rawDue).replace(/[^0-9.-]/g, '');
                            const num = parseFloat(cleaned);
                            if (!isNaN(num)) dueNumeric = num;
                          }
                        }
                        return dueNumeric > 0 ? (
                          <button
                            className="edit-due-btn"
                            onClick={() => handleEditDueAmount(bill)}
                            title="Edit Due Amount"
                          >
                            ✏️ Edit Due
                          </button>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="bill-form">
            <div className="form-section">
              <h3>Customer Information</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    name="fullName"
                    value={billForm.fullName}
                    onChange={handleFormChange}
                    placeholder="Enter customer full name"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    name="date"
                    value={billForm.date}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    name="phone"
                    value={billForm.phone}
                    onChange={handleFormChange}
                    placeholder="Enter phone number"
                  />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input
                    type="text"
                    name="address"
                    value={billForm.address}
                    onChange={handleFormChange}
                    placeholder="Enter customer address"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="section-header-with-switch">
                <h3>Add Products</h3>
                <div className="custom-product-switch">
                  <label className="switch-label">
                    <span className="switch-text">Add Custom Product</span>
                    <div className="switch-container">
                      <input
                        type="checkbox"
                        checked={customProductMode}
                        onChange={(e) => {
                          setCustomProductMode(e.target.checked);
                          if (e.target.checked) {
                            // Clear selected product when switching to custom mode
                            setSelectedProduct('');
                            setProductSearchQuery('');
                          } else {
                            // Clear custom product fields when switching back
                            setCustomProduct({
                              name: '',
                              quantity: 1,
                              price: ''
                            });
                          }
                        }}
                        className="switch-input"
                      />
                      <span className="switch-slider"></span>
                    </div>
                  </label>
                </div>
              </div>
              {customProductMode ? (
                <div className="custom-product-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Product Name *</label>
                      <input
                        type="text"
                        value={customProduct.name}
                        onChange={(e) => setCustomProduct({ ...customProduct, name: e.target.value })}
                        placeholder="Enter product name"
                        className="product-search-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        value={customProduct.quantity}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || value === '0') {
                            setCustomProduct({ ...customProduct, quantity: '' });
                          } else {
                            const numValue = parseInt(value);
                            if (!isNaN(numValue) && numValue >= 1) {
                              setCustomProduct({ ...customProduct, quantity: numValue });
                            }
                          }
                        }}
                        onWheel={handleNumberInputWheel}
                        onBlur={(e) => {
                          if (e.target.value === '' || parseInt(e.target.value) < 1) {
                            setCustomProduct({ ...customProduct, quantity: 1 });
                          }
                        }}
                        className="quantity-input"
                        placeholder="Enter quantity"
                      />
                    </div>
                    <div className="form-group">
                      <label>Price (₹) *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customProduct.price}
                        onChange={(e) => setCustomProduct({ ...customProduct, price: e.target.value })}
                        onWheel={handleNumberInputWheel}
                        placeholder="Enter price"
                        className="quantity-input"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="add-product-btn"
                    onClick={handleAddCustomProduct}
                    disabled={!customProduct.name.trim() || !customProduct.price || customProduct.quantity < 1}
                  >
                    Add Custom Product
                  </button>
                </div>
              ) : (
                <div className="product-selector">
                  <div className="form-group product-search-group">
                    <label>Select Product *</label>
                    <div className="product-search-container">
                      <input
                        type="text"
                        value={productSearchQuery}
                        onChange={(e) => {
                          setProductSearchQuery(e.target.value);
                          setShowProductDropdown(true);
                          if (!e.target.value) {
                            setSelectedProduct('');
                          }
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        onBlur={() => {
                          // Delay hiding dropdown to allow click
                          setTimeout(() => setShowProductDropdown(false), 200);
                        }}
                        className="product-search-input"
                      />
                      {showProductDropdown && (
                        <div className="product-dropdown">
                          {(() => {
                            const trimmedQuery = (productSearchQuery || '').trim();
                            const matching = products.filter(p =>
                              p.quantity > 0 &&
                              (
                                !trimmedQuery ||
                                matchesProductSearch(p.name, trimmedQuery) ||
                                (p.category && matchesProductSearch(p.category, trimmedQuery)) ||
                                (p.subcategory && matchesProductSearch(p.subcategory, trimmedQuery))
                              )
                            );
                            
                            if (matching.length === 0) {
                              return (
                                <div className="product-dropdown-item no-results">
                                  No products found
                                </div>
                              );
                            }
                            
                            const sorted = trimmedQuery
                              ? matching.sort((a, b) =>
                                  calculateProductSearchRelevance(b, trimmedQuery) -
                                  calculateProductSearchRelevance(a, trimmedQuery)
                                )
                              : matching;
                            
                            return sorted.slice(0, 30).map((product) => (
                              <div
                                key={product.id}
                                className="product-dropdown-item"
                                onMouseDown={(e) => {
                                  e.preventDefault(); // Prevent input blur
                                  setSelectedProduct(product.id);
                                  setSelectedVariation(''); // Reset variation when product changes
                                  setProductSearchQuery(product.name);
                                  setShowProductDropdown(false);
                                }}
                              >
                                <span className="product-name">{product.name}</span>
                                {(!product.variations || !Array.isArray(product.variations) || product.variations.length === 0) && (
                                  <span className="product-price">₹{product.price?.toFixed(2)}</span>
                                )}
                                {product.variations && Array.isArray(product.variations) && product.variations.length > 0 && (
                                  <span className="product-stock" style={{ color: '#667eea' }}>Has variations - Select size</span>
                                )}
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedProduct && (() => {
                    const selectedProductData = products.find(p => p.id === selectedProduct);
                    const hasVariations = selectedProductData?.variations && Array.isArray(selectedProductData.variations) && selectedProductData.variations.length > 0;
                    
                    if (hasVariations) {
                      return (
                        <div className="form-group">
                          <label>Select Size *</label>
                          <select
                            value={selectedVariation}
                            onChange={(e) => {
                              setSelectedVariation(e.target.value);
                              setProductQuantity(''); // Reset quantity when size changes
                            }}
                            className="product-search-input"
                            required
                          >
                            <option value="">Choose a size...</option>
                            {selectedProductData.variations
                              .filter(v => (v.quantity || 0) > 0) // Only show variations with stock
                              .map((variation, index) => (
                                <option key={index} value={variation.size}>
                                  {variation.size}
                                </option>
                              ))}
                          </select>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div className="form-group quantity-group">
                    <label>Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      value={productQuantity}
                      onWheel={handleNumberInputWheel}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || value === '0') {
                          setProductQuantity('');
                        } else {
                          const numValue = parseInt(value);
                          if (!isNaN(numValue) && numValue >= 1) {
                            setProductQuantity(numValue);
                          }
                        }
                      }}
                      onBlur={(e) => {
                        // Keep it blank if empty, don't set default value
                        if (e.target.value === '' || parseInt(e.target.value) < 1) {
                          setProductQuantity('');
                        }
                      }}
                      className="quantity-input"
                      placeholder="Enter quantity"
                    />
                  </div>
                  <button
                    type="button"
                    className="add-product-btn"
                    onClick={handleAddProduct}
                    disabled={(() => {
                      if (!selectedProduct) return true;
                      const selectedProductData = products.find(p => p.id === selectedProduct);
                      const hasVariations = selectedProductData?.variations && Array.isArray(selectedProductData.variations) && selectedProductData.variations.length > 0;
                      if (hasVariations && !selectedVariation) return true;
                      return false;
                    })()}
                  >
                    Add Product
                  </button>
                </div>
              )}
            </div>

            <div className="form-section">
              <h3>Selected Products</h3>
              {cart.length === 0 ? (
                <p className="empty-cart">No products added. Select products from above.</p>
              ) : (
                <div className="cart-items">
                  <table>
                    <thead>
                      <tr>
                        <th>SL No.</th>
                        <th>Product</th>
                        <th>Brand</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Quantity</th>
                        <th>Subtotal</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, index) => {
                        const isEditingCustom = editingCustomItem && editingCustomItem.id === item.id && item.isCustomProduct;
                        const isEditingQuantity = editingQuantityItemId === item.id && !item.isCustomProduct;
                        return (
                        <tr key={item.id}>
                            <td data-label="SL No.">{index + 1}</td>
                          <td data-label="Product">
                            {formatProductWithVariation(item.name, item.variationSize, positionForCartItem(item))}
                          </td>
                          <td data-label="Brand">{item.category || '-'}</td>
                          <td data-label="Category">{item.subcategory || '-'}</td>
                            <td data-label="Price">
                              {item.isCustomProduct && isEditingCustom ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editingCustomItem.price}
                                  onChange={(e) =>
                                    setEditingCustomItem({
                                      ...editingCustomItem,
                                      price: e.target.value
                                    })
                                  }
                                  onWheel={handleNumberInputWheel}
                                  className="quantity-input-edit"
                                  style={{
                                    width: '100px',
                                    padding: '0.5rem',
                                    border: '1px solid #ddd',
                                    borderRadius: '5px',
                                    textAlign: 'center',
                                    fontSize: '1rem'
                                  }}
                                />
                              ) : (
                                <>₹{item.price?.toFixed(2)}</>
                              )}
                            </td>
                          <td data-label="Quantity">
                              {item.isCustomProduct && isEditingCustom ? (
                                <input
                                  type="number"
                                  min="1"
                                  value={editingCustomItem.quantity}
                                  onChange={(e) =>
                                    setEditingCustomItem({
                                      ...editingCustomItem,
                                      quantity: e.target.value
                                    })
                                  }
                                  onWheel={handleNumberInputWheel}
                                  className="quantity-input-edit"
                                  style={{
                                    width: '80px',
                                    padding: '0.5rem',
                                    border: '1px solid #ddd',
                                    borderRadius: '5px',
                                    textAlign: 'center',
                                    fontSize: '1rem'
                                  }}
                                />
                              ) : isEditingQuantity ? (
                            <input
                              type="number"
                              min="1"
                                  value={editingQuantityValue}
                              onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '' || parseInt(value) >= 1) {
                                      setEditingQuantityValue(value);
                                    }
                                  }}
                                  onWheel={handleNumberInputWheel}
                              className="quantity-input-edit"
                              style={{
                                width: '80px',
                                padding: '0.5rem',
                                border: '1px solid #ddd',
                                borderRadius: '5px',
                                textAlign: 'center',
                                fontSize: '1rem'
                              }}
                            />
                              ) : (
                                <span>{item.quantity}</span>
                              )}
                          </td>
                          <td data-label="Subtotal">₹{(item.price * item.quantity).toFixed(2)}</td>
                          <td data-label="Action">
                              {item.isCustomProduct ? (
                                isEditingCustom ? (
                                  <>
                                    <button
                                      className="add-product-btn"
                                      type="button"
                                      onClick={() => {
                                        const newPrice = parseFloat(editingCustomItem.price);
                                        const newQty = parseInt(editingCustomItem.quantity, 10);
                                        if (isNaN(newPrice) || newPrice <= 0) {
                                          alert('Please enter a valid price');
                                          return;
                                        }
                                        if (isNaN(newQty) || newQty <= 0) {
                                          alert('Quantity must be greater than 0');
                                          return;
                                        }
                                        setCart(cart.map(ci =>
                                          ci.id === item.id
                                            ? { ...ci, price: newPrice, quantity: newQty }
                                            : ci
                                        ));
                                        setEditingCustomItem(null);
                                      }}
                                      style={{ marginRight: '0.5rem' }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      className="remove-btn"
                                      type="button"
                                      onClick={() => setEditingCustomItem(null)}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      className="add-product-btn"
                                      type="button"
                                      onClick={() =>
                                        setEditingCustomItem({
                                          id: item.id,
                                          price: item.price.toString(),
                                          quantity: item.quantity.toString()
                                        })
                                      }
                                      style={{ marginRight: '0.5rem' }}
                                    >
                                      Edit
                                    </button>
                            <button
                              className="remove-btn"
                              onClick={() => removeFromCart(item.id)}
                            >
                              Remove
                            </button>
                                  </>
                                )
                              ) : isEditingQuantity ? (
                                <>
                                  <button
                                    className="add-product-btn"
                                    type="button"
                                    onClick={() => {
                                      const newQty = parseInt(editingQuantityValue, 10);
                                      if (isNaN(newQty) || newQty <= 0) {
                                        alert('Quantity must be greater than 0');
                                        return;
                                      }
                                      updateCartQuantity(item.id, newQty);
                                      setEditingQuantityItemId(null);
                                      setEditingQuantityValue('');
                                    }}
                                    style={{ marginRight: '0.5rem' }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="remove-btn"
                                    type="button"
                                    onClick={() => {
                                      setEditingQuantityItemId(null);
                                      setEditingQuantityValue('');
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="add-product-btn"
                                    type="button"
                                    onClick={() => {
                                      setEditingQuantityItemId(item.id);
                                      setEditingQuantityValue(item.quantity.toString());
                                    }}
                                    style={{ marginRight: '0.5rem' }}
                                  >
                                    Edit
                                  </button>
                                <button
                                  className="remove-btn"
                                  onClick={() => removeFromCart(item.id)}
                                >
                                  Remove
                                </button>
                                </>
                              )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="form-section">
              <h3>Bill Summary</h3>
              <div className="bill-summary">
                <div className="summary-row">
                  <span><strong>Subtotal:</strong></span>
                  <span><strong>₹{calculateSubtotal().toFixed(2)}</strong></span>
                </div>
                <div className="form-group discount-field">
                  <label>Discount (₹)</label>
                  <input
                    type="number"
                    name="discount"
                    value={billForm.discount}
                    onChange={handleFormChange}
                    onWheel={handleNumberInputWheel}
                    placeholder="Enter discount amount"
                    min="0"
                    step="0.01"
                  />
                </div>
                {billForm.discount && parseFloat(billForm.discount) > 0 && (
                  <div className="summary-row">
                    <span>Discount:</span>
                    <span>-₹{calculateDiscount().toFixed(2)}</span>
                  </div>
                )}
                <div className="summary-row total-row">
                  <span><strong>Total Amount:</strong></span>
                  <span><strong>₹{calculateFinalTotal().toFixed(2)}</strong></span>
                </div>

                {/* Adjust from Previous Bill */}
                <div className="form-group" style={{ marginTop: '12px', borderTop: '1px dashed #ccc', paddingTop: '12px' }}>
                  <label style={{ fontWeight: '600', color: '#555' }}>Adjust from Previous Bill</label>
                  <div className="product-search-container" style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={adjustBillSearchQuery}
                      onChange={(e) => {
                        setAdjustBillSearchQuery(e.target.value);
                        setShowAdjustBillDropdown(true);
                      }}
                      onFocus={() => setShowAdjustBillDropdown(true)}
                      onBlur={() => setTimeout(() => setShowAdjustBillDropdown(false), 200)}
                      placeholder="Search by bill number (e.g. MPS/00001)..."
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
                    />
                    {showAdjustBillDropdown && adjustBillSearchQuery.trim() && (
                      <div className="product-dropdown" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {(() => {
                          const query = adjustBillSearchQuery.toLowerCase().trim();
                          const matching = bills.filter(b => {
                            const billNum = (b.billNumber || '').toLowerCase();
                            const name = (b.fullName || b.customerName || '').toLowerCase();
                            const alreadyAdded = adjustments.some(a => a.billId === b.id);
                            if (alreadyAdded) return false;
                            const info = getBillAdjustmentInfo(b);
                            if (info.due <= 0 && info.cashReturn <= 0) return false;
                            return billNum.includes(query) || name.includes(query);
                          });
                          if (matching.length === 0) {
                            return (
                              <div className="product-dropdown-item no-results" style={{ padding: '10px', color: '#999' }}>
                                No bills found with due or cash return
                              </div>
                            );
                          }
                          return matching.slice(0, 10).map(bill => {
                            const info = getBillAdjustmentInfo(bill);
                            return (
                              <div
                                key={bill.id}
                                className="product-dropdown-item"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleAdjustBill(bill);
                                }}
                                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                              >
                                <div>
                                  <strong>{bill.billNumber || bill.id.slice(0, 8)}</strong>
                                  <span style={{ marginLeft: '8px', color: '#888', fontSize: '12px' }}>{bill.fullName || bill.customerName}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  {info.due > 0 && (
                                    <span style={{ color: '#e74c3c', fontSize: '12px', fontWeight: '600' }}>Due: ₹{info.due.toFixed(2)}</span>
                                  )}
                                  {info.cashReturn > 0 && (
                                    <span style={{ color: '#27ae60', fontSize: '12px', fontWeight: '600' }}>Return: ₹{info.cashReturn.toFixed(2)}</span>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Applied Adjustments */}
                {adjustments.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {adjustments.map((adj, idx) => (
                      <div key={idx} className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', color: '#9b59b6' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600' }}>
                          ** Bill no. {adj.billNumber}, Amount Adjusted
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '600' }}>
                            {adj.type === 'due' ? '+' : '-'}₹{adj.amount.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAdjustment(adj.billId)}
                            style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: '1' }}
                            title="Remove adjustment"
                          >✕</button>
                        </div>
                      </div>
                    ))}
                    <div className="summary-row total-row" style={{ marginTop: '4px', borderTop: '1px solid #ddd', paddingTop: '6px' }}>
                      <span><strong>Adjusted Total:</strong></span>
                      <span><strong>₹{calculateAdjustedTotal().toFixed(2)}</strong></span>
                    </div>
                  </div>
                )}

                <div className="form-group due-field" style={{ marginTop: '12px', borderTop: '1px dashed #ccc', paddingTop: '12px' }}>
                  <label>Paid Amount (₹)</label>
                  <input
                    type="number"
                    name="paidAmount"
                    value={billForm.paidAmount}
                    onChange={handleFormChange}
                    onWheel={handleNumberInputWheel}
                    placeholder="Enter amount paid by customer (optional)"
                    min="0"
                    step="0.01"
                  />
                </div>
                {hasPaidAmountEntry() && calculateDueAmount() > 0 && (
                  <div className="summary-row due-row" style={{ color: '#e74c3c', fontWeight: 'bold', marginTop: '8px' }}>
                    <span>Due (Remaining):</span>
                    <span>₹{calculateDueAmount().toFixed(2)}</span>
                  </div>
                )}
                {hasPaidAmountEntry() && calculatePaidAmount() >= calculateAdjustedTotal() && (
                  <div className="summary-row" style={{ color: '#27ae60', fontWeight: 'bold', marginTop: '8px' }}>
                    <span>✅ Fully Paid</span>
                  </div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button
                className="generate-bill-btn"
                onClick={handleGenerateBill}
                disabled={cart.length === 0 || !billForm.fullName.trim()}
              >
                Generate Bill
              </button>
            </div>
          </div>
        </>
      )}

      {/* Return Modal */}
      {returningBillId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancelReturn();
            }
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#27ae60', fontSize: '1.5rem' }}>Return Items</h3>
              <button
                type="button"
                onClick={handleCancelReturn}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#999',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                title="Close"
              >
                ×
              </button>
            </div>
            
            <div style={{ maxHeight: '500px', overflowY: 'auto', marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f0f0f0', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #ddd', fontWeight: '600' }}>Product</th>
                    <th style={{ padding: '12px', textAlign: 'center', border: '1px solid #ddd', fontWeight: '600' }}>Available to Return</th>
                    <th style={{ padding: '12px', textAlign: 'center', border: '1px solid #ddd', fontWeight: '600' }}>Return Qty</th>
                    <th style={{ padding: '12px', textAlign: 'right', border: '1px solid #ddd', fontWeight: '600' }}>Price</th>
                    <th style={{ padding: '12px', textAlign: 'right', border: '1px solid #ddd', fontWeight: '600' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item, index) => {
                    if (item.maxReturnQuantity <= 0) return null;
                    return (
                      <tr key={item.originalIndex || index} style={{ backgroundColor: item.returnQuantity > 0 ? '#fff9e6' : 'white' }}>
                        <td style={{ padding: '12px', border: '1px solid #ddd' }}>
                          <div style={{ fontWeight: '500' }}>
                            {formatProductWithVariation(item.productName || item.name, item.variationSize, positionForSavedBillItem(item))}
                          </div>
                          {item.alreadyReturned > 0 && (
                            <span style={{ color: '#999', fontSize: '0.85em', display: 'block', marginTop: '4px' }}>
                              (Already returned: {item.alreadyReturned})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #ddd' }}>
                          {item.maxReturnQuantity}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #ddd' }}>
                          <input
                            type="number"
                            min="0"
                            max={item.maxReturnQuantity}
                            value={item.returnQuantity || 0}
                            onChange={(e) => handleReturnQuantityChange(index, e.target.value)}
                            onWheel={handleNumberInputWheel}
                            style={{
                              width: '100px',
                              padding: '8px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              textAlign: 'center',
                              fontSize: '14px'
                            }}
                          />
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #ddd' }}>
                          ₹{(item.price || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', border: '1px solid #ddd', fontWeight: '500' }}>
                          ₹{((item.price || 0) * (item.returnQuantity || 0)).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  {returnItems.filter(item => item.maxReturnQuantity > 0).length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                        No items available to return
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {(() => {
              const returningBill = bills.find(b => b.id === returningBillId);
              const returnSummary = returningBill 
                ? calculateReturnSummary(returningBill, returnItems) 
                : { subtotal: 0, discountPercent: 0, discountAdjustment: 0, roundOff: 0, cashReturn: 0 };
              
              return (
                <div style={{ 
                  marginTop: '1.5rem',
                  paddingTop: '1.5rem',
                  borderTop: '2px solid #ddd',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '20px'
                }}>
                  {/* Left part: Actions */}
                  <div style={{ display: 'flex', gap: '12px', marginTop: 'auto' }}>
                    <button
                      className="cancel-due-btn"
                      onClick={handleCancelReturn}
                      style={{ padding: '10px 24px', fontSize: '1rem' }}
                    >
                      Cancel
                    </button>
                    <button
                      className="save-due-btn"
                      onClick={handleProcessReturn}
                      disabled={returnItems.filter(item => item.returnQuantity > 0).length === 0}
                      style={{ padding: '10px 24px', fontSize: '1rem' }}
                    >
                      Process Return
                    </button>
                  </div>

                  {/* Right part: Summary Card */}
                  <div style={{
                    width: '340px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    backgroundColor: '#f9f9f9',
                    padding: '1.2rem',
                    borderRadius: '8px',
                    border: '1px solid #eee',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#555' }}>
                      <span>Sub total:</span>
                      <span style={{ fontWeight: '500' }}>₹{returnSummary.subtotal.toFixed(2)}</span>
                    </div>
                    {returnSummary.discountAdjustment > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#e74c3c' }}>
                        <span>% discount adjusted ({returnSummary.discountPercent.toFixed(1)}%):</span>
                        <span style={{ fontWeight: '500' }}>-₹{returnSummary.discountAdjustment.toFixed(2)}</span>
                      </div>
                    )}
                    {Math.abs(returnSummary.roundOff) > 0.001 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#555' }}>
                        <span>Round off:</span>
                        <span style={{ fontWeight: '500' }}>
                          {returnSummary.roundOff > 0 ? '+' : '-'}₹{Math.abs(returnSummary.roundOff).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: '18px', 
                      color: '#27ae60', 
                      fontWeight: 'bold',
                      borderTop: '1px solid #ddd',
                      paddingTop: '8px',
                      marginTop: '4px'
                    }}>
                      <span>Cash return:</span>
                      <span style={{ 
                        borderBottom: '3px double #27ae60',
                        paddingBottom: '2px'
                      }}>₹{returnSummary.cashReturn.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default BillGeneration;
