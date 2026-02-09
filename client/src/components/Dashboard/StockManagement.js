import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase';
import { categoryService } from '../../services/firebaseService';
import './StockManagement.css';

function StockManagement() {
  const [products, setProducts] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    purchasePrice: '',
    quantity: '',
    category: '',
    subcategory: '',
    hsnCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [subcategories, setSubcategories] = useState([]);
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [variationEnabled, setVariationEnabled] = useState(true);
  const [variations, setVariations] = useState([]);
  const [openVariationProductId, setOpenVariationProductId] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    // Subscribe to brands collection so form can show brand/category options
    const unsubscribeCategories = categoryService.onCategoriesChange((cats, err) => {
      if (err) {
        console.error('Failed to listen categories:', err);
        return;
      }
      setCategories(cats || []);
    });

    // Set up real-time listener for products from Firestore
    const productsCollection = collection(db, 'products');

    const unsubscribe = onSnapshot(
      productsCollection,
      (snapshot) => {
        const productsList = [];
        snapshot.forEach((doc) => {
          productsList.push({ id: doc.id, ...doc.data() });
        });
        // Sort by createdAt if available (newest first), otherwise by name
        productsList.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            // Handle both Timestamp objects and Date objects
            const aTime = a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
            const bTime = b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
            return bTime - aTime; // Descending order
          }
          return (a.name || '').localeCompare(b.name || '');
        });
        setProducts(productsList);
        setInitialLoading(false);
      },
      (error) => {
        console.error('Error fetching products from Firestore:', error);
        setMessage({ type: 'error', text: `Failed to load products: ${error.message}` });
        setInitialLoading(false);
      }
    );

    return () => {
      unsubscribe();
      if (typeof unsubscribeCategories === 'function') unsubscribeCategories();
    };
  }, []);

  // When categories change, if current selectedCategoryId exists update its subcategories
  useEffect(() => {
    if (!selectedCategoryId) return;
    const cat = categories.find((c) => c.id === selectedCategoryId);
    setSubcategories(cat?.subcategories || []);
  }, [categories, selectedCategoryId]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Prevent number input from changing value on scroll
  const handleNumberInputWheel = (e) => {
    e.target.blur();
  };

  const handleCategorySelect = (e) => {
    const catId = e.target.value;
    setSelectedCategoryId(catId);
    const cat = categories.find((c) => c.id === catId);
    setSubcategories(cat?.subcategories || []);
    // Keep product.category as the category name for storage
    setFormData({ ...formData, category: cat ? cat.name : '' , subcategory: '' });
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      // Add product to Firestore
      // Use selected category name when available
      const categoryName = (() => {
        const cat = categories.find((c) => c.id === selectedCategoryId);
        return cat ? cat.name : formData.category.trim();
      })();

      const productData = {
        name: formData.name.trim(),
        category: categoryName,
        subcategory: formData.subcategory?.trim() || '',
        hsnCode: formData.hsnCode?.trim() || '',
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // If variations are enabled, save variations instead of single price/quantity
      if (variationEnabled && variations.length > 0) {
        // Validate variations
        const validVariations = variations
          .filter(v => v.size && v.price && v.quantity)
          .map(v => ({
            size: v.size.trim(),
            price: parseFloat(v.price),
            purchasePrice: v.purchasePrice ? parseFloat(v.purchasePrice) : null,
            quantity: parseInt(v.quantity),
            lowStockQuantity: v.lowStockQuantity ? parseInt(v.lowStockQuantity) : null,
            unit: v.unit?.trim() || ''
          }));
        
        if (validVariations.length === 0) {
          setMessage({ type: 'error', text: 'Please add at least one valid variation with size, price, and quantity' });
          setLoading(false);
          return;
        }
        
        productData.variations = validVariations;
        // Calculate total quantity from all variations
        productData.quantity = validVariations.reduce((sum, v) => sum + (v.quantity || 0), 0);
        // Use first variation's price as base price (or calculate average)
        productData.price = validVariations[0].price;
      } else {
        // Single product without variations
        productData.price = parseFloat(formData.price);
        productData.quantity = parseInt(formData.quantity);
      }

      await addDoc(collection(db, 'products'), productData);
      
      setFormData({
        name: '',
        price: '',
        purchasePrice: '',
        quantity: '',
        category: '',
        subcategory: '',
        hsnCode: ''
      });
      setSelectedCategoryId('');
      setVariationEnabled(true);
      setVariations([]);
      setShowAddForm(false);
      setMessage({ type: 'success', text: 'Product added successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error adding product to Firestore:', error);
      setMessage({ type: 'error', text: `Failed to add product: ${error.message}` });
    }
    setLoading(false);
  };

  const handleDeleteProduct = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
        setMessage({ type: 'success', text: 'Product deleted successfully!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      } catch (error) {
        console.error('Error deleting product from Firestore:', error);
        setMessage({ type: 'error', text: `Failed to delete product: ${error.message}` });
      }
    }
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product.id);
    setFormData({
      name: product.name || '',
      price: product.price?.toString() || '',
      purchasePrice: product.purchasePrice?.toString() || '',
      quantity: product.quantity?.toString() || '',
      category: product.category || '',
      subcategory: product.subcategory || '',
      hsnCode: product.hsnCode || ''
    });
    // Load variations if they exist
    if (product.variations && Array.isArray(product.variations) && product.variations.length > 0) {
      setVariationEnabled(true);
      setVariations(product.variations.map(v => ({
        size: v.size || '',
        price: v.price?.toString() || '',
        purchasePrice: v.purchasePrice?.toString() || '',
        quantity: v.quantity?.toString() || '',
        lowStockQuantity: v.lowStockQuantity?.toString() || '',
        unit: v.unit || ''
      })));
    } else {
      setVariationEnabled(false);
      setVariations([]);
    }
    // try to find category id by name
    const matched = categories.find((c) => c.name === (product.category || ''));
    if (matched) {
      setSelectedCategoryId(matched.id);
      setSubcategories(matched.subcategories || []);
    } else {
      setSelectedCategoryId('');
      setSubcategories([]);
    }
    setShowAddForm(true);
    // Scroll to form after a short delay to ensure DOM is updated
    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      const productRef = doc(db, 'products', editingProduct);
      const categoryName = (() => {
        const cat = categories.find((c) => c.id === selectedCategoryId);
        return cat ? cat.name : formData.category.trim();
      })();

      const updateData = {
        name: formData.name.trim(),
        category: categoryName,
        subcategory: formData.subcategory?.trim() || '',
        hsnCode: formData.hsnCode?.trim() || '',
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : null,
        updatedAt: serverTimestamp()
      };

      // If variations are enabled, save variations instead of single price/quantity
      if (variationEnabled && variations.length > 0) {
        // Validate variations
        const validVariations = variations
          .filter(v => v.size && v.price && v.quantity)
          .map(v => ({
            size: v.size.trim(),
            price: parseFloat(v.price),
            purchasePrice: v.purchasePrice ? parseFloat(v.purchasePrice) : null,
            quantity: parseInt(v.quantity),
            lowStockQuantity: v.lowStockQuantity ? parseInt(v.lowStockQuantity) : null,
            unit: v.unit?.trim() || ''
          }));
        
        if (validVariations.length === 0) {
          setMessage({ type: 'error', text: 'Please add at least one valid variation with size, price, and quantity' });
          setLoading(false);
          return;
        }
        
        updateData.variations = validVariations;
        // Calculate total quantity from all variations
        updateData.quantity = validVariations.reduce((sum, v) => sum + (v.quantity || 0), 0);
        // Use first variation's price as base price
        updateData.price = validVariations[0].price;
      } else {
        // Single product without variations
        updateData.price = parseFloat(formData.price);
        updateData.quantity = parseInt(formData.quantity);
        // Remove variations if switching from variations to single product
        updateData.variations = null;
      }

      await updateDoc(productRef, updateData);
      
      setFormData({
        name: '',
        price: '',
        purchasePrice: '',
        quantity: '',
        category: '',
        subcategory: '',
        hsnCode: ''
      });
      setSelectedCategoryId('');
      setVariationEnabled(true);
      setVariations([]);
      setShowAddForm(false);
      setEditingProduct(null);
      setMessage({ type: 'success', text: 'Product updated successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error updating product in Firestore:', error);
      setMessage({ type: 'error', text: `Failed to update product: ${error.message}` });
    }
    setLoading(false);
  };

  const handleCancel = () => {
    setFormData({
      name: '',
      price: '',
      quantity: '',
      category: '',
      subcategory: '',
      hsnCode: ''
    });
    setShowAddForm(false);
    setEditingProduct(null);
    setMessage({ type: '', text: '' });
    setVariationEnabled(true);
    setVariations([]);
  };

  // Variation management helpers
  const handleAddVariation = () => {
    setVariations([...variations, { size: '', price: '', purchasePrice: '', quantity: '', lowStockQuantity: '', unit: '' }]);
  };

  const handleRemoveVariation = (index) => {
    setVariations(variations.filter((_, i) => i !== index));
  };

  const handleVariationChange = (index, field, value) => {
    const updatedVariations = [...variations];
    updatedVariations[index] = {
      ...updatedVariations[index],
      [field]: value
    };
    setVariations(updatedVariations);
  };

  // Brand & Category management helpers
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return setMessage({ type: 'error', text: 'Brand name required' });
    try {
      await categoryService.addCategory(newCategoryName.trim());
      setNewCategoryName('');
      setMessage({ type: 'success', text: 'Brand added' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error('Add brand failed', err);
      setMessage({ type: 'error', text: 'Failed to add brand' });
    }
  };

  const handleAddSubcategory = async (categoryId) => {
    const name = newSubcategoryName.trim();
    if (!categoryId || !name) return setMessage({ type: 'error', text: 'Select brand and enter category' });
    try {
      await categoryService.addSubcategory(categoryId, name);
      setNewSubcategoryName('');
      setMessage({ type: 'success', text: 'Category added' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error('Add category failed', err);
      setMessage({ type: 'error', text: 'Failed to add category' });
    }
  };

  // Optimized search function that handles:
  // 1. Partial word matching (missing words don't break search)
  // 2. Word order independence
  // 3. Ignoring spaces (e.g., "WaterTank" matches "Water Tank")
  // 4. Handling numbers in parentheses (e.g., "75" matches "(75 mm)", "75mm" matches "(75 mm)")
  const matchesSearch = (text, query) => {
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

  // Filter products based on search query
  const filteredProducts = products.filter(product => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.trim();
    
    // Check name, category, description, and price
    return (
      matchesSearch(product.name, query) ||
      matchesSearch(product.category, query) ||
      matchesSearch(product.subcategory, query) ||
      matchesSearch(product.description, query) ||
      product.price?.toString().includes(query)
    );
  });

  return (
    <div className="stock-management">
      <div className="stock-header">
        <h2>Stock Management</h2>
        <button
          className="add-product-btn"
          onClick={() => {
            if (showAddForm) {
              handleCancel();
            } else {
              setShowAddForm(true);
              setEditingProduct(null);
              // Scroll to form after a short delay to ensure DOM is updated
              setTimeout(() => {
                if (formRef.current) {
                  formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }, 100);
            }
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Product'}
        </button>
      </div>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {showAddForm && (
        <div className="add-product-form" ref={formRef}>
          <h3>{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
          <form onSubmit={editingProduct ? handleUpdateProduct : handleAddProduct}>
            <div className="form-row">
              <div className="form-group">
                <label>Product Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Brand</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    name="categoryId"
                    value={selectedCategoryId}
                    onChange={handleCategorySelect}
                  >
                    <option value="">Select brand</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    name="subcategory"
                    value={formData.subcategory}
                    onChange={handleInputChange}
                    style={{ minWidth: 160 }}
                  >
                    <option value="">No category</option>
                    {subcategories.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button type="button" className="small-btn" onClick={() => setShowCategoryPanel((v) => !v)}>
                    Manage
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>HSN Code</label>
                <input
                  type="text"
                  name="hsnCode"
                  value={formData.hsnCode}
                  onChange={handleInputChange}
                  placeholder="Enter HSN code"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ width: '100%' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    checked={variationEnabled}
                    onChange={(e) => {
                      setVariationEnabled(e.target.checked);
                      if (!e.target.checked) {
                        setVariations([]);
                      } else if (variations.length === 0) {
                        setVariations([{ size: '', price: '', purchasePrice: '', quantity: '', lowStockQuantity: '', unit: '' }]);
                      }
                    }}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <span>Enable Variations</span>
                </label>
              </div>
            </div>
            
            {!variationEnabled ? (
              <div className="form-row">
                <div className="form-group">
                  <label>Price *</label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    onWheel={handleNumberInputWheel}
                    step="0.01"
                    min="0"
                    required={!variationEnabled}
                  />
                </div>
                <div className="form-group">
                  <label>Purchase Price</label>
                  <input
                    type="number"
                    name="purchasePrice"
                    value={formData.purchasePrice}
                    onChange={handleInputChange}
                    onWheel={handleNumberInputWheel}
                    step="0.01"
                    min="0"
                    placeholder="Cost price"
                  />
                </div>
                <div className="form-group">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    onWheel={handleNumberInputWheel}
                    min="0"
                    required={!variationEnabled}
                  />
                </div>
              </div>
            ) : (
              <div className="variations-section" style={{ marginTop: '15px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ fontWeight: 'bold' }}>Product Variations</label>
                </div>
                
                {variations.length === 0 ? (
                  <p style={{ color: '#666', fontStyle: 'italic' }}>No variations added. Click "Add New Variation" button below to add one.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {variations.map((variation, index) => (
                      <div
                        key={index}
                        style={{
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          padding: '15px',
                          backgroundColor: '#f9f9f9'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <strong>Variation {index + 1}</strong>
                          <button
                            type="button"
                            onClick={() => handleRemoveVariation(index)}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>Size *</label>
                            <input
                              type="text"
                              value={variation.size}
                              onChange={(e) => handleVariationChange(index, 'size', e.target.value)}
                              placeholder="e.g., Small, Medium, Large, 1/2 inch, etc."
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label>Price *</label>
                            <input
                              type="number"
                              value={variation.price}
                              onChange={(e) => handleVariationChange(index, 'price', e.target.value)}
                              onWheel={handleNumberInputWheel}
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label>Purchase Price</label>
                            <input
                              type="number"
                              value={variation.purchasePrice || ''}
                              onChange={(e) => handleVariationChange(index, 'purchasePrice', e.target.value)}
                              onWheel={handleNumberInputWheel}
                              step="0.01"
                              min="0"
                              placeholder="Cost price"
                            />
                          </div>
                          <div className="form-group">
                            <label>Quantity *</label>
                            <input
                              type="number"
                              value={variation.quantity}
                              onChange={(e) => handleVariationChange(index, 'quantity', e.target.value)}
                              onWheel={handleNumberInputWheel}
                              min="0"
                              placeholder="0"
                              required
                            />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label>Low Stock Quantity</label>
                            <input
                              type="number"
                              value={variation.lowStockQuantity || ''}
                              onChange={(e) => handleVariationChange(index, 'lowStockQuantity', e.target.value)}
                              onWheel={handleNumberInputWheel}
                              min="0"
                              placeholder="Alert threshold"
                            />
                          </div>
                          <div className="form-group">
                            <label>Unit</label>
                            <input
                              type="text"
                              value={variation.unit || ''}
                              onChange={(e) => handleVariationChange(index, 'unit', e.target.value)}
                              placeholder="e.g., kg, pcs, liters"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '20px' }}>
              {variationEnabled && (
                <button
                  type="button"
                  onClick={handleAddVariation}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  + Add New Variation
                </button>
              )}
            <button type="submit" disabled={loading} className="submit-btn">
              {loading 
                ? (editingProduct ? 'Updating...' : 'Adding...') 
                : (editingProduct ? 'Update Product' : 'Add Product')
              }
            </button>
            </div>
          </form>
          {showCategoryPanel && (
            <div className="category-panel">
              <h4>Manage Brands & Categories</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>New Brand</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Brand name"
                  />
                  <button type="button" className="submit-btn" onClick={handleAddCategory}>Add Brand</button>
                </div>
                <div className="form-group">
                  <label>New Category</label>
                  <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
                    <option value="">Select brand</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input
                    type="text"
                    value={newSubcategoryName}
                    onChange={(e) => setNewSubcategoryName(e.target.value)}
                    placeholder="Category name"
                  />
                  <button type="button" className="submit-btn" onClick={() => handleAddSubcategory(selectedCategoryId)}>Add Category</button>
                </div>
              </div>

              <div className="categories-list">
                <h5>Existing Brands</h5>
                <ul>
                  {categories.map((c) => (
                    <li key={c.id}>
                      <strong>{c.name}</strong>
                      {Array.isArray(c.subcategories) && c.subcategories.length > 0 && (
                        <div className="sub-list">{c.subcategories.join(', ')}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="products-table">
        <div className="table-header">
          <h3>Products List</h3>
          <div className="search-container">
            <input
              type="text"
              placeholder="Search products by name, brand, category, description, or price..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        {initialLoading ? (
          <p className="loading">Loading products...</p>
        ) : products.length === 0 ? (
          <p className="no-products">No products found. Add your first product!</p>
        ) : filteredProducts.length === 0 ? (
          <p className="no-products">No products found matching your search.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Brand</th>
                <th>Description</th>
                <th>Price</th>
                <th>Quantity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const hasVariations = product.variations && Array.isArray(product.variations) && product.variations.length > 0;
                const isVariationOpen = openVariationProductId === product.id;
                
                return (
                  <React.Fragment key={product.id}>
                    <tr>
                      <td data-label="Name" style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {hasVariations && (
                            <button
                              type="button"
                              onClick={() => setOpenVariationProductId(isVariationOpen ? null : product.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                fontSize: '16px',
                                color: '#667eea',
                                transition: 'transform 0.2s'
                              }}
                              title={isVariationOpen ? 'Hide variations' : 'Show variations'}
                            >
                              <span style={{ 
                                transform: isVariationOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s'
                              }}>
                                ▶
                              </span>
                            </button>
                          )}
                          <span>{product.name}</span>
                        </div>
                      </td>
                      <td data-label="Brand">{product.category}{product.subcategory ? ' / ' + product.subcategory : ''}</td>
                      <td data-label="Description">{product.description || '-'}</td>
                      <td data-label="Price">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>₹{product.price?.toFixed(2) || '0.00'}</>
                        )}
                      </td>
                      <td data-label="Quantity">
                        {hasVariations ? (
                          <span style={{ color: '#999', fontStyle: 'italic' }}>See variations</span>
                        ) : (
                          <>{product.quantity || 0}</>
                        )}
                      </td>
                      <td data-label="Actions">
                        <div className="action-buttons">
                          <button
                            className="edit-btn"
                            onClick={() => handleEditProduct(product)}
                          >
                            Edit
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() => handleDeleteProduct(product.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {hasVariations && isVariationOpen && (
                      <tr>
                        <td colSpan="6" style={{ padding: '0', backgroundColor: '#f5f5f5' }}>
                          <div style={{ padding: '15px', marginLeft: '30px' }}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#333', fontSize: '14px', fontWeight: 'bold' }}>
                              Product Variations:
                            </h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '4px' }}>
                              <thead>
                                <tr style={{ backgroundColor: '#f0f0f0' }}>
                                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd', fontSize: '13px' }}>Size</th>
                                  <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>Price</th>
                                  <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>Quantity</th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.variations.map((variation, index) => (
                                  <tr key={index}>
                                    <td style={{ padding: '8px', border: '1px solid #ddd', fontSize: '13px' }}>{variation.size || '-'}</td>
                                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>₹{variation.price?.toFixed(2) || '0.00'}</td>
                                    <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>{variation.quantity || 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default StockManagement;

