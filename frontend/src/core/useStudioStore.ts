import axios from 'axios';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { EXTENSION_STATE_DEFINITIONS } from '../features/extensionState';
import { projectsApi } from '../services/api';
import { ACTIVE_PROJECT_KEY } from './projectState';

interface StudioDocument {
  projectId: string | null;
  yDoc: Y.Doc;
  featureMaps: Record<string, Y.Map<any>>;
  yCollaboration: Y.Map<any>;
  yPrompt: Y.Map<any>;
  yHistory: Y.Array<any>;
  yExperimental: Y.Map<any>;
  yReviewMode: Y.Map<any>;
  yProjectConfig: Y.Map<any>;
  revision: number;
  saveError: string | null;
  updateListener: (() => void) | null;
}

type StudioSocketMessage = { type: string; [key: string]: unknown };

const listeners: Set<() => void> = new Set();
let lastMessage: any = null;
let metrics: any = null;
let isConnected = false;
let apiSocket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let currentDocument = createDocument(null);
let persistenceReady = false;
let persistenceStatus: 'loading' | 'ready' | 'saving' | 'error' | 'unassigned' = 'loading';
let persistenceError: string | null = null;
let initializationStarted = false;
let projectSwitchQueue: Promise<void> = Promise.resolve();
let saveQueue: Promise<void> = Promise.resolve();
let saveTimer: number | null = null;

const notify = () => listeners.forEach(listener => listener());

function createDocument(projectId: string | null): StudioDocument {
  const yDoc = new Y.Doc();
  const featureMaps: Record<string, Y.Map<any>> = {};
  EXTENSION_STATE_DEFINITIONS.forEach(extension => {
    featureMaps[extension.stateKey] = yDoc.getMap(extension.stateKey);
  });
  return {
    projectId,
    yDoc,
    featureMaps,
    yCollaboration: yDoc.getMap('collaboration'),
    yPrompt: yDoc.getMap('prompt'),
    yHistory: yDoc.getArray('history'),
    yExperimental: yDoc.getMap('experimental'),
    yReviewMode: yDoc.getMap('review_mode'),
    yProjectConfig: yDoc.getMap('project_config'),
    revision: 0,
    saveError: null,
    updateListener: null,
  };
}

function initializeDocument(state: StudioDocument, update?: Uint8Array | null) {
  if (update) Y.applyUpdate(state.yDoc, update);

  EXTENSION_STATE_DEFINITIONS.forEach(extension => {
    const map = state.featureMaps[extension.stateKey];
    if (extension.initialState && map.size === 0) {
      Object.entries(extension.initialState).forEach(([key, value]) => {
        map.set(key, value);
      });
    }
  });

  if (state.yExperimental.size === 0) {
    state.yExperimental.set('proposals', new Y.Map());
    state.yExperimental.set('activeProposalId', null);
  }
  if (state.yReviewMode.size === 0) state.yReviewMode.set('active', false);
  if (state.yProjectConfig.size === 0) {
    state.yProjectConfig.set('stylePreset', 'fantasy');
    state.yProjectConfig.set('autoSyncAudio', true);
    state.yProjectConfig.set('sceneMetadata', new Y.Map());
  }

  state.yHistory.observe(() => {
    if (state.yHistory.length > 50) {
      state.yHistory.delete(0, state.yHistory.length - 50);
    }
  });
}

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return error instanceof Error ? error.message : 'An unexpected persistence error occurred.';
}

function enqueueSave(state: StudioDocument) {
  if (!state.projectId) return saveQueue;
  const update = Y.encodeStateAsUpdate(state.yDoc);
  const revision = state.revision;

  saveQueue = saveQueue
    .then(() => projectsApi.saveEditorState(state.projectId!, update))
    .then(
      () => {
        state.saveError = null;
        if (currentDocument === state && state.revision === revision) {
          persistenceStatus = 'ready';
          persistenceError = null;
          notify();
        }
      },
      error => {
        state.saveError = getErrorMessage(error);
        if (currentDocument === state) {
          persistenceStatus = 'error';
          persistenceError = state.saveError;
          notify();
        }
      },
    );
  return saveQueue;
}

async function flushPendingSave(state: StudioDocument) {
  if (!state.projectId) return;
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  await enqueueSave(state);
  if (state.saveError) throw new Error(state.saveError);
}

function observeDocument(state: StudioDocument) {
  state.updateListener = () => {
    if (currentDocument !== state || !persistenceReady || !state.projectId) return;
    state.revision += 1;
    persistenceStatus = 'saving';
    notify();
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void enqueueSave(state);
    }, 350);
  };
  state.yDoc.on('update', state.updateListener);
}

