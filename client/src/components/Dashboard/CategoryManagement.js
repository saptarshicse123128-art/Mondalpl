import React, { useEffect, useState } from 'react';
import { categoryService } from '../../services/firebaseService';
import './Dashboard.css';

function CategoryManagement() {
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newSubcategory, setNewSubcategory] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const unsubscribe = categoryService.onCategoriesChange((cats, err) => {
      if (err) {
        console.error('Category listener error', err);
        setMessage({ type: 'error', text: 'Failed to load categories' });
        return;
      }
      setCategories(cats || []);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return setMessage({ type: 'error', text: 'Enter category name' });
    try {
      await categoryService.addCategory(newCategory.trim());
      setNewCategory('');
      setMessage({ type: 'success', text: 'Category added' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to add category' });
    }
  };

  const handleAddSubcategory = async () => {
    const name = newSubcategory.trim();
    if (!selectedCategoryId || !name) return setMessage({ type: 'error', text: 'Select category and enter subcategory' });
    try {
      await categoryService.addSubcategory(selectedCategoryId, name);
      setNewSubcategory('');
      setMessage({ type: 'success', text: 'Subcategory added' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to add subcategory' });
    }
  };

  const handleDeleteCategory = async (categoryId, name) => {
    if (!window.confirm(`Delete category "${name}"? This will not remove category names from existing products.`)) return;
    try {
      await categoryService.deleteCategory(categoryId);
      setMessage({ type: 'success', text: 'Category deleted' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to delete category' });
    }
  };

  const handleRemoveSubcategory = async (categoryId, subName) => {
    if (!window.confirm(`Remove subcategory "${subName}"?`)) return;
    try {
      await categoryService.removeSubcategory(categoryId, subName);
      setMessage({ type: 'success', text: 'Subcategory removed' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to remove subcategory' });
    }
  };

  return (
    <div className="category-management">
      <h2>Categories</h2>

      {message.text && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="form-row">
        <div className="form-group">
          <label>New category</label>
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Category name" />
          <button className="submit-btn" type="button" onClick={handleAddCategory}>Add Category</button>
        </div>

        <div className="form-group">
          <label>Add subcategory</label>
          <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
            <option value="">Select category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={newSubcategory} onChange={(e) => setNewSubcategory(e.target.value)} placeholder="Subcategory name" />
          <button className="submit-btn" type="button" onClick={handleAddSubcategory}>Add Subcategory</button>
        </div>
      </div>

      <div className="categories-list">
        <h3>Existing categories</h3>
        {categories.length === 0 ? (
          <p className="muted">No categories yet.</p>
        ) : (
          <div>
            <input
              className="search-input"
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <ul>
              {categories
                .filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((c) => (
                  <li key={c.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>{c.name}</strong>
                      <small className="muted">{Array.isArray(c.subcategories) ? `${c.subcategories.length} sub` : '0 sub'}</small>
                      <button type="button" className="small-btn danger" onClick={() => handleDeleteCategory(c.id, c.name)}>Delete</button>
                    </div>
                    {Array.isArray(c.subcategories) && c.subcategories.length > 0 && (
                      <div className="sub-list" style={{ marginTop: 6 }}>
                        {c.subcategories.map((s) => (
                          <span key={s} className="chip" style={{ marginRight: 6 }}>
                            {s}
                            <button type="button" className="chip-remove" onClick={() => handleRemoveSubcategory(c.id, s)}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default CategoryManagement;
