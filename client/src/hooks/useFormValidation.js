import { useState, useCallback, useMemo } from 'react';
import { validateField, validateForm, hasErrors } from '../utils/validation';

/**
 * useFormValidation Hook
 * 
 * Provides form state management with built-in validation support.
 * 
 * @param {Object} initialValues - Initial form values
 * @param {Object} validationRules - Object mapping field names to validator arrays
 * @returns {Object} Form state and methods
 * 
 * @example
 * const { values, errors, handleChange, handleBlur, validateAll, isValid } = useFormValidation(
 *   { name: '', price: '' },
 *   { 
 *     name: [required('Name is required')],
 *     price: [required(), numeric(), positive()]
 *   }
 * );
 */
export function useFormValidation(initialValues = {}, validationRules = {}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  /**
   * Handle field value change
   */
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    setValues(prev => ({ ...prev, [name]: newValue }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [errors]);

  /**
   * Handle field blur - validate on blur
   */
  const handleBlur = useCallback((e) => {
    const { name, value } = e.target;
    
    setTouched(prev => ({ ...prev, [name]: true }));
    
    if (validationRules[name]) {
      const error = validateField(value, validationRules[name]);
      if (error) {
        setErrors(prev => ({ ...prev, [name]: error }));
      }
    }
  }, [validationRules]);

  /**
   * Set a specific field value programmatically
   */
  const setValue = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  /**
   * Set multiple values at once
   */
  const setMultipleValues = useCallback((newValues) => {
    setValues(prev => ({ ...prev, ...newValues }));
  }, []);

  /**
   * Set a specific field error
   */
  const setFieldError = useCallback((name, error) => {
    setErrors(prev => ({ ...prev, [name]: error }));
  }, []);

  /**
   * Clear a specific field error
   */
  const clearFieldError = useCallback((name) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[name];
      return newErrors;
    });
  }, []);

  /**
   * Validate all fields
   */
  const validateAll = useCallback(() => {
    const newErrors = validateForm(values, validationRules);
    setErrors(newErrors);
    
    // Mark all fields as touched
    const allTouched = Object.keys(validationRules).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    setTouched(allTouched);
    
    return !hasErrors(newErrors);
  }, [values, validationRules]);

  /**
   * Reset form to initial values
   */
  const reset = useCallback((newInitialValues) => {
    setValues(newInitialValues || initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  /**
   * Check if form is valid (no errors and all required fields filled)
   */
  const isValid = useMemo(() => {
    return !hasErrors(errors);
  }, [errors]);

  /**
   * Get field props for easy binding
   */
  const getFieldProps = useCallback((name) => ({
    name,
    value: values[name] || '',
    onChange: handleChange,
    onBlur: handleBlur,
    error: touched[name] ? errors[name] : undefined,
  }), [values, errors, touched, handleChange, handleBlur]);

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    setValue,
    setMultipleValues,
    setFieldError,
    clearFieldError,
    validateAll,
    reset,
    isValid,
    getFieldProps,
  };
}

export default useFormValidation;
