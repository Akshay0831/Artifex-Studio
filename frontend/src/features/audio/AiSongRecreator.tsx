import React from 'react';
import { Music, Wand2, GitMerge } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  AudioTrackLayer,
  SongZone,
  MidiNote,
  MUSICAL_SCALES,
  ROOT_NOTES
} from './types';

interface AiSongRecreatorProps {
  layers: AudioTrackLayer[];
  zones: SongZone[];
  songKey: string;
  songScale: string;
  bpm: number;
  activeLayerId: string;
  activeZoneId: string;
  onUpdateLayers: (newLayers: AudioTrackLayer[]) => void;
  onKeyChange: (key: string, scale: string) => void;
  onBpmChange: (bpm: number) => void;
}

export const AiSongRecreator: React.FC<AiSongRecreatorProps> = ({
  layers,
  zones,
  songKey,
  songScale,
  bpm,
  activeLayerId,
  activeZoneId,
  onUpdateLayers,
  onKeyChange,
  onBpmChange
}) => {
  const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];
  const activeZone = zones.find(z => z.id === activeZoneId) || zones[0];

  const handleRecreateSong = () => {
    const root = songKey;
    const scaleIntervals = MUSICAL_SCALES[songScale] || MUSICAL_SCALES.Minor;
    const rootIndex = ROOT_NOTES.indexOf(root);
    const progression = [0, 5, 2, 6].map(degree => {
      const pitch = rootIndex + scaleIntervals[degree % scaleIntervals.length];
      return `${ROOT_NOTES[pitch % ROOT_NOTES.length]}${2 + Math.floor(pitch / ROOT_NOTES.length)}`;
    });
    const updatedLayers = layers.map(layer => {
        const nextZoneNotes: Record<string, MidiNote[]> = {};

        zones.forEach((zone, zIdx) => {
          const zoneNotes: MidiNote[] = [];
          const isDrums = layer.instrument.type === 'drums';
          const isBass = layer.instrument.type === 'monosynth';
          const isChords = layer.instrument.type === 'polysynth' && layer.id.includes('chord');
          const isLead = layer.id.includes('melody') || layer.name.toLowerCase().includes('lead');

          if (isDrums) {
            // Drum arrangement: builds intensity from Intro -> Chorus
            const kickSteps = zIdx === 0 ? [0, 8, 16, 24] : [0, 4, 8, 12, 16, 20, 24, 28];
            kickSteps.forEach(s => {
              zoneNotes.push({ id: `ai-kick-${zone.id}-${s}`, note: 'C2', step: s, duration: 1, velocity: 0.95 });
            });
            if (zIdx > 0) {
              // Snares on beats 2 & 4
              [4, 12, 20, 28].forEach(s => {
                zoneNotes.push({ id: `ai-snare-${zone.id}-${s}`, note: 'D2', step: s, duration: 1, velocity: 0.85 });
              });
              // 16th-note hats
              for (let s = 2; s < 32; s += 2) {
                zoneNotes.push({ id: `ai-hat-${zone.id}-${s}`, note: 'F#2', step: s, duration: 1, velocity: s % 4 === 0 ? 0.75 : 0.5 });
              }
            }
          } else if (isBass) {
            // Driving bassline following progression
            const bassPitches = progression.flatMap(pitch => [pitch, pitch]);
            [0, 3, 6, 8, 12, 16, 19, 22, 24, 28].forEach((s, idx) => {
              const pitch = bassPitches[idx % bassPitches.length];
              zoneNotes.push({ id: `ai-bass-${zone.id}-${s}`, note: pitch, step: s, duration: 2, velocity: 0.9 });
            });
          } else if (isChords) {
            // Lush triads every 8 steps
            const chordTones = [
              [`${root}3`, `D#3`, `G3`],
              [`A#2`, `D3`, `F3`],
              [`F3`, `G#3`, `C4`],
              [`C3`, `D#3`, `G3`]
            ];
            [0, 8, 16, 24].forEach((s, idx) => {
              const chord = chordTones[idx % chordTones.length];
              chord.forEach((pitch, pIdx) => {
                zoneNotes.push({ id: `ai-chord-${zone.id}-${s}-${pIdx}`, note: pitch, step: s, duration: 6, velocity: 0.7 });
              });
            });
          } else if (isLead) {
            // Melodic lead riff in Chorus and Verse
            if (zIdx >= 1) {
              const melodyMotif = [`${root}4`, `D#4`, `F4`, `G4`, `A#4`, `G4`, `F4`, `D#4`];
              [0, 4, 6, 10, 14, 16, 20, 24].forEach((s, idx) => {
                zoneNotes.push({
                  id: `ai-lead-${zone.id}-${s}`,
                  note: melodyMotif[idx % melodyMotif.length],
                  step: s,
                  duration: 2,
                  velocity: 0.85
                });
              });
            }
          }

          nextZoneNotes[zone.id] = zoneNotes;
        });

        return {
          ...layer,
          zoneNotes: nextZoneNotes
        };
    });

    onUpdateLayers(updatedLayers);
    toast.success('Created a rule-based MIDI template. No AI inference or audio rendering was performed.');
  };

  // Generate Pattern for Selected Track & Zone only
  const handleGenerateSelectedZone = () => {
    const root = songKey;
    const isDrums = activeLayer.instrument.type === 'drums';
    const isBass = activeLayer.instrument.type === 'monosynth';
    const zoneNotes: MidiNote[] = [];

    if (isDrums) {
      for (let s = 0; s < 32; s += 4) {
        zoneNotes.push({ id: `ai-d-${s}`, note: 'C2', step: s, duration: 1, velocity: 0.9 });
        if (s % 8 === 4) zoneNotes.push({ id: `ai-s-${s}`, note: 'D2', step: s, duration: 1, velocity: 0.85 });
      }
    } else if (isBass) {
      [0, 4, 8, 12, 16, 20, 24, 28].forEach(s => {
        zoneNotes.push({ id: `ai-b-${s}`, note: `${root}2`, step: s, duration: 3, velocity: 0.9 });
      });
    } else {
      [0, 6, 12, 16, 22, 28].forEach(s => {
        zoneNotes.push({ id: `ai-m-${s}`, note: `${root}3`, step: s, duration: 2, velocity: 0.8 });
      });
    }

    const nextLayers = layers.map(l => {
      if (l.id === activeLayer.id) {
        return {
          ...l,
          zoneNotes: {
            ...l.zoneNotes,
            [activeZone.id]: zoneNotes
          }
        };
      }
      return l;
    });

    onUpdateLayers(nextLayers);
    toast.success(`Created a local MIDI pattern for ${activeLayer.name} in ${activeZone.name}; no AI was used.`);
  };

  // Harmonize from Melody: read lead melody notes → generate chord triads in chord track
  const handleHarmonizeFromMelody = () => {
    const melodyLayer = layers.find(l => l.id.includes('melody') || l.name.toLowerCase().includes('lead') || l.name.toLowerCase().includes('melody'));
    const chordLayer = layers.find(l => l.id.includes('chord') || l.name.toLowerCase().includes('chord') || l.name.toLowerCase().includes('pad'));

    if (!melodyLayer) {
      toast.error('No melody/lead layer found. Add a lead layer first.');
      return;
    }
    if (!chordLayer) {
      toast.error('No chord/pad layer found. Add a chord track first.');
      return;
    }

    const melodyNotes = melodyLayer.zoneNotes[activeZoneId] || [];
    if (melodyNotes.length === 0) {
      toast.error(`No notes in ${melodyLayer.name} for ${activeZone.name}. Paint a melody first!`);
      return;
    }

    // Build chord notes: for each melody note, generate root + 3rd + 5th based on scale
    const scaleIntervals = MUSICAL_SCALES[songScale] || MUSICAL_SCALES['Minor'];
    const rootIdx = ROOT_NOTES.indexOf(songKey);

    // Find chord trigger steps (every 8 steps, or wherever melody notes fall on beat boundaries)
    const beatNotes = melodyNotes.filter(n => n.step % 8 === 0);
    const chordSteps = beatNotes.length > 0
      ? beatNotes.map(n => n.step)
      : [0, 8, 16, 24];

    const chordNotes: MidiNote[] = [];
    chordSteps.forEach((step, idx) => {
      const melodyOnStep = melodyNotes.find(n => n.step === step);
      const melodyPitchClass = melodyOnStep
        ? ROOT_NOTES.indexOf(melodyOnStep.note.replace(/[0-9]/g, '').trim())
        : (rootIdx + scaleIntervals[idx % scaleIntervals.length]) % 12;
      const chordRootIndex = melodyPitchClass >= 0 ? melodyPitchClass : rootIdx;

      // Build a triad: root (C3), third (+2 scale degrees), fifth (+4 scale degrees)
      const octave = 3;
      const rootPitch = `${ROOT_NOTES[chordRootIndex]}${octave}`;
      const thirdInterval = scaleIntervals[2] || 4;
      const fifthInterval = scaleIntervals[4] || 7;
      const thirdPitch = ROOT_NOTES[(chordRootIndex + thirdInterval) % 12];
      const fifthPitch = ROOT_NOTES[(chordRootIndex + fifthInterval) % 12];

      [rootPitch, `${thirdPitch}${octave}`, `${fifthPitch}${octave}`].forEach((pitch, pIdx) => {
        chordNotes.push({
          id: `harm-${step}-${pIdx}-${Date.now()}`,
          note: pitch,
          step,
          duration: 8,
          velocity: 0.65
        });
      });
    });

    const nextLayers = layers.map(l => {
      if (l.id === chordLayer.id) {
        return {
          ...l,
          zoneNotes: { ...l.zoneNotes, [activeZoneId]: chordNotes }
        };
      }
      return l;
    });

    onUpdateLayers(nextLayers);
    toast.success(`Built ${chordNotes.length / 3} rule-based chord triads in ${chordLayer.name} from melody notes.`);
  };

  return (
    <div className="flex flex-col gap-2.5 p-3 bg-[#0d0d14] border border-studio-border/70 rounded-xl shadow-xl text-studio-text">
      {/* Title */}
      <div className="flex items-center justify-between pb-1.5 border-b border-studio-border/50">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-studio-accent">
          <Music size={14} />
          <span>Local MIDI Pattern Tools</span>
        </div>
        <span className="text-[9px] font-mono bg-studio-accent/20 text-studio-accent px-1.5 py-0.5 rounded border border-studio-accent/30">
          NO AI / NO AUDIO RENDERING
        </span>
      </div>

      <p className="text-[10px] text-studio-text-dim">
        Deterministic MIDI templates use the selected key, scale, and tracks. They do not analyze references,
        call an AI model, or create audio.
      </p>

      {/* Musical template selectors */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-studio-text-dim uppercase font-bold">Template:</span>
        <div className="flex gap-1 flex-1 overflow-x-auto">
          {[
            { id: 'synthwave', name: 'Synthwave', bpm: 124, key: 'D', scale: 'Minor' },
            { id: 'lofi', name: 'Lo-Fi Chill', bpm: 85, key: 'C', scale: 'Major' },
            { id: 'edm', name: 'Dance Drop', bpm: 128, key: 'F', scale: 'Minor' },
            { id: 'rock', name: 'Pop Rock', bpm: 118, key: 'G', scale: 'Major' },
          ].map(genre => (
            <button
              key={genre.id}
              type="button"
              onClick={() => {
                onBpmChange(genre.bpm);
                onKeyChange(genre.key, genre.scale);
              }}
              className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${
                bpm === genre.bpm && songKey === genre.key && songScale === genre.scale
                  ? 'bg-studio-accent text-white border-studio-accent shadow-sm'
                  : 'bg-black/40 border-studio-border text-studio-text-dim hover:text-white'
              }`}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={handleRecreateSong}
          className="py-2 px-3 rounded-lg bg-studio-accent hover:bg-studio-accent/90 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all"
        >
          <Wand2 size={13} />
          <span>Replace with Full Template</span>
        </button>

        <button
          type="button"
          onClick={handleGenerateSelectedZone}
          className="py-2 px-3 rounded-lg bg-black/50 border border-studio-border hover:border-studio-accent text-studio-text hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
        >
          <Wand2 size={13} className="text-amber-400" />
          <span>Replace Zone Pattern</span>
        </button>

        <button
          type="button"
          onClick={handleHarmonizeFromMelody}
          className="col-span-2 py-2 px-3 rounded-lg bg-emerald-950/60 border border-emerald-700/60 hover:border-emerald-500 text-emerald-200 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
          title="Create rule-based chord triads from the selected melody notes"
        >
          <GitMerge size={13} className="text-emerald-400" />
          <span>Build Chords from Lead Melody</span>
        </button>
      </div>
    </div>
  );
};

export default AiSongRecreator;
