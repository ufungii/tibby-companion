import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { readAudioOutput } from '../services/audioOutput';
import { outputIdentity, unknownOutput } from '../services/audioOutputTypes';

export function useAudioOutput() {
  const [output, setOutput] = useState(unknownOutput);
  const refresh = useCallback(async () => {
    try { return await readAudioOutput(); }
    catch { return unknownOutput; }
  }, []);
  useEffect(() => {
    let alive = true; let reading = false;
    const update = async () => {
      if (reading || AppState.currentState === 'background') return;
      reading = true;
      const next = await refresh();
      if (alive) setOutput((previous) => outputIdentity(previous) === outputIdentity(next) ? previous : next);
      reading = false;
    };
    void update();
    const timer = setInterval(() => void update(), 1500);
    return () => { alive = false; clearInterval(timer); };
  }, [refresh]);
  return { output, refresh };
}
