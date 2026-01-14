import React, { useState, useEffect } from 'react';
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
    description: '',
    price: '',
    quantity: '',
    category: '',
    subcategory: ''
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

  useEffect(() => {
    // Subscribe to categories collection so form can show category/subcategory options
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

      await addDoc(collection(db, 'products'), {
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: parseFloat(formData.price),
        quantity: parseInt(formData.quantity),
        category: categoryName,
        subcategory: formData.subcategory?.trim() || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      setFormData({
        name: '',
        description: '',
        price: '',
        quantity: '',
        category: '',
        subcategory: ''
      });
      setSelectedCategoryId('');
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
      description: product.description || '',
      price: product.price?.toString() || '',
      quantity: product.quantity?.toString() || '',
      category: product.category || '',
      subcategory: product.subcategory || ''
    });
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

      await updateDoc(productRef, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: parseFloat(formData.price),
        quantity: parseInt(formData.quantity),
        category: categoryName,
        subcategory: formData.subcategory?.trim() || '',
        updatedAt: serverTimestamp()
      });
      
      setFormData({
        name: '',
        description: '',
        price: '',
        quantity: '',
        category: '',
        subcategory: ''
      });
      setSelectedCategoryId('');
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
      description: '',
      price: '',
      quantity: '',
      category: '',
      subcategory: ''
    });
    setShowAddForm(false);
    setEditingProduct(null);
    setMessage({ type: '', text: '' });
  };

  // Category management helpers
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return setMessage({ type: 'error', text: 'Category name required' });
    try {
      await categoryService.addCategory(newCategoryName.trim());
      setNewCategoryName('');
      setMessage({ type: 'success', text: 'Category added' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error('Add category failed', err);
      setMessage({ type: 'error', text: 'Failed to add category' });
    }
  };

  const handleAddSubcategory = async (categoryId) => {
    const name = newSubcategoryName.trim();
    if (!categoryId || !name) return setMessage({ type: 'error', text: 'Select category and enter subcategory' });
    try {
      await categoryService.addSubcategory(categoryId, name);
      setNewSubcategoryName('');
      setMessage({ type: 'success', text: 'Subcategory added' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error('Add subcategory failed', err);
      setMessage({ type: 'error', text: 'Failed to add subcategory' });
    }
  };

  // Filter products based on search query
  const filteredProducts = products.filter(product => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.name?.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query) ||
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
        <div className="add-product-form">
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
                <label>Category</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    name="categoryId"
                    value={selectedCategoryId}
                    onChange={handleCategorySelect}
                  >
                    <option value="">Select category</option>
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
                    <option value="">No subcategory</option>
                    {subcategories.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button type="button" className="small-btn" onClick={() => setShowCategoryPanel((v) => !v)}>
                    Manage
                  </button>
                </div>
                {/* Allow manual entry if user prefers */}
                <small className="muted">Or type a category below to save with product</small>
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  placeholder="(optional) fallback category name"
                  style={{ marginTop: 8 }}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="3"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Price *</label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  min="0"
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={loading} className="submit-btn">
              {loading 
                ? (editingProduct ? 'Updating...' : 'Adding...') 
                : (editingProduct ? 'Update Product' : 'Add Product')
              }
            </button>
          </form>
          {showCategoryPanel && (
            <div className="category-panel">
              <h4>Manage Categories</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>New Category</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                  />
                  <button type="button" className="submit-btn" onClick={handleAddCategory}>Add Category</button>
                </div>
                <div className="form-group">
                  <label>New Subcategory</label>
                  <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
                    <option value="">Select category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input
                    type="text"
                    value={newSubcategoryName}
                    onChange={(e) => setNewSubcategoryName(e.target.value)}
                    placeholder="Subcategory name"
                  />
                  <button type="button" className="submit-btn" onClick={() => handleAddSubcategory(selectedCategoryId)}>Add Subcategory</button>
                </div>
              </div>

              <div className="categories-list">
                <h5>Existing Categories</h5>
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
              placeholder="Search products by name, category, description, or price..."
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
                <th>Category</th>
                <th>Description</th>
                <th>Price</th>
                <th>Quantity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td data-label="Name">{product.name}</td>
                  <td data-label="Category">{product.category}{product.subcategory ? ' / ' + product.subcategory : ''}</td>
                  <td data-label="Description">{product.description || '-'}</td>
                  <td data-label="Price">₹{product.price?.toFixed(2) || '0.00'}</td>
                  <td data-label="Quantity">
                    {product.quantity || 0}
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default StockManagement;

