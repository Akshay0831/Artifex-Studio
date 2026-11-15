import React, { useState, useCallback } from 'react';
import type { ToolDefinition } from './types';
import { DynamicToolRegistryContext, type ToolRegistry } from './DynamicToolRegistryContext';

interface DynamicToolRegistryProps {
  children: React.ReactNode;
  onToolRegister?: (tool: ToolDefinition) => void;
  onToolUnregister?: (toolId: string) => void;
  onToolUpdate?: (toolId: string, updates: Partial<ToolDefinition>) => void;
}

const DynamicToolRegistry: React.FC<DynamicToolRegistryProps> = ({
  children,
  onToolRegister,
  onToolUnregister,
  onToolUpdate
}) => {
  const [registry, setRegistry] = useState<ToolRegistry>({});

  // Register a new tool
  const registerTool = useCallback((tool: ToolDefinition) => {
    setRegistry(prev => ({
      ...prev,
      [tool.id]: tool
    }));
    onToolRegister?.(tool);
  }, [onToolRegister]);

  // Unregister a tool
  const unregisterTool = useCallback((toolId: string) => {
    const newRegistry = { ...registry };
    delete newRegistry[toolId];
    setRegistry(newRegistry);
    onToolUnregister?.(toolId);
  }, [registry, onToolUnregister]);

  // Update an existing tool
  const updateTool = useCallback((toolId: string, updates: Partial<ToolDefinition>) => {
    setRegistry(prev => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        ...updates
      }
    }));
    onToolUpdate?.(toolId, updates);
  }, [onToolUpdate]);

  // Get a tool by ID
  const getTool = useCallback((toolId: string): ToolDefinition | undefined => {
    return registry[toolId];
  }, [registry]);

  // Get all tools by category
  const getToolsByCategory = useCallback((category: ToolDefinition['category']): ToolDefinition[] => {
    return Object.values(registry).filter(tool => tool.category === category);
  }, [registry]);

  // Check if tool exists
  const hasTool = useCallback((toolId: string): boolean => {
    return toolId in registry;
  }, [registry]);

  // Export registry for external use
  const exportRegistry = useCallback((): ToolRegistry => {
    return { ...registry };
  }, [registry]);

  // Import registry from external source
  const importRegistry = useCallback((newRegistry: ToolRegistry) => {
    setRegistry(newRegistry);
  }, []);

  return (
    <DynamicToolRegistryContext.Provider value={{
      registry,
      registerTool,
      unregisterTool,
      updateTool,
      getTool,
      getToolsByCategory,
      hasTool,
      exportRegistry,
      importRegistry
    }}>
      {children}
    </DynamicToolRegistryContext.Provider>
  );
};

export default DynamicToolRegistry;