import { createContext, useContext } from 'react';

export interface LayoutConfig {
  padding: number;
  borderRadius: number;
  spacing: number;
  iconSize: number;
  buttonSize: number;
  panelWidth: number;
  toolPanelWidth: number;
  layerPanelWidth: number;
}

const defaultConfig: LayoutConfig = {
  padding: 8,
  borderRadius: 8,
  spacing: 12,
  iconSize: 16,
  buttonSize: 32,
  panelWidth: 300,
  toolPanelWidth: 60,
  layerPanelWidth: 280,
};

const LayoutContext = createContext<{
  config: LayoutConfig;
  updateConfig: (updates: Partial<LayoutConfig>) => void;
  scale: number;
  setScale: (scale: number) => void;
}>({
  config: defaultConfig,
  updateConfig: () => {},
  scale: 1,
  setScale: () => {},
});

export const useScalableLayout = () => useContext(LayoutContext);

export { defaultConfig, LayoutContext };
