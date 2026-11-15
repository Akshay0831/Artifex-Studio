import { createContext, useContext } from 'react';
import type { ApiProfile, ApiKeyState } from '../../types/api';

export type ApiKeyAction =
  | { type: 'SET_PROFILES'; payload: ApiProfile[] }
  | { type: 'SET_CURRENT_PROFILE'; payload: string }
  | { type: 'ADD_PROFILE'; payload: ApiProfile }
  | { type: 'UPDATE_PROFILE'; payload: { id: string; updates: Partial<ApiProfile> } }
  | { type: 'DELETE_PROFILE'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

export interface ApiKeyContextType {
  state: ApiKeyState;
  dispatch: React.Dispatch<ApiKeyAction>;
  setCurrentProfile: (profileId: string) => void;
  addProfile: (profile: Omit<ApiProfile, 'id'>) => Promise<ApiProfile>;
  updateProfile: (profileId: string, updates: Partial<ApiProfile>) => Promise<ApiProfile>;
  deleteProfile: (profileId: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export const useApiKey = () => {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return context;
};
