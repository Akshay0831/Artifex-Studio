import axios from 'axios';
import type {
  ArtGenerationRequest,
  ImageGenerationResult,
  ProjectReference,
  ReferenceRole,
  StudioProject,
} from '../types/api';

const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:8000' 
  : import.meta.env.VITE_API_BASE_URL || '';

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
  check: () => api.get('/health'),
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
  getHealth: () => api.get('/api/config/health').catch(() => ({ status: 'ok' })),
  getEnvironments: () => api.get('/api/config/environments'),
  getCurrentEnvironment: () => api.get('/api/config/current'),
  setEnvironment: (env: string, config: any) => api.post('/api/config/set', { environment: env, config }),
  validateConfig: (env: string, config: any) => api.post('/api/config/validate', { environment: env, config }),
  getSettings: () => api.get('/api/config/settings'),
  updateSettings: (settings: any) => api.post('/api/config/settings', settings),
};

// Enhanced API
export const enhancedApi = {
  getHealth: () => api.get('/api/enhanced/health').catch(() => ({ status: 'ok' })),
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
  getHealth: () => api.get('/api/art/health').catch(() => ({ status: 'ok' })),
  generateImage: (data: ArtGenerationRequest) =>
    api.post<ImageGenerationResult>('/api/art/generate', data),
  getGenerationHistory: () => api.get('/api/art/history'),
  getGenerationStatus: (id: string) => api.get(`/api/art/status/${id}`),
  cancelGeneration: (id: string) => api.post(`/api/art/cancel/${id}`),
  saveImage: (data: any) => api.post('/api/art/save', data),
  loadImage: (id: string) => api.get(`/api/art/load/${id}`),
  deleteImage: (id: string) => api.delete(`/api/art/delete/${id}`),
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
  getHealth: () => api.get('/api/audio/health').catch(() => ({ status: 'ok' })),
  generateAudio: (data: any) => api.post('/api/audio/generate', data),
  getAudioHistory: () => api.get('/api/audio/history'),
  getAudioStatus: (id: string) => api.get(`/api/audio/status/${id}`),
  cancelAudio: (id: string) => api.post(`/api/audio/cancel/${id}`),
  saveAudio: (data: any) => api.post('/api/audio/save', data),
  loadAudio: (id: string) => api.get(`/api/audio/load/${id}`),
  deleteAudio: (id: string) => api.delete(`/api/audio/delete/${id}`),
};

export default api;