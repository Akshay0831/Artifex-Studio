export interface ExtensionStateDefinition {
  id: string
  stateKey: string
  initialState?: Record<string, any>
}

export const EXTENSION_STATE_DEFINITIONS: ExtensionStateDefinition[] = [
  {
    id: 'art',
    stateKey: 'image',
    initialState: {
      steps: 20,
      model: 'sdxl',
      ultra_detail: false,
      fast_mode: true,
    },
  },
  {
    id: 'audio',
    stateKey: 'audio',
    initialState: {
      bpm: 120,
      key: 'C',
      scale: 'Major',
      mood: 'Neutral',
      composer: 'standard',
      effects: { eq: true, reverb: false, delay: false, compression: true },
      layers: [
        { name: 'Bass', volume: 0, pan: 0, active: true },
        { name: 'Lead', volume: 0, pan: 0, active: true },
        { name: 'Drums', volume: 0, pan: 0, active: true },
        { name: 'Ambient', volume: 0, pan: 0, active: false },
      ],
    },
  },
  {
    id: 'api-keys',
    stateKey: 'api',
    initialState: {
      activeProfiles: [],
      selectedProvider: null,
    },
  },
]