async function switchProject(projectId: string | null) {
  const nextProjectId = projectId?.trim() || null;
  if (
    currentDocument.projectId === nextProjectId &&
    persistenceReady &&
    persistenceStatus !== 'error'
  ) {
    return;
  }

  const previousDocument = currentDocument;
  const hadReadyDocument = persistenceReady;
  if (hadReadyDocument && previousDocument.projectId) {
    await flushPendingSave(previousDocument);
  }

  persistenceReady = hadReadyDocument;
  persistenceStatus = 'loading';
  persistenceError = null;
  notify();
  const nextDocument = createDocument(nextProjectId);

  try {
    const savedState = nextProjectId
      ? await projectsApi.getEditorState(nextProjectId)
      : null;
    initializeDocument(nextDocument, savedState);
    if (nextProjectId) {
      await projectsApi.saveEditorState(
        nextProjectId,
        Y.encodeStateAsUpdate(nextDocument.yDoc),
      );
    }

    if (previousDocument.updateListener) {
      previousDocument.yDoc.off('update', previousDocument.updateListener);
    }
    previousDocument.yDoc.destroy();
    currentDocument = nextDocument;
    persistenceReady = true;
    persistenceStatus = nextProjectId ? 'ready' : 'unassigned';
    observeDocument(nextDocument);
    try {
      if (nextProjectId) window.localStorage.setItem(ACTIVE_PROJECT_KEY, nextProjectId);
      else window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
    } catch (error) {
      persistenceStatus = 'error';
      persistenceError = `Project opened, but its selection could not be saved: ${getErrorMessage(error)}`;
    }
    notify();
  } catch (error) {
    nextDocument.yDoc.destroy();
    persistenceReady = hadReadyDocument;
    if (hadReadyDocument) {
      persistenceStatus = previousDocument.projectId ? 'ready' : 'unassigned';
      persistenceError = null;
    } else {
      persistenceStatus = 'error';
      persistenceError = getErrorMessage(error);
    }
    notify();
    throw error;
  }
}

export function activateProject(projectId: string | null) {
  const request = projectSwitchQueue.then(() => switchProject(projectId));
  projectSwitchQueue = request.then(
    () => undefined,
    () => undefined,
  );
  return request;
}

export function retryStudioPersistence() {
  if (!persistenceReady) {
    try {
      return activateProject(window.localStorage.getItem(ACTIVE_PROJECT_KEY));
    } catch (error) {
      persistenceError = getErrorMessage(error);
      notify();
      return Promise.reject(error);
    }
  }
  return flushPendingSave(currentDocument);
}

export function flushStudioProjectState() {
  return flushPendingSave(currentDocument);
}

function connectApi() {
  if (
    apiSocket &&
    (apiSocket.readyState === WebSocket.OPEN || apiSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  const wsUrl = import.meta.env.VITE_WS_URL ||
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  const socket = new WebSocket(wsUrl);
  apiSocket = socket;
  socket.onopen = () => {
    if (apiSocket !== socket) return;
    isConnected = true;
    notify();
  };
  socket.onmessage = event => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'system_status') metrics = message;
      else lastMessage = message;
      notify();
    } catch {
      lastMessage = { type: 'error', message: 'Received an invalid WebSocket response.' };
      notify();
    }
  };
  socket.onclose = () => {
    if (apiSocket !== socket) return;
    apiSocket = null;
    isConnected = false;
    notify();
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connectApi, 2000);
  };
  socket.onerror = () => socket.close();
}

function initializeStore() {
  if (initializationStarted) return;
  initializationStarted = true;
  connectApi();
  try {
    void activateProject(window.localStorage.getItem(ACTIVE_PROJECT_KEY)).catch(() => undefined);
  } catch (error) {
    persistenceError = getErrorMessage(error);
    persistenceStatus = 'error';
    notify();
  }
}

function sendApiMessage(message: StudioSocketMessage) {
  if (!apiSocket || apiSocket.readyState !== WebSocket.OPEN) {
    throw new Error('Backend connection is unavailable. Wait for reconnection and retry.');
  }
  apiSocket.send(JSON.stringify(message));
}

export const useStudioStore = () => {
  const [, setUpdate] = useState(0);
  useEffect(() => {
    const listener = () => setUpdate(version => version + 1);
    listeners.add(listener);
    initializeStore();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    yDoc: currentDocument.yDoc,
    featureMaps: currentDocument.featureMaps,
    yImage: currentDocument.featureMaps.image,
    yAudio: currentDocument.featureMaps.audio,
    yPrompt: currentDocument.yPrompt,
    yHistory: currentDocument.yHistory,
    yCollaboration: currentDocument.yCollaboration,
    yExperimental: currentDocument.yExperimental,
    yReviewMode: currentDocument.yReviewMode,
    yProjectConfig: currentDocument.yProjectConfig,
    activeProjectId: currentDocument.projectId,
    persistenceReady,
    persistenceStatus,
    persistenceError,
    retryPersistence: retryStudioPersistence,
    flushPersistence: flushStudioProjectState,
    activateProject,
    connected: isConnected,
    users: {},
    lastMessage,
    metrics,
    sendMessage: sendApiMessage,
  };
};
