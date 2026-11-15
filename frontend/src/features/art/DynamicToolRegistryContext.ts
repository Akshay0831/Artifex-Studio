import { createContext, useContext, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { ToolType, type ToolDefinition } from './types';

export interface ToolRegistry {
  [toolId: string]: ToolDefinition;
}

export const DynamicToolRegistryContext = createContext<{
  registry: ToolRegistry;
  registerTool: (tool: ToolDefinition) => void;
  unregisterTool: (toolId: string) => void;
  updateTool: (toolId: string, updates: Partial<ToolDefinition>) => void;
  getTool: (toolId: string) => ToolDefinition | undefined;
  getToolsByCategory: (category: ToolDefinition['category']) => ToolDefinition[];
  hasTool: (toolId: string) => boolean;
  exportRegistry: () => ToolRegistry;
  importRegistry: (newRegistry: ToolRegistry) => void;
}>({
  registry: {},
  registerTool: () => {},
  unregisterTool: () => {},
  updateTool: () => {},
  getTool: () => undefined,
  getToolsByCategory: () => [],
  hasTool: () => false,
  exportRegistry: () => ({}),
  importRegistry: () => {}
});

export const useDynamicToolRegistry = () => useContext(DynamicToolRegistryContext);

export const useDynamicComponentLoader = (componentType: string) => {
  const { getTool } = useDynamicToolRegistry();
  const [Component, setComponent] = useState<ComponentType<any> | null>(null);

  useEffect(() => {
    const tool = getTool(componentType as ToolType);
    if (tool) {
      import(`./${tool.settings.componentPath}`).then(module => {
        setComponent(() => module.default);
      }).catch(error => {
        console.error(`Failed to load component for ${componentType}:`, error);
      });
    }
  }, [componentType, getTool]);

  return Component;
};
