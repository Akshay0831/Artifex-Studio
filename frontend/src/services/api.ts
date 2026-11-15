import axios from 'axios';
import type {
  ArtGenerationRequest,
  ExtractedReferencePalette,
  GenerationRequest,
  GenerationResponse,
  ImageGenerationResult,
  LocalModelDiscoveryResponse,
  ProjectReference,
  ReferenceRole,
  StudioProject,
} from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const projectsClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

const localModelClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

const textGenerationClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000,
  headers: { 'Content-Type': 'application/json' },
});

projectsClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Project API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  },
);

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      // Handle authentication if needed
      console.error('Unauthorized access');
    } else if (error.response?.status >= 500) {
      console.error('Server error');
    }
    
    return Promise.reject(error);
  }
);

// Health check
export const healthApi = {
  check: () => api.get('/api/health'),
};

// Backup API
export const backupApi = {
  getHealth: () => api.get('/api/backup/health'),
  getBackups: () => api.get('/api/backup/list'),
  createBackup: (data: { project_id?: string; description?: string; manual?: boolean }) =>
    api.post('/api/backup/create', data),
  scheduleBackup: () => api.post('/api/backup/schedule_auto_backup'),
  getBackupStatus: () => api.get('/api/backup/auto-backup/status'),
  enableAutoBackup: (data: { interval_hours?: number; backup_type?: string }) =>
    api.post('/api/backup/auto-backup/enable', data),
  disableAutoBackup: () => api.post('/api/backup/auto-backup/disable'),
  restoreBackup: (backupId: string, data: { project_id?: string; restore_path?: string }) =>
    api.post(`/api/backup/restore/${backupId}`, data),
  deleteBackup: (backupId: string) => api.delete(`/api/backup/delete/${backupId}`),
};

// Scaling API
export const scalingApi = {
  getHealth: (instanceId?: string) => 
    instanceId ? api.get(`/api/scaling/health/${instanceId}`) : Promise.reject('Instance ID required'),
  getStatus: () => api.get('/api/scaling/status'),
  scale: (direction: 'up' | 'down', data: { factor?: number; target?: string }) =>
    api.post('/api/scaling/scale', { direction, ...data }),
  getMetrics: () => api.get('/api/scaling/metrics'),
};

// Config API
export const configApi = {
  getHealth: () => api.get('/api/config/health'),
  getEnvironments: () => api.get('/api/config/environments'),
  getCurrentEnvironment: () => api.get('/api/config/current'),
  setEnvironment: (env: string, config: any) => api.post('/api/config/set', { environment: env, config }),
  validateConfig: (env: string, config: any) => api.post('/api/config/validate', { environment: env, config }),
  getSettings: () => api.get('/api/config/settings'),
  updateSettings: (settings: any) => api.post('/api/config/settings', settings),
};

// Enhanced API
export const enhancedApi = {
  getHealth: () => api.get('/api/enhanced/health'),
  createProject: (data: any) => api.post('/api/enhanced/projects', data),
  getProjects: () => api.get('/api/enhanced/projects'),
  getProject: (id: string) => api.get(`/api/enhanced/projects/${id}`),
  updateProject: (id: string, data: any) => api.put(`/api/enhanced/projects/${id}`, data),
  deleteProject: (id: string) => api.delete(`/api/enhanced/projects/${id}`),
  exportProject: (id: string, format: string, options?: any) => 
    api.post(`/api/enhanced/projects/${id}/export`, { format, ...options }),
  batchExport: (data: { ids: string[]; format: string; options?: any }) =>
    api.post('/api/enhanced/batch-export', data),
};

// Art API
export const artApi = {
  getHealth: () => api.get('/api/art/health'),
  generateImage: (data: ArtGenerationRequest) =>
    api.post<ImageGenerationResult>('/api/art/generate', data),
  inpaintImage: (data: { base_image: string; mask_image: string; prompt: string; seed?: number; config?: any }) =>
    api.post<ImageGenerationResult>('/api/art/inpaint', data),
    api.post<ImageGenerationResult>('/api/art/generate', data),
  getGenerationHistory: () => api.get('/api/art/history'),
  getGenerationStatus: (id: string) => api.get(`/api/art/status/${id}`),
  cancelGeneration: (id: string) => api.post(`/api/art/cancel/${id}`),
  saveImage: (data: any) => api.post('/api/art/save', data),
  loadImage: (id: string) => api.get(`/api/art/load/${id}`),
  deleteImage: (id: string) => api.delete(`/api/art/delete/${id}`),
};

export const toolsApi = {
  getManifest: () => api.get('/api/tools/manifest'),
  callTool: (toolName: string, args: Record<string, any>) =>
    api.post('/api/tools/call', { tool_name: toolName, arguments: args }),
};

