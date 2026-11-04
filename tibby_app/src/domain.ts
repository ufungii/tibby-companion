export type Encounter = {
  id: string;
  patientName: string;
  patientId: string;
  dateOfBirth: string;
  room: string;
};

export type RequestContext = {
  requestId: number;
  encounterId: string;
  contextVersion: number;
  encounterToken?: string;
};

export type Answer = {
  context: RequestContext;
  text: string;
  sources: { title: string; detail: string }[];
  transcript?: string | null;
  provider?: string;
};

export type Turn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  inputKind: 'typed' | 'wearable';
};

/** Local stale-response guard. The real server must independently validate context. */
export function createRequestGuard() {
  let encounterId: string | null = null;
  let contextVersion = 0;
  let requestId = 0;
  let active: RequestContext | null = null;
  let encounterToken: string | undefined;

  return {
    setEncounter(id: string | null, token?: string) {
      encounterId = id;
      encounterToken = token;
      contextVersion += 1;
      active = null;
    },
    cancel() {
      active = null;
    },
    begin(): RequestContext {
      if (!encounterId) throw new Error('Confirm a patient before asking a question.');
      active = { requestId: ++requestId, encounterId, contextVersion,
        ...(encounterToken ? { encounterToken } : {}) };
      return { ...active };
    },
    accepts(context: RequestContext): boolean {
      return active !== null &&
        context.requestId === active.requestId &&
        context.encounterId === active.encounterId &&
        context.contextVersion === active.contextVersion &&
        context.encounterToken === active.encounterToken;
    },
  };
}
