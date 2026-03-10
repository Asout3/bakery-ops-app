/**
 * Form Validation Utilities
 * 
 * Each validator returns null if valid, or an error message if invalid.
 * Validators can be composed together using validateField() or useFormValidation().
 */

// ============================================
// Basic Validators
// ============================================

/**
 * Required field validator
 * @param {string} message - Custom error message
 */
export const required = (message = 'This field is required') => (value) => {
  if (value === null || value === undefined || value === '') return message;
  if (typeof value === 'string' && value.trim() === '') return message;
  return null;
};

/**
 * Email format validator
 */
export const email = (message = 'Invalid email format') => (value) => {
  if (!value) return null; // Let required handle empty values
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value) ? null : message;
};

/**
 * Phone number validator (basic)
 */
export const phone = (message = 'Invalid phone number') => (value) => {
  if (!value) return null;
  const phoneRegex = /^[\d\s\-+()]{7,}$/;
  return phoneRegex.test(value) ? null : message;
};

/**
 * Numeric value validator
 */
export const numeric = (message = 'Must be a number') => (value) => {
  if (!value && value !== 0) return null;
  return !isNaN(Number(value)) ? null : message;
};

/**
 * Integer validator
 */
export const integer = (message = 'Must be a whole number') => (value) => {
  if (!value && value !== 0) return null;
  return Number.isInteger(Number(value)) ? null : message;
};

/**
 * Positive number validator
 */
export const positive = (message = 'Must be greater than zero') => (value) => {
  if (!value && value !== 0) return null;
  return Number(value) > 0 ? null : message;
};

/**
 * Non-negative number validator
 */
export const nonNegative = (message = 'Must be zero or greater') => (value) => {
  if (!value && value !== 0) return null;
  return Number(value) >= 0 ? null : message;
};

// ============================================
// Range Validators
// ============================================

/**
 * Minimum value validator
 */
export const min = (minVal, message) => (value) => {
  if (!value && value !== 0) return null;
  const msg = message || `Must be at least ${minVal}`;
  return Number(value) >= minVal ? null : msg;
};

/**
 * Maximum value validator
 */
export const max = (maxVal, message) => (value) => {
  if (!value && value !== 0) return null;
  const msg = message || `Must be at most ${maxVal}`;
  return Number(value) <= maxVal ? null : msg;
};

/**
 * Minimum length validator
 */
export const minLength = (len, message) => (value) => {
  if (!value) return null;
  const msg = message || `Must be at least ${len} characters`;
  return String(value).length >= len ? null : msg;
};

/**
 * Maximum length validator
 */
export const maxLength = (len, message) => (value) => {
  if (!value) return null;
  const msg = message || `Must be at most ${len} characters`;
  return String(value).length <= len ? null : msg;
};

// ============================================
// Pattern Validators
// ============================================

/**
 * Regex pattern validator
 */
export const pattern = (regex, message = 'Invalid format') => (value) => {
  if (!value) return null;
  return regex.test(value) ? null : message;
};

/**
 * No special characters validator
 */
export const alphanumeric = (message = 'Only letters and numbers allowed') => (value) => {
  if (!value) return null;
  return /^[a-zA-Z0-9]+$/.test(value) ? null : message;
};

// ============================================
// Validation Utilities
// ============================================

/**
 * Validate a single field with multiple validators
 * @param {any} value - The value to validate
 * @param {Array<Function>} validators - Array of validator functions
 * @returns {string|null} - First error message or null if all pass
 */
export function validateField(value, validators = []) {
  for (const validator of validators) {
    const error = validator(value);
    if (error) return error;
  }
  return null;
}

/**
 * Validate all fields in a form
 * @param {Object} values - Form values object
 * @param {Object} validationRules - Object mapping field names to validator arrays
 * @returns {Object} - Object with field names and their error messages (if any)
 */
export function validateForm(values, validationRules) {
  const errors = {};
  
  for (const [field, validators] of Object.entries(validationRules)) {
    const error = validateField(values[field], validators);
    if (error) {
      errors[field] = error;
    }
  }
  
  return errors;
}

/**
 * Check if form has any errors
 * @param {Object} errors - Errors object from validateForm
 * @returns {boolean}
 */
export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

// ============================================
// Pre-built validation schemas
// ============================================

/**
 * Common validation schemas for reuse
 */
export const schemas = {
  // Product validation
  product: {
    name: [required('Product name is required')],
    price: [required('Price is required'), numeric('Price must be a number'), positive('Price must be greater than zero')],
    category_id: [required('Category is required')],
  },
  
  // Expense validation
  expense: {
    amount: [required('Amount is required'), numeric('Amount must be a number'), positive('Amount must be greater than zero')],
    description: [required('Description is required')],
    category: [required('Category is required')],
  },
  
  // Staff payment validation
  staffPayment: {
    amount: [required('Amount is required'), numeric('Amount must be a number'), positive('Amount must be greater than zero')],
    staff_id: [required('Staff member is required')],
  },
  
  // Login validation
  login: {
    username: [required('Username is required')],
    password: [required('Password is required')],
  },
  
  // Pre-order validation
  preOrder: {
    customer_name: [required('Customer name is required')],
    customer_phone: [required('Phone number is required')],
    pickup_date: [required('Pickup date is required')],
  },
};

export default {
  required,
  email,
  phone,
  numeric,
  integer,
  positive,
  nonNegative,
  min,
  max,
  minLength,
  maxLength,
  pattern,
  alphanumeric,
  validateField,
  validateForm,
  hasErrors,
  schemas,
};
