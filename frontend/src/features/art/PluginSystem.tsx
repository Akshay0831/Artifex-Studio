import React, { useState, useCallback, useEffect } from 'react';
import { ToolType } from './types';
import { useDynamicToolRegistry } from './DynamicToolRegistryContext';
import { PluginSystemContext, type Plugin } from './PluginSystemContext';

interface PluginSystemProps {
  children: React.ReactNode;
}

const PluginSystem: React.FC<PluginSystemProps> = ({ children }) => {
  const { registerTool, unregisterTool } = useDynamicToolRegistry();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [activePlugins, setActivePlugins] = useState<Set<string>>(new Set());

  // Register a plugin
  const registerPlugin = useCallback((plugin: Plugin) => {
    setPlugins(prev => [...prev, plugin]);
    
    // Register all tools from the plugin
    plugin.tools.forEach(tool => {
      registerTool(tool);
    });
  }, [registerTool]);

  // Unregister a plugin
  const unregisterPlugin = useCallback((pluginId: string) => {
    setPlugins(prev => prev.filter(plugin => plugin.id !== pluginId));
    
    // Remove all tools from the plugin
    const plugin = plugins.find(p => p.id === pluginId);
    if (plugin) {
      plugin.tools.forEach(tool => {
        unregisterTool(tool.id);
      });
    }
    
    setActivePlugins(prev => {
      const newSet = new Set(prev);
      newSet.delete(pluginId);
      return newSet;
    });
  }, [plugins, unregisterTool]);

  // Activate a plugin
  const activatePlugin = useCallback((pluginId: string) => {
    setActivePlugins(prev => new Set([...prev, pluginId]));
    
    // Run plugin hooks
    const plugin = plugins.find(p => p.id === pluginId);
    if (plugin?.hooks.onCanvasInit) {
      // This would need to be connected to the actual canvas instance
      console.log(`Plugin ${pluginId} activated: Running canvas init hook`);
    }
  }, [plugins]);

  // Deactivate a plugin
  const deactivatePlugin = useCallback((pluginId: string) => {
    setActivePlugins(prev => {
      const newSet = new Set(prev);
      newSet.delete(pluginId);
      return newSet;
    });
  }, []);

  // Get all plugins
  const getAllPlugins = useCallback((): Plugin[] => {
    return [...plugins];
  }, [plugins]);

  // Get active plugins
  const getActivePlugins = useCallback((): Plugin[] => {
    return plugins.filter(plugin => activePlugins.has(plugin.id));
  }, [plugins, activePlugins]);

  // Get plugin by ID
  const getPlugin = useCallback((pluginId: string): Plugin | undefined => {
    return plugins.find(plugin => plugin.id === pluginId);
  }, [plugins]);

  // Check if plugin is active
  const isPluginActive = useCallback((pluginId: string): boolean => {
    return activePlugins.has(pluginId);
  }, [activePlugins]);

  // Load plugin from URL
  const loadPluginFromUrl = useCallback(async (url: string) => {
    try {
      const response = await fetch(url);
      const pluginData: Plugin = await response.json();
      
      // Validate plugin structure
      if (!pluginData.id || !pluginData.name || !pluginData.tools) {
        throw new Error('Invalid plugin structure');
      }
      
      registerPlugin(pluginData);
      return pluginData;
    } catch (error) {
      console.error('Failed to load plugin:', error);
      throw error;
    }
  }, [registerPlugin]);

  // Unload plugin
  const unloadPlugin = useCallback((pluginId: string) => {
    const plugin = getPlugin(pluginId);
    if (plugin) {
      deactivatePlugin(pluginId);
      unregisterPlugin(pluginId);
    }
  }, [getPlugin, deactivatePlugin, unregisterPlugin]);

  // Export plugin configuration
  const exportPluginConfig = useCallback((): { plugins: Plugin[], activePlugins: string[] } => {
    return {
      plugins: [...plugins],
      activePlugins: Array.from(activePlugins)
    };
  }, [plugins, activePlugins]);

  // Import plugin configuration
  const importPluginConfig = useCallback((config: { plugins: Plugin[], activePlugins: string[] }) => {
    // Clear existing plugins
    setPlugins([]);
    setActivePlugins(new Set());
    
    // Import plugins
    config.plugins.forEach(plugin => {
      registerPlugin(plugin);
    });
    
    // Activate plugins
    config.activePlugins.forEach(pluginId => {
      activatePlugin(pluginId);
    });
  }, [registerPlugin, activatePlugin]);

  // Initialize with built-in plugins
  useEffect(() => {
    // Define built-in plugins
    const builtInPlugins: Plugin[] = [
      {
        id: 'basic-tools',
        name: 'Basic Editing Tools',
        version: '1.0.0',
        description: 'Essential drawing and editing tools',
        author: 'Studio Team',
        tools: [
          {
            id: ToolType.BRUSH,
            name: 'Brush',
            icon: null,
            category: 'basic',
            description: 'Paint with brush',
            settings: { brushSize: 5, brushColor: '#000000' },
            enabled: true,
            hotkey: 'b'
          },
          {
            id: ToolType.ERASER,
            name: 'Eraser',
            icon: null,
            category: 'basic',
            description: 'Erase pixels',
            settings: { eraserSize: 20 },
            enabled: true,
            hotkey: 'e'
          }
        ],
        components: [],
        hooks: {}
      },
      {
        id: 'advanced-tools',
        name: 'Advanced Editing Tools',
        version: '1.0.0',
        description: 'Professional editing and transformation tools',
        author: 'Studio Team',
        tools: [
          {
            id: ToolType.CLONE,
            name: 'Clone Stamp',
            icon: null,
            category: 'advanced',
            description: 'Clone areas of the image',
            settings: { cloneSize: 20, cloneOpacity: 0.8 },
            enabled: true,
            hotkey: 'c'
          },
          {
            id: ToolType.HEAL,
            name: 'Healing Brush',
            icon: null,
            category: 'advanced',
            description: 'Heal imperfections',
            settings: { healSize: 20, healOpacity: 0.8 },
            enabled: true,
            hotkey: 'h'
          }
        ],
        components: [],
        hooks: {}
      }
    ];

    // Register built-in plugins
    builtInPlugins.forEach(plugin => {
      registerPlugin(plugin);
      activatePlugin(plugin.id);
    });

    return () => {
      // Cleanup plugins on unmount
      builtInPlugins.forEach(plugin => {
        unregisterPlugin(plugin.id);
      });
    };
  }, [registerPlugin, activatePlugin, unregisterPlugin]);

  return (
    <PluginSystemContext.Provider value={{
      plugins,
      activePlugins,
      registerPlugin,
      unregisterPlugin,
      activatePlugin,
      deactivatePlugin,
      getAllPlugins,
      getActivePlugins,
      getPlugin,
      isPluginActive,
      loadPluginFromUrl,
      unloadPlugin,
      exportPluginConfig,
      importPluginConfig
    }}>
      {children}
    </PluginSystemContext.Provider>
  );
};

export default PluginSystem;