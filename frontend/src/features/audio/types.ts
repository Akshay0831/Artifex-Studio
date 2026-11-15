/**
 * Shared Type Definitions for Audio Production & DAW Features
 */

export interface MidiNote {
  id: string;
  note: string; // e.g., "C3", "F#4"
  step: number; // 0 to 31 within zone
  duration: number; // in 16th steps (1 = 16th note, 2 = 8th note, 4 = quarter note)
  velocity: number; // 0.0 to 1.0
}

export interface SongZone {
  id: string;
  name: string; // "Intro", "Verse", "Chorus", "Drop", "Outro"
  startStep: number;
  lengthSteps: number; // typically 32 steps (2 bars of 4/4)
  color: string;
}

export interface AudioEffectsChain {
  eq: {
    low: number; // -12 to +12 dB
    mid: number; // -12 to +12 dB
    high: number; // -12 to +12 dB
    enabled: boolean;
  };
  reverb: {
    decay: number; // 0.1 to 10 seconds
    wet: number; // 0.0 to 1.0
    enabled: boolean;
  };
  delay: {
    time: string; // "8n", "4n", "16n"
    feedback: number; // 0.0 to 0.9
    wet: number; // 0.0 to 1.0
    enabled: boolean;
  };
  distortion: {
    drive: number; // 0.0 to 1.0
    enabled: boolean;
  };
  chorus: {
    frequency: number; // LFO rate Hz (0.1 to 8)
    depth: number; // 0.0 to 1.0
    wet: number; // 0.0 to 1.0
    enabled: boolean;
  };
}

export type InstrumentType = 'polysynth' | 'monosynth' | 'fmsynth' | 'drums' | 'sampler';
export type OscillatorWaveform = 'triangle' | 'sawtooth' | 'square' | 'sine';

export interface InstrumentConfig {
  type: InstrumentType;
  oscillatorType: OscillatorWaveform;
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
}

export interface AudioTrackLayer {
  id: string;
  name: string;
  color: string;
  muted: boolean;
  solo: boolean;
  volume: number; // dB (-60 to +6)
  pan: number; // -1 to +1
  instrument: InstrumentConfig;
  fx: AudioEffectsChain;
  zoneNotes: Record<string, MidiNote[]>; // map of zoneId -> MidiNote[]
}

export interface SongProject {
  title: string;
  bpm: number;
  key: string;
  scale: string;
  timeSignature: string;
  zones: SongZone[];
  layers: AudioTrackLayer[];
  activeLayerId: string;
  activeZoneId: string;
}

// Chromatic notes across 3 full musical octaves (C2 to C5: 37 notes)
export const CHROMATIC_NOTES = [
  'C5', 'B4', 'A#4', 'A4', 'G#4', 'G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4',
  'C4', 'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3',
  'C3', 'B2', 'A#2', 'A2', 'G#2', 'G2', 'F#2', 'F2', 'E2', 'D#2', 'D2', 'C#2', 'C2'
];

export const MUSICAL_SCALES: Record<string, number[]> = {
  'Major': [0, 2, 4, 5, 7, 9, 11],
  'Minor': [0, 2, 3, 5, 7, 8, 10],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
  'Pentatonic Major': [0, 2, 4, 7, 9],
  'Pentatonic Minor': [0, 3, 5, 7, 10],
  'Dorian': [0, 2, 3, 5, 7, 9, 10],
  'Blues': [0, 3, 5, 6, 7, 10]
};

export const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const DEFAULT_SONG_ZONES: SongZone[] = [
  { id: 'zone-intro', name: 'Intro', startStep: 0, lengthSteps: 32, color: '#38bdf8' },
  { id: 'zone-verse', name: 'Verse', startStep: 32, lengthSteps: 32, color: '#818cf8' },
  { id: 'zone-chorus', name: 'Chorus', startStep: 64, lengthSteps: 32, color: '#f43f5e' },
  { id: 'zone-outro', name: 'Outro', startStep: 96, lengthSteps: 32, color: '#10b981' },
];

