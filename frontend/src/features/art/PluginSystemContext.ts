import { createContext, useContext } from 'react';
import type { ComponentType } from 'react';
import type { ToolType, ToolDefinition, ToolSettings } from './types';

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tools: ToolDefinition[];
  components: Array<{
    id: string;
    name: string;
    component: ComponentType<any>;
    category: string;
    settings: any;
  }>;
  hooks: {
    onCanvasInit?: (canvas: any) => void;
    onToolChange?: (tool: ToolType) => void;
    onSettingsChange?: (settings: ToolSettings) => void;
  };
}

export const PluginSystemContext = createContext<{
  plugins: Plugin[];
  activePlugins: Set<string>;
  registerPlugin: (plugin: Plugin) => void;
  unregisterPlugin: (pluginId: string) => void;
  activatePlugin: (pluginId: string) => void;
  deactivatePlugin: (pluginId: string) => void;
  getAllPlugins: () => Plugin[];
  getActivePlugins: () => Plugin[];
  getPlugin: (pluginId: string) => Plugin | undefined;
  isPluginActive: (pluginId: string) => boolean;
  loadPluginFromUrl: (url: string) => Promise<Plugin>;
  unloadPlugin: (pluginId: string) => void;
  exportPluginConfig: () => { plugins: Plugin[]; activePlugins: string[] };
  importPluginConfig: (config: { plugins: Plugin[]; activePlugins: string[] }) => void;
}>({
  plugins: [],
  activePlugins: new Set(),
  registerPlugin: () => {},
  unregisterPlugin: () => {},
  activatePlugin: () => {},
  deactivatePlugin: () => {},
  getAllPlugins: () => [],
  getActivePlugins: () => [],
  getPlugin: () => undefined,
  isPluginActive: () => false,
  loadPluginFromUrl: async () => { throw new Error('Not implemented'); },
  unloadPlugin: () => {},
  exportPluginConfig: () => ({ plugins: [], activePlugins: [] }),
  importPluginConfig: () => {}
});

export const usePluginSystem = () => useContext(PluginSystemContext);
