import { useCallback, useMemo, useState } from 'react';

export interface FormState {
  [key: string]: any;
}

export const useForm = <T extends FormState>(
  initialValues: T,
  validationRules?: { [K in keyof T]?: (value: T[K]) => string | undefined }
) => {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<{ [K in keyof T]?: string }>({});
  const [touched, setTouched] = useState<Set<keyof T>>(new Set());

  const setValue = useCallback((name: keyof T, value: T[keyof T]) => {
    setValues(prev => ({ ...prev, [name]: value }));
    setTouched(prev => new Set([...prev, name]));
  }, []);

  const setError = useCallback((name: keyof T, error: string) => {
    setErrors(prev => ({ ...prev, [name]: error }));
  }, []);

  const clearError = useCallback((name: keyof T) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[name];
      return newErrors;
    });
  }, []);

  const validate = useCallback(() => {
    const newErrors: { [K in keyof T]?: string } = {};
    let isValid = true;

    (Object.keys(values) as Array<keyof T>).forEach(key => {
      const rule = validationRules?.[key];
      if (rule) {
        const error = rule(values[key]);
        if (error) {
          newErrors[key] = error;
          isValid = false;
        }
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [values, validationRules]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched(new Set());
  }, [initialValues]);

  const isDirty = useMemo(
    () => (Object.keys(values) as Array<keyof T>).some(key => values[key] !== initialValues[key]),
    [values, initialValues]
  );
  const isValid = useMemo(() => Object.keys(errors).length === 0, [errors]);

  return {
    values,
    errors,
    touched,
    setValue,
    setError,
    clearError,
    validate,
    reset,
    isDirty,
    isValid
  };
};