export const DEFAULT_FX_CHAIN: AudioEffectsChain = {
  eq: { low: 0, mid: 0, high: 0, enabled: true },
  reverb: { decay: 2.0, wet: 0.25, enabled: true },
  delay: { time: '8n', feedback: 0.3, wet: 0.2, enabled: false },
  distortion: { drive: 0.0, enabled: false },
  chorus: { frequency: 1.5, depth: 0.5, wet: 0.0, enabled: false },
};

export const DEFAULT_AUDIO_LAYERS: AudioTrackLayer[] = [
  {
    id: 'layer-drums',
    name: 'Drums & Beats',
    color: '#f43f5e',
    muted: false,
    solo: false,
    volume: 0,
    pan: 0,
    instrument: {
      type: 'drums',
      oscillatorType: 'sine',
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.1 }
    },
    fx: { ...DEFAULT_FX_CHAIN, distortion: { drive: 0.15, enabled: true } },
    zoneNotes: {}
  },
  {
    id: 'layer-bass',
    name: '808 Sub Bass',
    color: '#818cf8',
    muted: false,
    solo: false,
    volume: -2,
    pan: 0,
    instrument: {
      type: 'monosynth',
      oscillatorType: 'triangle',
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.4 }
    },
    fx: { ...DEFAULT_FX_CHAIN, eq: { low: 4, mid: -1, high: -3, enabled: true } },
    zoneNotes: {}
  },
  {
    id: 'layer-chords',
    name: 'Synth Chords & Pads',
    color: '#38bdf8',
    muted: false,
    solo: false,
    volume: -4,
    pan: -0.2,
    instrument: {
      type: 'polysynth',
      oscillatorType: 'sawtooth',
      envelope: { attack: 0.05, decay: 0.4, sustain: 0.5, release: 0.8 }
    },
    fx: { ...DEFAULT_FX_CHAIN, reverb: { decay: 3.5, wet: 0.4, enabled: true }, delay: { time: '8n', feedback: 0.35, wet: 0.25, enabled: true } },
    zoneNotes: {}
  },
  {
    id: 'layer-melody',
    name: 'Lead Melody',
    color: '#10b981',
    muted: false,
    solo: false,
    volume: -1,
    pan: 0.2,
    instrument: {
      type: 'polysynth',
      oscillatorType: 'square',
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.4 }
    },
    fx: { ...DEFAULT_FX_CHAIN, delay: { time: '16n', feedback: 0.4, wet: 0.3, enabled: true } },
    zoneNotes: {}
  }
];

