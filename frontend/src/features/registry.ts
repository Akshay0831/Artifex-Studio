import React from 'react';
import { Image, Music, Key } from 'lucide-react';
import ImageEditor from './art/ImageEditor';
import { ArtControls } from './art/ArtControls';
import AudioMixer from './audio/AudioMixer';
import { AudioControls } from './audio/AudioControls';
import { ApiKeyManager } from '../components/ApiKeyManager';
import { ApiKeySidebar } from './common/ApiKeySidebar';
import { EXTENSION_STATE_DEFINITIONS } from './extensionState';

export interface ExtensionManifest {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  primaryView: React.ComponentType;
  sidebarControls: React.ComponentType;
  stateKey: string;
  initialState?: Record<string, any>;
}

const extensionStateById = Object.fromEntries(
  EXTENSION_STATE_DEFINITIONS.map(definition => [definition.id, definition]),
);

export const EXTENSION_REGISTRY: ExtensionManifest[] = [
  {
    name: 'Art Studio',
    icon: Image,
    primaryView: ImageEditor,
    sidebarControls: ArtControls,
    ...extensionStateById.art,
  },
  {
    name: 'Audio Mixer',
    icon: Music,
    primaryView: AudioMixer,
    sidebarControls: AudioControls,
    ...extensionStateById.audio,
  },
  {
    name: 'API Manager',
    icon: Key,
    primaryView: ApiKeyManager,
    sidebarControls: ApiKeySidebar,
    ...extensionStateById['api-keys'],
  }
];
