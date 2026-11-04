import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { createRequestGuard } from '../domain';
import type { Answer, Turn } from '../domain';
import { backend } from '../services/backend';
import { createWearable } from '../services/wearable';
import type { Capture, WearableDevice } from '../services/wearableTypes';
import { useAudioOutput } from '../hooks/useAudioOutput';
import { describeOutput, outputIdentity } from '../services/audioOutputTypes';
import { finishAudioPlayback, prepareAudioPlayback } from '../services/audioOutput';
import { openDemoConversation } from '../services/demoSession';
import { Button, Label, Step } from '../components/ui';
import { theme } from '../theme';

type Phase = 'idle' | 'recording' | 'sending' | 'waiting' | 'ready' | 'cancelled' | 'error';
const phaseLabels: Record<Phase, string> = {
  idle: 'Ready to record or ask a question', recording: 'Recording', sending: 'Sending',
  waiting: 'Waiting for response', ready: 'Response ready', cancelled: 'Cancelled', error: 'Request failed',
};

export default function Home() {
  const [started, setStarted] = useState(false);
  const [server, setServer] = useState({ audio: false, mode: 'check' });
  const [starting, setStarting] = useState(true);
  const [devices, setDevices] = useState<WearableDevice[]>([]);
  const [device, setDevice] = useState<WearableDevice | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState('Not connected');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
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
    setStarting(true); setError(''); setStarted(false);
    guard.current.setEncounter(null); setConversationId(null); setHistory([]);
    try {
      const conversation = await openDemoConversation(api.current, abort.signal);
      if (alive.current && version === operation.current) {
        guard.current.setEncounter(conversation.id, conversation.token);
        setConversationId(conversation.id); setHistory(conversation.history); setStarted(true);
        setServer({ audio: api.current.supportsAudio, mode: api.current.audioMode ?? 'transcription' });
      }
    } catch (cause) {
      if (alive.current && version === operation.current) {
        setError(cause instanceof Error ? cause.message : 'Service unavailable. Try again.');
        void api.current.end().catch(() => undefined);
      }
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
    if (!conversationId || busy || !question.trim()) return;
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
    if (!device || !conversationId || busy || !api.current.supportsAudio) return;
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
  function newConversation() {
    cancel(); setQuestion('');
    void startSession();
  }

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      <View><Label style={styles.heading}>Tibby</Label><Label style={styles.subtitle}>Companion</Label></View>
      <Label accessibilityLiveRegion="polite" style={[styles.status, !!error && styles.statusError]}>
        {starting ? 'Connecting...' : error ? 'Needs attention' : started ? 'Ready' : 'Not connected'}
      </Label>
    </View>
    <Label style={styles.meta}>Research demo · test data only</Label>
    {!!error && <Label accessibilityRole="alert" style={styles.error}>{error}</Label>}
    {!started && !starting && <Button label="Retry connection" secondary onPress={() => void startSession()} />}
    <Step number={1} title="Wearable" help={<>
      <Label style={styles.small}>Keep the wearable nearby with Bluetooth enabled on the phone. Scan, then choose your TIBBY device.</Label>
      {!wearable.available && <Label style={styles.small}>The website and Expo Go can demo the interface and replies. Connecting to the PCB requires the installed TIBBY phone app.</Label>}
    </>}>
      <Label accessibilityLiveRegion="polite">{wearable.available ? deviceStatus : 'Installed phone app required'}</Label>
      {!device ? <Button label={deviceBusy ? 'Working...' : 'Scan for TIBBY'} disabled={deviceBusy || !wearable.available} onPress={() => void scan()} />
        : <Button label="Disconnect wearable" secondary onPress={() => void disconnect()} />}
      {devices.map((found) => <Button key={found.id} label={`Connect ${found.name} (${found.id.slice(-8)})`} disabled={deviceBusy} secondary onPress={() => void connect(found)} />)}
    </Step>
    <Step number={2} title="Recording and response" help={<>
      <Label style={styles.small}>Start a wearable recording, speak, then stop and send it. Recording starts only when you choose it.</Label>
      <Label style={styles.small}>In connection-test mode, the reply confirms the duration and bytes received. It does not transcribe speech or call AI.</Label>
      <Label style={styles.small}>When a reply is ready, read it here or use Play / replay response. Waiting includes upload and processing time.</Label>
    </>}>
        <Label accessibilityLiveRegion="polite" style={styles.emphasis}>
          {playback === 'starting' ? 'Preparing audio...' : playback === 'reply' && speaking ? 'Playing response' : phaseLabels[phase]}
        </Label>
        {!conversationId && <Label style={styles.small}>{starting ? 'Preparing conversation...' : 'Reconnect to record or ask questions.'}</Label>}
        {recording ? <><Label accessibilityLiveRegion="polite">Receiving audio: {seconds.toFixed(1)} seconds</Label>
          <Button label="Stop recording and send" onPress={() => capture.current?.stop()} /></>
          : <Button label={server.mode === 'check' ? 'Test wearable audio round trip' : 'Record wearable audio'} disabled={!device || !conversationId || busy || !server.audio} onPress={record} />}
        {started && server.mode === 'check' && <Label style={styles.small}>Connection test · no transcription or AI</Label>}
        {!server.audio && <Label style={styles.small}>{started
          ? 'Recording is unavailable. Try a new conversation after the service has been updated.'
          : 'Waiting for a connection before sending a recording.'}</Label>}
        {busy && <Button label="Cancel request" secondary onPress={() => { cancel(); setPhase('cancelled'); }} />}
        {answer && <View style={styles.answer}>
          <Label style={styles.emphasis}>Latest response</Label>
          {answer.transcript && <><Label style={styles.small}>Wearable transcript</Label><Label>{answer.transcript}</Label></>}
          <Label selectable>{answer.text}</Label>
          <Label style={styles.small}>{answer.provider === 'navigator' ? 'Navigator LLM' : answer.provider === 'connection-test' ? 'Audio connection receipt — no transcription or AI' : 'Demo reply — no AI'}</Label>
          <Button label={playback === 'reply' || playback === 'starting' ? 'Stop playback' : 'Play / replay response'}
            onPress={() => playback !== 'idle' ? stopPlayback() : void playAudio()} />
          {answer.sources.map((source) => <View key={source.title}><Label style={styles.emphasis}>{source.title}</Label><Label style={styles.small}>{source.detail}</Label></View>)}
        </View>}
    </Step>
    <Step number={3} title="Audio output" help={<>
      <Label style={styles.small}>Pair headphones and select audio output in phone settings. This connection is separate from the wearable.</Label>
      <Label style={styles.small}>Use Test audio to check audibility. A detected or connected device does not prove where speech is playing.</Label>
      {Platform.OS === 'web' && <Label style={styles.small}>Browser audio uses the output selected on your device. Headphone-route detection is unavailable in this web demo.</Label>}
      {Platform.OS === 'ios' && <Label style={styles.small}>If speech is muted, check the phone volume and silent mode.</Label>}
    </>}>
        <Label accessibilityLiveRegion="polite">{describeOutput(output)}</Label>
        {!!output.connected.length && <Label style={styles.small}>Detected audio devices: {output.connected.map((item) => item.name).join(', ')}</Label>}
        <Button label={playback !== 'idle' ? 'Stop audio' : 'Test audio'}
          disabled={recording} onPress={() => playback !== 'idle' ? stopPlayback() : void playAudio(true)} secondary />
        {testedOutput === audioIdentity && confirmedOutput !== audioIdentity && <Button label="I heard the test audio" secondary onPress={() => setConfirmedOutput(audioIdentity)} />}
        {confirmedOutput === audioIdentity && <Label style={styles.small}>You confirmed the test was audible. This is a listening check, not automatic verification of the headphone route.</Label>}
    </Step>
    <Step number={4} title="Chat history" help={<>
      <Label style={styles.small}>Review transcripts, your questions and replies, or ask a follow-up without connecting the wearable.</Label>
      <Label style={styles.small}>New conversation clears this chat and starts fresh. The server keeps only the latest 40 messages for the current session.</Label>
      <Label style={styles.small}>A microphone recording captures speech; it does not verify who spoke.</Label>
    </>}>
        <Button label="New conversation" secondary disabled={starting || busy} onPress={newConversation} />
        {!history.length && <Label style={styles.small}>{conversationId ? 'No messages in this conversation yet.' : 'Waiting for a connection.'}</Label>}
        {history.map((turn) => <View key={turn.id} style={styles.turn}>
          <Label style={styles.emphasis}>{turn.role === 'assistant' ? 'Reply' : turn.inputKind === 'wearable' ? 'Wearable transcript' : turn.inputKind === 'wearable-check' ? 'Wearable audio check (not transcribed)' : 'Phone question'}</Label>
          <Label>{turn.text}</Label>
        </View>)}
        <Label style={styles.fieldLabel}>Ask about this conversation</Label>
        <TextInput accessibilityLabel="Question about chat history" value={question} onChangeText={setQuestion}
          editable={!!conversationId && !busy} multiline maxLength={500} style={styles.input} keyboardAppearance="dark"
          placeholder="What was said in the last recording?" placeholderTextColor={theme.muted} />
        <Button label="Ask question" disabled={!conversationId || busy || !question.trim()} onPress={() => void ask()} />
    </Step>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 22, paddingBottom: 44 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 16 },
  heading: { fontSize: 28, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { fontSize: 13, color: theme.muted },
  status: { color: theme.accent, fontSize: 13, fontWeight: '500' }, statusError: { color: theme.error },
  meta: { fontSize: 12, lineHeight: 20, color: theme.muted, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
  small: { fontSize: 13, lineHeight: 20, color: theme.muted }, emphasis: { fontWeight: '600' },
  fieldLabel: { fontSize: 13, color: theme.muted, paddingTop: 8 },
  input: { fontFamily: theme.font, minHeight: 100, borderWidth: 1, borderColor: theme.border, borderRadius: 4,
    backgroundColor: theme.surface, padding: 12, fontSize: 16, lineHeight: 24, color: theme.text, textAlignVertical: 'top' },
  answer: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16, gap: 12 },
  turn: { gap: 6, borderLeftWidth: 2, borderLeftColor: theme.border, paddingLeft: 12, paddingVertical: 6 },
  error: { color: theme.error, borderLeftWidth: 2, borderLeftColor: theme.error, paddingLeft: 12, marginVertical: 16 },
});