export interface NormalizedAudioState {
  layers: AudioTrackLayer[];
  zones: SongZone[];
  repaired: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMidiNote(value: unknown): value is MidiNote {
  return isRecord(value)
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.note === 'string'
    && typeof value.step === 'number'
    && Number.isInteger(value.step)
    && value.step >= 0
    && typeof value.duration === 'number'
    && Number.isFinite(value.duration)
    && value.duration > 0
    && typeof value.velocity === 'number'
    && Number.isFinite(value.velocity)
    && value.velocity >= 0
    && value.velocity <= 1;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cloneLayer(layer: AudioTrackLayer): AudioTrackLayer {
  return {
    ...layer,
    instrument: {
      ...layer.instrument,
      envelope: { ...layer.instrument.envelope }
    },
    fx: {
      eq: { ...layer.fx.eq },
      reverb: { ...layer.fx.reverb },
      delay: { ...layer.fx.delay },
      distortion: { ...layer.fx.distortion },
      chorus: { ...layer.fx.chorus }
    },
    zoneNotes: Object.fromEntries(
      Object.entries(layer.zoneNotes).map(([zoneId, notes]) => [zoneId, notes.map(note => ({ ...note }))])
    )
  };
}

export function normalizeAudioState(rawLayers: unknown, rawZones: unknown): NormalizedAudioState {
  let repaired = false;
  const defaultZones = DEFAULT_SONG_ZONES.map(zone => ({ ...zone }));
  const zones: SongZone[] = [];
  const zoneIds = new Set<string>();

  if (Array.isArray(rawZones)) {
    rawZones.forEach((value, index) => {
      if (!isRecord(value)) {
        repaired = true;
        return;
      }

      const fallback = defaultZones.find(zone => zone.id === value.id) || defaultZones[index] || defaultZones[0];
      let id = typeof value.id === 'string' && value.id.trim()
        ? value.id
        : `zone-recovered-${index + 1}`;
      if (zoneIds.has(id)) {
        const recoveredId = `zone-recovered-${index + 1}`;
        id = recoveredId;
        let suffix = 2;
        while (zoneIds.has(id)) {
          id = `${recoveredId}-${suffix}`;
          suffix += 1;
        }
        repaired = true;
      }
      zoneIds.add(id);

      const zone: SongZone = {
        id,
        name: typeof value.name === 'string' && value.name.trim() ? value.name : fallback.name,
        startStep: Math.max(0, numberOr(value.startStep, fallback.startStep)),
        lengthSteps: Math.max(1, numberOr(value.lengthSteps, fallback.lengthSteps)),
        color: typeof value.color === 'string' ? value.color : fallback.color
      };
      if (
        zone.id !== value.id
        || zone.name !== value.name
        || zone.startStep !== value.startStep
        || zone.lengthSteps !== value.lengthSteps
        || zone.color !== value.color
      ) repaired = true;
      zones.push(zone);
    });
  } else if (rawZones !== undefined && rawZones !== null) {
    repaired = true;
  }
  if (zones.length === 0) {
    zones.push(...defaultZones);
    if (rawZones !== undefined && rawZones !== null) repaired = true;
  }

  const layers: AudioTrackLayer[] = [];
  const layerIds = new Set<string>();
  const defaultLayers = DEFAULT_AUDIO_LAYERS.map(cloneLayer);

  if (Array.isArray(rawLayers)) {
    rawLayers.forEach((value, index) => {
      if (!isRecord(value)) {
        repaired = true;
        return;
      }

      const fallback = defaultLayers.find(layer => layer.id === value.id) || defaultLayers[index] || defaultLayers[0];
      let id = typeof value.id === 'string' && value.id.trim()
        ? value.id
        : `layer-recovered-${index + 1}`;
      if (layerIds.has(id)) {
        const recoveredId = `layer-recovered-${index + 1}`;
        id = recoveredId;
        let suffix = 2;
        while (layerIds.has(id)) {
          id = `${recoveredId}-${suffix}`;
          suffix += 1;
        }
        repaired = true;
      }
      layerIds.add(id);

      const instrumentValue = isRecord(value.instrument) ? value.instrument : {};
      const envelopeValue = isRecord(instrumentValue.envelope) ? instrumentValue.envelope : {};
      const instrumentType = instrumentValue.type;
      const oscillatorType = instrumentValue.oscillatorType;
      const instrument: InstrumentConfig = {
        type: instrumentType === 'polysynth' || instrumentType === 'monosynth'
          || instrumentType === 'fmsynth' || instrumentType === 'drums' || instrumentType === 'sampler'
          ? instrumentType
          : fallback.instrument.type,
        oscillatorType: oscillatorType === 'triangle' || oscillatorType === 'sawtooth'
          || oscillatorType === 'square' || oscillatorType === 'sine'
          ? oscillatorType
          : fallback.instrument.oscillatorType,
        envelope: {
          attack: Math.max(0, numberOr(envelopeValue.attack, fallback.instrument.envelope.attack)),
          decay: Math.max(0, numberOr(envelopeValue.decay, fallback.instrument.envelope.decay)),
          sustain: Math.max(0, Math.min(1, numberOr(envelopeValue.sustain, fallback.instrument.envelope.sustain))),
          release: Math.max(0, numberOr(envelopeValue.release, fallback.instrument.envelope.release))
        }
      };

      const fxValue = isRecord(value.fx) ? value.fx : {};
      const eqValue = isRecord(fxValue.eq) ? fxValue.eq : {};
      const reverbValue = isRecord(fxValue.reverb) ? fxValue.reverb : {};
      const delayValue = isRecord(fxValue.delay) ? fxValue.delay : {};
      const distortionValue = isRecord(fxValue.distortion) ? fxValue.distortion : {};
      const chorusValue = isRecord(fxValue.chorus) ? fxValue.chorus : {};
      const fx: AudioEffectsChain = {
        eq: {
          low: numberOr(eqValue.low, fallback.fx.eq.low),
          mid: numberOr(eqValue.mid, fallback.fx.eq.mid),
          high: numberOr(eqValue.high, fallback.fx.eq.high),
          enabled: typeof eqValue.enabled === 'boolean' ? eqValue.enabled : fallback.fx.eq.enabled
        },
        reverb: {
          decay: Math.max(0.1, numberOr(reverbValue.decay, fallback.fx.reverb.decay)),
          wet: Math.max(0, Math.min(1, numberOr(reverbValue.wet, fallback.fx.reverb.wet))),
          enabled: typeof reverbValue.enabled === 'boolean' ? reverbValue.enabled : fallback.fx.reverb.enabled
        },
        delay: {
          time: typeof delayValue.time === 'string' ? delayValue.time : fallback.fx.delay.time,
          feedback: Math.max(0, Math.min(0.9, numberOr(delayValue.feedback, fallback.fx.delay.feedback))),
          wet: Math.max(0, Math.min(1, numberOr(delayValue.wet, fallback.fx.delay.wet))),
          enabled: typeof delayValue.enabled === 'boolean' ? delayValue.enabled : fallback.fx.delay.enabled
        },
        distortion: {
          drive: Math.max(0, Math.min(1, numberOr(distortionValue.drive, fallback.fx.distortion.drive))),
          enabled: typeof distortionValue.enabled === 'boolean' ? distortionValue.enabled : fallback.fx.distortion.enabled
        },
        chorus: {
          frequency: Math.max(0.1, Math.min(8, numberOr(chorusValue.frequency, fallback.fx.chorus.frequency))),
          depth: Math.max(0, Math.min(1, numberOr(chorusValue.depth, fallback.fx.chorus.depth))),
          wet: Math.max(0, Math.min(1, numberOr(chorusValue.wet, fallback.fx.chorus.wet))),
          enabled: typeof chorusValue.enabled === 'boolean' ? chorusValue.enabled : fallback.fx.chorus.enabled
        }
      };

      const zoneNotes: Record<string, MidiNote[]> = {};
      if (isRecord(value.zoneNotes)) {
        Object.entries(value.zoneNotes).forEach(([zoneId, rawNotes]) => {
          if (!Array.isArray(rawNotes)) {
            repaired = true;
            return;
          }
          zoneNotes[zoneId] = rawNotes.filter((note): note is MidiNote => {
            const valid = isMidiNote(note);
            if (!valid) repaired = true;
            return valid;
          }).map(note => ({ ...note }));
        });
      } else if (value.zoneNotes !== undefined) {
        repaired = true;
      }

      const layer: AudioTrackLayer = {
        id,
        name: typeof value.name === 'string' && value.name.trim() ? value.name : fallback.name,
        color: typeof value.color === 'string' ? value.color : fallback.color,
        muted: typeof value.muted === 'boolean' ? value.muted : fallback.muted,
        solo: typeof value.solo === 'boolean' ? value.solo : fallback.solo,
        volume: Math.max(-60, Math.min(6, numberOr(value.volume, fallback.volume))),
        pan: Math.max(-1, Math.min(1, numberOr(value.pan, fallback.pan))),
        instrument,
        fx,
        zoneNotes
      };
      if (
        layer.id !== value.id
        || layer.name !== value.name
        || layer.color !== value.color
        || layer.muted !== value.muted
        || layer.solo !== value.solo
        || layer.volume !== value.volume
        || layer.pan !== value.pan
        || !isRecord(value.instrument)
        || !isRecord(value.fx)
        || !isRecord(value.zoneNotes)
      ) repaired = true;
      layers.push(layer);
    });
  } else if (rawLayers !== undefined && rawLayers !== null) {
    repaired = true;
  }
  if (layers.length === 0) {
    layers.push(...defaultLayers);
    if (rawLayers !== undefined && rawLayers !== null) repaired = true;
  }

  return { layers, zones, repaired };
}
