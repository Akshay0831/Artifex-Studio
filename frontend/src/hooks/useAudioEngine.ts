import { useState, useCallback, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import {
  AudioTrackLayer,
  SongZone,
} from '../features/audio/types';

interface TrackNodes {
  channel: Tone.Channel;
  eq: Tone.EQ3;
  reverb: Tone.Reverb;
  delay: Tone.FeedbackDelay;
  distortion: Tone.Distortion;
  chorus: Tone.Chorus;
  synth: Tone.PolySynth | Tone.MembraneSynth;
  meter: Tone.Meter;
}

export const useAudioEngine = (initialBpm: number = 120) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [activeZoneIndex, setActiveZoneIndex] = useState<number>(0);
  const [loopCurrentZoneOnly, setLoopCurrentZoneOnly] = useState<boolean>(true);
  const trackNodesMap = useRef<Map<string, TrackNodes>>(new Map());
  const masterMeterRef = useRef<Tone.Meter | null>(null);
  const repeatIdRef = useRef<number | null>(null);

  // Audio Context & Master Meter initialization
  useEffect(() => {
    if (!masterMeterRef.current) {
      const meter = new Tone.Meter({ normalRange: true });
      const masterCompressor = new Tone.Compressor({ threshold: -14, ratio: 3.5 });
      const masterLimiter = new Tone.Limiter(-0.5);

      masterCompressor.chain(masterLimiter, Tone.getDestination());
      Tone.getDestination().connect(meter);
      masterMeterRef.current = meter;
    }

    Tone.getTransport().bpm.value = initialBpm;
    const trackNodes = trackNodesMap.current;

    return () => {
      if (repeatIdRef.current !== null) {
        Tone.getTransport().clear(repeatIdRef.current);
      }
      trackNodes.forEach(nodes => {
        nodes.synth.dispose();
        nodes.distortion.dispose();
        nodes.chorus.dispose();
        nodes.eq.dispose();
        nodes.delay.dispose();
        nodes.reverb.dispose();
        nodes.channel.dispose();
        nodes.meter.dispose();
      });
      trackNodes.clear();
    };
  }, [initialBpm]);

  // Setup or update audio nodes for a layer
  const initOrUpdateLayerNodes = useCallback((layer: AudioTrackLayer) => {
    let nodes = trackNodesMap.current.get(layer.id);
    if (!nodes) {
      const channel = new Tone.Channel({
        volume: layer.muted ? -Infinity : layer.volume,
        pan: layer.pan
      });
      const meter = new Tone.Meter({ normalRange: true });
      const eq = new Tone.EQ3(layer.fx.eq.low, layer.fx.eq.mid, layer.fx.eq.high);
      const reverb = new Tone.Reverb({ decay: layer.fx.reverb.decay, wet: layer.fx.reverb.enabled ? layer.fx.reverb.wet : 0 });
      const delay = new Tone.FeedbackDelay({ delayTime: layer.fx.delay.time, feedback: layer.fx.delay.feedback, wet: layer.fx.delay.enabled ? layer.fx.delay.wet : 0 });
      const distortion = new Tone.Distortion({ distortion: layer.fx.distortion.enabled ? layer.fx.distortion.drive : 0 });
      const chorusFx = layer.fx.chorus ?? { frequency: 1.5, depth: 0.5, wet: 0, enabled: false };
      const chorus = new Tone.Chorus({ frequency: chorusFx.frequency, depth: chorusFx.depth, wet: chorusFx.enabled ? chorusFx.wet : 0 }).start();

      let synth: Tone.PolySynth | Tone.MembraneSynth;
      if (layer.instrument.type === 'drums') {
        synth = new Tone.MembraneSynth({
          pitchDecay: 0.05,
          octaves: 4,
          oscillator: { type: 'sine' },
          envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.2 }
        });
      } else {
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: layer.instrument.oscillatorType },
          envelope: layer.instrument.envelope
        });
      }

      // Chain: Synth -> Distortion -> Chorus -> EQ -> Delay -> Reverb -> Channel -> Meter -> Destination
      synth.chain(distortion, chorus, eq, delay, reverb, channel, meter, Tone.getDestination());

      nodes = { channel, eq, reverb, delay, distortion, chorus, synth, meter };
      trackNodesMap.current.set(layer.id, nodes);
    } else {
      // Update parameters in real time
      nodes.channel.volume.value = layer.muted ? -Infinity : layer.volume;
      nodes.channel.pan.value = layer.pan;
      nodes.eq.low.value = layer.fx.eq.low;
      nodes.eq.mid.value = layer.fx.eq.mid;
      nodes.eq.high.value = layer.fx.eq.high;
      nodes.reverb.decay = Math.max(0.1, layer.fx.reverb.decay);
      nodes.reverb.wet.value = layer.fx.reverb.enabled ? layer.fx.reverb.wet : 0;
      nodes.delay.feedback.value = layer.fx.delay.feedback;
      nodes.delay.wet.value = layer.fx.delay.enabled ? layer.fx.delay.wet : 0;
      nodes.distortion.distortion = layer.fx.distortion.enabled ? layer.fx.distortion.drive : 0;
      if (layer.fx.chorus) {
        nodes.chorus.frequency.value = layer.fx.chorus.frequency;
        nodes.chorus.depth = layer.fx.chorus.depth;
        nodes.chorus.wet.value = layer.fx.chorus.enabled ? layer.fx.chorus.wet : 0;
      }
    }
  }, []);

  // Audition a note for a specific layer
  const playAuditionNote = useCallback(async (layer: AudioTrackLayer, pitch: string) => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    initOrUpdateLayerNodes(layer);
    const nodes = trackNodesMap.current.get(layer.id);
    if (nodes) {
      if (nodes.synth instanceof Tone.PolySynth) {
        nodes.synth.triggerAttackRelease(pitch, '16n');
      } else if (nodes.synth instanceof Tone.MembraneSynth) {
        nodes.synth.triggerAttackRelease(pitch || 'C1', '16n');
      }
    }
  }, [initOrUpdateLayerNodes]);

  // Toggle playback for layers and zones
  const togglePlay = useCallback(async (
    layers: AudioTrackLayer[],
    zones: SongZone[],
    activeZoneId: string
  ) => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }

    const transport = Tone.getTransport();

    if (isPlaying) {
      transport.stop();
      if (repeatIdRef.current !== null) {
        transport.clear(repeatIdRef.current);
        repeatIdRef.current = null;
      }
      setIsPlaying(false);
      setCurrentStep(0);
      return;
    }

    // Ensure all layer audio nodes are initialized
    layers.forEach(layer => initOrUpdateLayerNodes(layer));

    const activeZone = zones.find(z => z.id === activeZoneId) || zones[0];
    const totalSteps = loopCurrentZoneOnly ? activeZone.lengthSteps : (zones.length * 32);

    let stepCounter = 0;
    repeatIdRef.current = transport.scheduleRepeat((time) => {
      const stepInZone = stepCounter % 32;
      const currentZoneIdx = Math.floor(stepCounter / 32) % zones.length;
      const currentZone = loopCurrentZoneOnly ? activeZone : zones[currentZoneIdx];

      setCurrentStep(stepInZone);
      setActiveZoneIndex(currentZoneIdx);

      // Trigger notes for each layer
      layers.forEach(layer => {
        if (layer.muted) return;
        const nodes = trackNodesMap.current.get(layer.id);
        if (!nodes) return;

        const zoneNotes = layer.zoneNotes[currentZone.id] || [];
        const notesOnStep = zoneNotes.filter(n => n.step === stepInZone);

        if (notesOnStep.length > 0) {
          notesOnStep.forEach(n => {
            const dur = n.duration === 1 ? '16n'
              : n.duration === 2 ? '8n'
              : n.duration === 4 ? '4n'
              : n.duration === 8 ? '2n'
              : n.duration >= 16 ? '1m'
              : `${n.duration * 0.125}s`;

            if (nodes.synth instanceof Tone.PolySynth) {
              nodes.synth.triggerAttackRelease(n.note, dur, time, n.velocity || 0.8);
            } else if (nodes.synth instanceof Tone.MembraneSynth) {
              nodes.synth.triggerAttackRelease(n.note || 'C1', dur, time, n.velocity || 0.9);
            }
          });
        }
      });

      stepCounter = (stepCounter + 1) % totalSteps;
    }, '16n');

    transport.start();
    setIsPlaying(true);
  }, [isPlaying, loopCurrentZoneOnly, initOrUpdateLayerNodes]);

  const stop = useCallback(() => {
    const transport = Tone.getTransport();
    transport.stop();
    if (repeatIdRef.current !== null) {
      transport.clear(repeatIdRef.current);
      repeatIdRef.current = null;
    }
    setIsPlaying(false);
    setCurrentStep(0);
  }, []);

  return {
    isPlaying,
    currentStep,
    activeZoneIndex,
    loopCurrentZoneOnly,
    setLoopCurrentZoneOnly,
    togglePlay,
    stop,
    playAuditionNote,
    initOrUpdateLayerNodes,
    masterMeter: masterMeterRef.current,
    trackNodesMap: trackNodesMap.current
  };
};
