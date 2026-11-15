import { useState, useCallback, useRef, useEffect } from 'react';
import * as Tone from 'tone';

export const useAudioPlayback = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [player, setPlayer] = useState<Tone.Player | null>(null);
  
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const meterRef = useRef<Tone.Meter | null>(null);
  const repeatIdRef = useRef<number | null>(null);

  // Initialize synth and master meter
  useEffect(() => {
    if (!synthRef.current) {
      const meter = new Tone.Meter({ normalRange: true });
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.005,
          decay: 0.1,
          sustain: 0.3,
          release: 0.4
        }
      });
      synth.connect(meter);
      meter.toDestination();

      synthRef.current = synth;
      meterRef.current = meter;
    }

    return () => {
      if (repeatIdRef.current !== null) {
        Tone.getTransport().clear(repeatIdRef.current);
      }
    };
  }, []);

  const loadResult = useCallback(async (url: string) => {
    if (player) player.dispose();
    const p = new Tone.Player(url).toDestination();
    await Tone.loaded();
    setPlayer(p);
  }, [player]);

  const togglePlay = useCallback(async (activeNotesMap?: Record<string, boolean>) => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }

    const transport = Tone.getTransport();

    if (isPlaying) {
      transport.stop();
      if (player) player.stop();
      setIsPlaying(false);
      setCurrentStep(0);
    } else {
      // Setup step sequencer transport event if not already repeating
      if (repeatIdRef.current === null) {
        let step = 0;
        repeatIdRef.current = transport.scheduleRepeat((time) => {
          step = (step + 1) % 32;
          setCurrentStep(step);

          // Play active notes on this step
          if (activeNotesMap && synthRef.current) {
            const notesOnStep: string[] = [];
            const allNotes = ['C4', 'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3'];
            allNotes.forEach(note => {
              if (activeNotesMap[`note_${note}_${step}`]) {
                notesOnStep.push(note);
              }
            });
            if (notesOnStep.length > 0) {
              synthRef.current.triggerAttackRelease(notesOnStep, '16n', time, 0.7);
            }
          }
        }, '16n');
      }

      transport.start();
      if (player) player.start();
      setIsPlaying(true);
    }
  }, [isPlaying, player]);

  const stop = useCallback(() => {
    const transport = Tone.getTransport();
    transport.stop();
    if (player) player.stop();
    setIsPlaying(false);
    setCurrentStep(0);
  }, [player]);

  const playAuditionNote = useCallback(async (pitch: string) => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    if (synthRef.current) {
      synthRef.current.triggerAttackRelease(pitch, '16n');
    }
  }, []);

  return { 
    isPlaying, 
    currentStep,
    togglePlay, 
    stop, 
    loadResult, 
    playAuditionNote,
    synth: synthRef.current,
    meter: meterRef.current
  };
};
