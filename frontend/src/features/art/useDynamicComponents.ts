import { useCallback, useState } from 'react';
import type { DynamicComponentProps } from './types';

export const useDynamicComponents = () => {
  const [components, setComponents] = useState<DynamicComponentProps[]>([]);

  const addComponent = useCallback((component: Omit<DynamicComponentProps, 'id'>) => {
    const newComponent = {
      ...component,
      id: `component-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    setComponents(prev => [...prev, newComponent as DynamicComponentProps]);
    return newComponent.id;
  }, []);

  const removeComponent = useCallback((componentId: string) => {
    setComponents(prev => prev.filter(comp => comp.id !== componentId));
  }, []);

  const updateComponent = useCallback((componentId: string, updates: Partial<DynamicComponentProps>) => {
    setComponents(prev => prev.map(comp =>
      comp.id === componentId ? { ...comp, ...updates } : comp
    ));
  }, []);

  const getComponent = useCallback((componentId: string): DynamicComponentProps | undefined => {
    return components.find(comp => comp.id === componentId);
  }, [components]);

  const getComponentsByType = useCallback((type: string): DynamicComponentProps[] => {
    return components.filter(comp => comp.type === type);
  }, [components]);

  return {
    components,
    addComponent,
    removeComponent,
    updateComponent,
    getComponent,
    getComponentsByType
  };
};