export const localModelsApi = {
  discover: async (provider: 'ollama' | 'lm_studio', baseUrl: string) =>
    (await localModelClient.post<LocalModelDiscoveryResponse>(
      `/api/api-management/providers/${provider}/discover`,
      { base_url: baseUrl },
    )).data,
};

export const textGenerationApi = {
  generate: async (request: GenerationRequest) =>
    (await textGenerationClient.post<GenerationResponse>(
      '/api/generation/generate',
      { ...request, generation_type: 'text' },
    )).data,
};

// Project metadata and reference assets
export const projectsApi = {
  list: async () =>
    (await projectsClient.get<{ projects: StudioProject[]; total: number }>('/api/projects')).data,
  get: async (projectId: string) =>
    (await projectsClient.get<StudioProject>(`/api/projects/${projectId}`)).data,
  create: async (data: Omit<StudioProject, 'id' | 'created_at' | 'updated_at'>) =>
    (await projectsClient.post<StudioProject>('/api/projects', data)).data,
  update: async (
    projectId: string,
    data: Omit<StudioProject, 'id' | 'created_at' | 'updated_at'>,
  ) =>
    (await projectsClient.put<StudioProject>(`/api/projects/${projectId}`, data)).data,
  getEditorState: async (projectId: string) => {
    const response = await projectsClient.get<ArrayBuffer>(
      `/api/projects/${projectId}/editor-state`,
      { responseType: 'arraybuffer' },
    );
    return response.status === 204 ? null : new Uint8Array(response.data);
  },
  saveEditorState: async (projectId: string, editorState: Uint8Array) =>
    (await projectsClient.put<{ status: 'saved'; size_bytes: number }>(
      `/api/projects/${projectId}/editor-state`,
      editorState,
      {
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 120000,
      },
    )).data,
  delete: async (projectId: string) =>
    (await projectsClient.delete(`/api/projects/${projectId}`)).data,
  exportBundle: async (projectId: string) =>
    (await projectsClient.get<Blob>(`/api/projects/${projectId}/bundle`, {
      responseType: 'blob',
    })).data,
  importBundle: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return (await projectsClient.post<StudioProject>('/api/projects/bundle', form)).data;
  },
  listReferences: async (projectId: string) =>
    (await projectsClient.get<{ references: ProjectReference[]; total: number }>(
      `/api/projects/${projectId}/references`,
    )).data,
  extractReferencePalette: async (
    projectId: string,
    referenceId: string,
    maxColors: number,
  ) =>
    (await projectsClient.get<ExtractedReferencePalette>(
      `/api/projects/${projectId}/references/${referenceId}/palette`,
      { params: { max_colors: maxColors } },
    )).data,
  uploadReference: async (
    projectId: string,
    file: File,
    role?: ReferenceRole,
    source?: string,
  ) => {
    const form = new FormData();
    form.append('file', file);
    if (role) form.append('role', role);
    if (source) form.append('source', source);
    return (await projectsClient.post<ProjectReference>(
      `/api/projects/${projectId}/references`,
      form,
    )).data;
  },
  getReference: async (projectId: string, referenceId: string) =>
    (await projectsClient.get<ProjectReference>(
      `/api/projects/${projectId}/references/${referenceId}`,
    )).data,
  getReferenceContent: async (projectId: string, referenceId: string) =>
    (await projectsClient.get<Blob>(
      `/api/projects/${projectId}/references/${referenceId}/content`,
      { responseType: 'blob' },
    )).data,
  referenceContentUrl: (projectId: string, referenceId: string) =>
    `${API_BASE_URL}/api/projects/${projectId}/references/${referenceId}/content`,
  deleteReference: async (projectId: string, referenceId: string) =>
    (await projectsClient.delete(`/api/projects/${projectId}/references/${referenceId}`)).data,
};

// Audio API
export const audioApi = {
  getHealth: () => api.get('/api/audio/health'),
  generateAudio: (data: any) => api.post('/api/audio/generate', data),
  getAudioHistory: () => api.get('/api/audio/history'),
  getAudioStatus: (id: string) => api.get(`/api/audio/status/${id}`),
  cancelAudio: (id: string) => api.post(`/api/audio/cancel/${id}`),
  saveAudio: (data: any) => api.post('/api/audio/save', data),
  loadAudio: (id: string) => api.get(`/api/audio/load/${id}`),
  deleteAudio: (id: string) => api.delete(`/api/audio/delete/${id}`),
};

// Tools API for external/in-app AI agents
export const toolsApi = {
  getManifest: () => api.get<{ protocol_version: string; tools: any[] }>('/api/tools/manifest'),
  callTool: (toolName: string, args: Record<string, any>) => 
    api.post<{ tool_name: string; status: string; result: any; error?: string }>('/api/tools/call', {
      tool_name: toolName,
      arguments: args
    }),
};

export default api;