import { useCallback, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { createRequestGuard } from '../domain';
import type { Answer, Encounter, Turn } from '../domain';
import { backend } from '../services/backend';
import { createWearable } from '../services/wearable';
import type { Capture, WearableDevice } from '../services/wearableTypes';
import { useAudioOutput } from '../hooks/useAudioOutput';
import { describeOutput, outputIdentity } from '../services/audioOutputTypes';
import { finishAudioPlayback, prepareAudioPlayback } from '../services/audioOutput';

type Phase = 'idle' | 'recording' | 'sending' | 'waiting' | 'ready' | 'cancelled' | 'error';
const phaseLabels: Record<Phase, string> = {
  idle: 'Ready to record or ask a question', recording: 'Recording', sending: 'Sending',
  waiting: 'Waiting for response', ready: 'Response ready', cancelled: 'Cancelled', error: 'Request failed',
};

function Label({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.text, style]} />;
}
function Button({ label, onPress, disabled = false, secondary = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary,
      disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Label style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Label>
  </Pressable>;
}
function Section({ children }: PropsWithChildren) { return <View style={styles.section}>{children}</View>; }

export default function Home() {
  const [started, setStarted] = useState(false);
  const [server, setServer] = useState({ audio: false, mode: 'check', model: 'Not connected' });
  const [starting, setStarting] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [devices, setDevices] = useState<WearableDevice[]>([]);
  const [device, setDevice] = useState<WearableDevice | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState('Not connected');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [roster, setRoster] = useState<Encounter[]>([]);
  const [candidate, setCandidate] = useState<Encounter | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [playback, setPlayback] = useState<'idle' | 'starting' | 'test' | 'reply'>('idle');
  const [phase, setPhase] = useState<Phase>('idle');
  const [testedOutput, setTestedOutput] = useState<string | null>(null);
  const [confirmedOutput, setConfirmedOutput] = useState<string | null>(null);
  const { output, refresh: refreshOutput } = useAudioOutput();
  const audioIdentity = outputIdentity(output);
  const previousOutputs = useRef(output.connected);
  const [error, setError] = useState('');
  const api = useRef(backend);
  const [wearable] = useState(createWearable);
  const capture = useRef<Capture | null>(null);
  const guard = useRef(createRequestGuard());
  const controller = useRef<AbortController | null>(null);
  const setupController = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const deviceOperation = useRef(0);
  const speechVersion = useRef(0);
  const alive = useRef(true);

  const startSession = useCallback(async () => {
    const version = ++operation.current;
    setupController.current?.abort();
    const abort = new AbortController(); setupController.current = abort;
    setStarting(true); setError('');
    try {
      const encounters = await api.current.start(abort.signal);
      if (alive.current && version === operation.current) {
        setRoster(encounters); setStarted(true);
        setServer({ audio: api.current.supportsAudio, mode: api.current.audioMode ?? 'transcription', model: api.current.modelLabel });
      }
    } catch (cause) {
      if (alive.current && version === operation.current) setError(cause instanceof Error ? cause.message : 'Service unavailable. Try again.');
    } finally {
      if (alive.current && version === operation.current) setStarting(false);
    }
  }, []);

  const stopPlayback = useCallback(() => {
    const version = ++speechVersion.current;
    setSpeaking(false); setPlayback('idle');
    void Speech.stop().then(() => {
      if (version === speechVersion.current) return finishAudioPlayback();
    }).catch(() => undefined);
  }, []);
  function cancel() {
    guard.current.cancel(); controller.current?.abort(); controller.current = null;
    capture.current?.cancel(); capture.current = null;
    stopPlayback(); setRecording(false); setBusy(false); setAnswer(null); setError(''); setPhase('idle');
  }
  useEffect(() => {
    alive.current = true;
    const startup = setTimeout(() => void startSession(), 0);
    const requestGuard = guard.current;
    const service = api.current;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        requestGuard.cancel(); controller.current?.abort(); capture.current?.cancel();
        speechVersion.current += 1; void Speech.stop().then(() => finishAudioPlayback()).catch(() => undefined);
        setBusy(false); setRecording(false); setSpeaking(false); setPlayback('idle'); setAnswer(null); setPhase('idle');
      }
    });
    return () => {
      clearTimeout(startup);
      alive.current = false; operation.current += 1; deviceOperation.current += 1;
      subscription.remove(); requestGuard.cancel(); controller.current?.abort();
      setupController.current?.abort(); capture.current?.cancel();
      speechVersion.current += 1; void Speech.stop().then(() => finishAudioPlayback()).catch(() => undefined);
      void service.end().catch(() => undefined);
      void wearable.destroy().catch(() => undefined);
    };
  }, [wearable, startSession]);
  useEffect(() => {
    const removed = previousOutputs.current.some((previous) =>
      ['bluetooth', 'headphones', 'usb'].includes(previous.kind) &&
      !output.connected.some((next) => next.id === previous.id));
    previousOutputs.current = output.connected;
    if (removed && playback !== 'idle') {
      stopPlayback(); setTestedOutput(null);
      setError('Audio device disconnected. Check the phone output, then replay.');
    }
  }, [output, playback, stopPlayback]);
  async function choosePatient(patient: Encounter) {
    cancel();
    const version = ++operation.current;
    setupController.current?.abort();
    const abort = new AbortController(); setupController.current = abort;
    guard.current.setEncounter(null); setEncounter(null); setCandidate(patient); setHistory([]); setSelecting(true);
    try { await api.current.selectEncounter(null, abort.signal); }
    catch (cause) { if (alive.current && version === operation.current) setError(cause instanceof Error ? cause.message : 'Context update failed.'); }
    finally { if (alive.current && version === operation.current) setSelecting(false); }
  }
  async function confirmPatient() {
    if (!candidate) return;
    cancel();
    const selected = candidate; const version = ++operation.current;
    const abort = new AbortController(); setupController.current = abort; setSelecting(true);
    try {
      const token = await api.current.selectEncounter(selected.id, abort.signal);
      const turns = await api.current.history(selected.id, abort.signal);
      if (alive.current && version === operation.current) {
        guard.current.setEncounter(selected.id, token); setEncounter(selected); setHistory(turns);
      }
    } catch (cause) { if (alive.current && version === operation.current) setError(cause instanceof Error ? cause.message : 'Confirmation failed.'); }
    finally { if (alive.current && version === operation.current) setSelecting(false); }
  }
  function accept(result: Answer, input: string, kind: 'typed' | 'wearable') {
    if (!alive.current || !guard.current.accepts(result.context)) return;
    setAnswer(result); setPhase('ready');
    const inputKind = result.provider === 'connection-test' ? 'wearable-check' as const : kind;
    setHistory((previous) => [...previous,
      { id: `${result.context.requestId}-user`, role: 'user' as const, inputKind, text: result.transcript ?? (input || 'Wearable audio received; not transcribed.') },
      { id: `${result.context.requestId}-reply`, role: 'assistant' as const, inputKind, text: result.text },
    ].slice(-40));
  }
  async function ask() {
    if (!encounter || busy || !question.trim()) return;
    stopPlayback(); controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const context = guard.current.begin(); const input = question.trim();
    setBusy(true); setAnswer(null); setError(''); setPhase('sending');
    try { accept(await api.current.ask(context, input, abort.signal, (next) => {
      if (alive.current && guard.current.accepts(context)) setPhase(next);
    }), input, 'typed'); }
    catch (cause) { if (alive.current && guard.current.accepts(context)) { setPhase('error'); setError(cause instanceof Error ? cause.message : 'Request failed.'); } }
    finally { if (alive.current && guard.current.accepts(context)) setBusy(false); }
  }
  async function scan() {
    const version = ++deviceOperation.current;
    setDeviceBusy(true); setDevices([]); setError(''); setDeviceStatus('Scanning for TIBBY...');
    try {
      const found = await wearable.scan();
      if (alive.current && version === deviceOperation.current) {
        setDevices(found); setDeviceStatus(found.length ? 'Select a wearable below' : 'No TIBBY found. Check power and BLE firmware.');
      }
    } catch (cause) { if (alive.current && version === deviceOperation.current) { setDeviceStatus('Not connected'); setError(cause instanceof Error ? cause.message : 'Scan failed.'); } }
    finally { if (alive.current && version === deviceOperation.current) setDeviceBusy(false); }
  }
  async function connect(found: WearableDevice) {
    const version = ++deviceOperation.current;
    setDeviceBusy(true); setDeviceStatus('Connecting...'); setError('');
    try {
      await wearable.connect(found.id, () => {
        if (!alive.current) return;
        cancel(); setDevice(null); setDeviceStatus('Disconnected');
      });
      if (alive.current && version === deviceOperation.current) { setDevice(found); setDeviceStatus(`Connected: ${found.name}`); setDevices([]); }
    } catch (cause) { if (alive.current && version === deviceOperation.current) { setDeviceStatus('Not connected'); setError(cause instanceof Error ? cause.message : 'Connection failed.'); } }
    finally { if (alive.current && version === deviceOperation.current) setDeviceBusy(false); }
  }
  async function disconnect() {
    deviceOperation.current += 1; cancel(); setDevice(null); setDeviceBusy(false); setDevices([]); setDeviceStatus('Not connected');
    await wearable.disconnect();
  }
  function record() {
    if (!device || !encounter || busy || !api.current.supportsAudio) return;
    cancel(); const context = guard.current.begin();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setRecording(true); setSeconds(0); setPhase('recording');
    const service = api.current;
    const fail = (cause: Error) => {
      if (alive.current && guard.current.accepts(context)) { setRecording(false); setBusy(false); setPhase('error'); setError(cause.message); }
    };
    try {
      capture.current = wearable.capture({
        progress: (value) => { if (alive.current && guard.current.accepts(context)) setSeconds(value); },
        error: fail,
        complete: (wav) => {
          if (!alive.current || !guard.current.accepts(context)) return;
          setRecording(false); capture.current = null; setPhase('sending');
          void service.askAudio(context, wav, abort.signal, (next) => {
            if (alive.current && guard.current.accepts(context)) setPhase(next);
          })
            .then((result) => accept(result, '', 'wearable')).catch(fail)
            .finally(() => { if (alive.current && guard.current.accepts(context)) setBusy(false); });
        },
      });
    } catch (cause) { fail(cause instanceof Error ? cause : new Error('Recording failed.')); }
  }
  async function playAudio(test = false) {
    if (!test && (!answer || !guard.current.accepts(answer.context))) return;
    const context = test ? null : answer!.context;
    const version = ++speechVersion.current;
    const current = () => alive.current && version === speechVersion.current && (!context || guard.current.accepts(context));
    setPlayback('starting'); setError('');
    if (test) { setTestedOutput(null); setConfirmedOutput(null); }
    try {
      await Speech.stop();
      if (!current()) return;
      await prepareAudioPlayback();
      if (!current()) return;
      const finish = (completed = false) => {
        if (!current()) return;
        setSpeaking(false); setPlayback('idle');
        if (test && completed) setTestedOutput(audioIdentity);
        void finishAudioPlayback().catch(() => undefined);
      };
      Speech.speak(test ? 'Tibby audio test. Confirm that you can hear this through your selected headphones or speaker.' : answer!.text,
        { language: 'en-US', rate: 0.95, useApplicationAudioSession: true,
          onStart: () => { if (current()) { setSpeaking(true); setPlayback(test ? 'test' : 'reply'); void refreshOutput(); } },
          onDone: () => finish(true), onStopped: () => finish(),
          onError: () => { finish(); if (current()) setError('Playback failed. Check phone audio output.'); } });
    } catch { if (current()) { setSpeaking(false); setPlayback('idle'); setError('Playback unavailable.'); void finishAudioPlayback().catch(() => undefined); } }
  }
  function endSession() {
    cancel(); operation.current += 1; setupController.current?.abort(); guard.current.setEncounter(null);
    setEncounter(null); setCandidate(null); setHistory([]); setRoster([]); setStarted(false); setSelecting(false); setQuestion('');
    void api.current.end().catch(() => { if (alive.current) setError('Local session ended. Server revocation failed; the server session will expire.'); });
    void disconnect().catch(() => undefined);
  }

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Label style={styles.heading}>TIBBY</Label><Label>Connections and conversation</Label></View>
    <Label style={styles.small}>Prototype: test data only. No clinician or wearable identity authentication yet.</Label>
    {!!error && <Label accessibilityRole="alert" style={styles.error}>{error}</Label>}
    <Section>
      <Label style={styles.title}>1. Backend</Label>
      {!started ? <>
        <Label>{starting ? 'Preparing your session...' : 'Session not active.'}</Label>
        <Button label={starting ? 'Connecting...' : error ? 'Retry' : 'Start session'} disabled={starting} onPress={() => void startSession()} />
      </> : <>
        <Label>Session active</Label>
        <Label style={styles.small}>{server.model}</Label>
        {server.mode === 'check' && <Label style={styles.small}>{server.audio
          ? 'Audio connection test available. Transcription and AI replies are not configured.'
          : 'Backend online. Recording checks require the latest backend deployment.'}</Label>}
        <Button label="End session" secondary onPress={endSession} />
      </>}
    </Section>
    <Section>
      <Label style={styles.title}>2. Wearable (BLE)</Label><Label>{deviceStatus}</Label>
      <Label style={styles.small}>The phone connects directly to the wearable. The backend does not establish the BLE connection.</Label>
      {!device ? <Button label={deviceBusy ? 'Working...' : 'Scan for TIBBY'} disabled={deviceBusy} onPress={() => void scan()} />
        : <Button label="Disconnect wearable" secondary onPress={() => void disconnect()} />}
      {devices.map((found) => <Button key={found.id} label={`Connect ${found.name} (${found.id.slice(-8)})`} disabled={deviceBusy} secondary onPress={() => void connect(found)} />)}
      {Platform.OS === 'web' && <Label style={styles.small}>BLE is available only in the Android/iPhone development build, not this browser preview.</Label>}
    </Section>
      <Section><Label style={styles.title}>3. Patient context</Label>
        {!started && <Label style={styles.small}>Waiting for a backend session. Patient selection will appear here.</Label>}
        <Label style={styles.small}>Select and confirm the patient before capturing audio or asking questions. History is separate for each patient.</Label>
        {roster.map((patient) => <Pressable key={patient.id} accessibilityRole="radio" accessibilityState={{ checked: candidate?.id === patient.id, disabled: selecting }}
          disabled={selecting} onPress={() => void choosePatient(patient)} style={[styles.patient, candidate?.id === patient.id && styles.patientSelected]}>
          <Label style={styles.patientName}>{candidate?.id === patient.id ? '[x]' : '[ ]'} {patient.patientName}</Label>
          <Label style={styles.small}>ID: {patient.patientId} · DOB: {patient.dateOfBirth}</Label>
        </Pressable>)}
        <Button label={selecting ? 'Updating patient...' : encounter ? 'Patient confirmed' : 'Confirm patient'} disabled={!candidate || !!encounter || selecting} onPress={() => void confirmPatient()} />
      </Section>
      <Section><Label style={styles.title}>4. Recording and response</Label>
        <Label accessibilityLiveRegion="polite" style={styles.patientName}>
          {playback === 'starting' ? 'Preparing audio...' : playback === 'reply' && speaking ? 'Playing response' : phaseLabels[phase]}
        </Label>
        <Label>{encounter ? `Patient: ${encounter.patientName}` : 'Confirm a patient first.'}</Label>
        <Label style={styles.small}>Capture wearable speech, review its transcript and reply, then ask follow-up questions below. Recording is explicitly started here, not always on.</Label>
        {recording ? <><Label accessibilityLiveRegion="polite">Receiving audio: {seconds.toFixed(1)} seconds</Label>
          <Button label="Stop recording and send" onPress={() => capture.current?.stop()} /></>
          : <Button label={server.mode === 'check' ? 'Test wearable audio round trip' : 'Record wearable audio'} disabled={!device || !encounter || busy || !server.audio} onPress={record} />}
        {server.mode === 'check' && <Label style={styles.small}>Sends real recorded audio and reads back a receipt. This does not transcribe speech or call AI.</Label>}
        {!server.audio && <Label style={styles.small}>{started
          ? 'Recording is unavailable on this backend version. After the server update, end this session and start a new one.'
          : 'Connect to the backend before sending a recording.'}</Label>}
        {phase === 'waiting' && <Label style={styles.small}>Request sent. Upload or server processing may still be in progress.</Label>}
        {busy && <Button label="Cancel request" secondary onPress={() => { cancel(); setPhase('cancelled'); }} />}
        {answer && <View style={styles.answer}>
          <Label style={styles.patientName}>Latest response</Label>
          {answer.transcript && <><Label style={styles.small}>Wearable transcript</Label><Label>{answer.transcript}</Label></>}
          <Label selectable>{answer.text}</Label>
          <Label style={styles.small}>{answer.provider === 'navigator' ? 'Navigator LLM' : answer.provider === 'connection-test' ? 'Audio connection receipt — no transcription or AI' : 'Demo reply — no AI'}</Label>
          <Button label={playback === 'reply' || playback === 'starting' ? 'Stop playback' : 'Play / replay response'}
            onPress={() => playback !== 'idle' ? stopPlayback() : void playAudio()} />
          {answer.sources.map((source) => <View key={source.title}><Label style={styles.patientName}>{source.title}</Label><Label style={styles.small}>{source.detail}</Label></View>)}
        </View>}
      </Section>
      <Section><Label style={styles.title}>5. Audio output</Label>
        <Label accessibilityLiveRegion="polite">{describeOutput(output)}</Label>
        {!!output.connected.length && <Label style={styles.small}>Detected audio devices: {output.connected.map((item) => item.name).join(', ')}</Label>}
        <Label style={styles.small}>Pair headphones and choose audio output in phone settings. This is separate from the wearable BLE connection.</Label>
        {Platform.OS === 'web' && <Label style={styles.small}>Browser preview uses the computer audio output; headphone detection is unavailable here.</Label>}
        <Button label={playback !== 'idle' ? 'Stop audio' : 'Test audio'}
          disabled={recording} onPress={() => playback !== 'idle' ? stopPlayback() : void playAudio(true)} secondary />
        {testedOutput === audioIdentity && confirmedOutput !== audioIdentity && <Button label="I heard the test audio" secondary onPress={() => setConfirmedOutput(audioIdentity)} />}
        {confirmedOutput === audioIdentity && <Label style={styles.small}>You confirmed the test was audible. This is a listening check, not automatic verification of the headphone route.</Label>}
      </Section>
      <Section><Label style={styles.title}>6. Chat history</Label>
        <Label style={styles.small}>Transcripts, your questions, and replies for the selected patient.</Label>
        {!history.length && <Label style={styles.small}>{encounter ? 'No chat history for this patient in this session.' : 'Confirm a patient to view history and ask questions.'}</Label>}
        {history.map((turn) => <View key={turn.id} style={styles.turn}>
          <Label style={styles.patientName}>{turn.role === 'assistant' ? 'Reply' : turn.inputKind === 'wearable' ? 'Wearable transcript' : turn.inputKind === 'wearable-check' ? 'Wearable audio check (not transcribed)' : 'Phone question'}</Label>
          <Label>{turn.text}</Label>
        </View>)}
        <Label style={styles.small}>A wearable recording does not prove who spoke. History is retained only for this server session (latest 40 messages).</Label>
        <Label style={styles.title}>Ask about chat history</Label>
        <Label style={styles.small}>Ask for a recap or find something mentioned earlier. You can ask here without the wearable connected.</Label>
        <TextInput accessibilityLabel="Question about chat history" value={question} onChangeText={setQuestion}
          editable={!!encounter && !busy} multiline maxLength={500} style={styles.input}
          placeholder="What was said in the last recording?" placeholderTextColor="#666" />
        <Button label="Ask question" disabled={!encounter || busy || !question.trim()} onPress={() => void ask()} />
      </Section>
    <Label style={styles.small}>Replies play through this phone or its paired headphones.</Label>
    {Platform.OS === 'web' && <Label style={styles.small}>Browser preview audio plays on this computer.</Label>}
    {Platform.OS === 'ios' && <Label style={styles.small}>If speech is muted, turn off silent mode.</Label>}
  </ScrollView></SafeAreaView>;
}
const fontFamily = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  page: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 20, paddingBottom: 40, gap: 12 },
  text: { fontFamily, color: '#111', fontSize: 14, lineHeight: 22 },
  header: { borderBottomWidth: 1, borderBottomColor: '#aaa', paddingBottom: 12, gap: 4 },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '700' }, title: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  small: { fontSize: 12, lineHeight: 19, color: '#555' }, section: { paddingVertical: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: '#ccc' },
  button: { minHeight: 44, padding: 11, borderWidth: 1, borderColor: '#222', backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', borderRadius: 2 },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' }, secondary: { backgroundColor: '#fff', borderColor: '#888' }, secondaryText: { color: '#111' },
  disabled: { opacity: 0.4 }, pressed: { opacity: 0.65 }, patient: { padding: 12, borderWidth: 1, borderColor: '#bbb', gap: 3 }, patientSelected: { borderColor: '#111', backgroundColor: '#f3f3f3' },
  patientName: { fontWeight: '700' }, input: { fontFamily, minHeight: 96, borderWidth: 1, borderColor: '#888', padding: 10, fontSize: 14, lineHeight: 22, color: '#111', textAlignVertical: 'top' },
  answer: { borderTopWidth: 1, borderTopColor: '#bbb', paddingTop: 16, gap: 12 }, turn: { gap: 6, borderLeftWidth: 2, borderLeftColor: '#aaa', paddingLeft: 12, paddingVertical: 6 }, error: { color: '#a00000' },
});
