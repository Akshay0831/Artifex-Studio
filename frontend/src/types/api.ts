export interface ApiProfile {
  id: string
  name: string
  api_key: string
  api_type: 'replicate' | 'runpod' | 'openai' | 'ollama' | 'lm_studio'
  base_url?: string | null
  is_active: boolean
  models: string[]
  default_model: string | null
  temperature?: number
  rate_limit: number
  usage_count: number
  last_used: string | null
  created_at: string
}

export interface ApiKeyState {
  profiles: Record<string, ApiProfile>
  currentProfile: string | null
  isLoading: boolean
  error: string | null
}

export interface ModelConfig {
  display_name: string
  type: 'image_generation' | 'audio_generation' | 'text_generation'
  default_prompt: string
  supports_negative_prompt?: boolean
  supports_steps?: boolean
  default_steps: number
  max_steps: number
  supports_cfg?: boolean
  default_cfg?: number
  supports_size?: boolean
  default_size: string
  max_size: string
  description?: string
  pricing?: {
    input_cost?: number
    output_cost?: number
    currency: string
  }
}

export interface ApiProfileConfig {
  [api_type: string]: {
    name: string
    description: string
    models: {
      [model_id: string]: ModelConfig
    }
    rate_limits: {
      requests_per_minute: number
      requests_per_hour: number
    }
  }
}

export interface GenerationRequest {
  prompt: string
  model: string
  api_profile?: string
  api_profile_id?: string
  generation_type?: 'image' | 'audio' | 'text'
  negative_prompt?: string
  steps?: number
  cfg?: number
  size?: string
  batch_size?: number
  seed?: number
  temperature?: number
  system_prompt?: string
}

export interface GenerationResponse {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: string
  error?: string
  progress: number
  estimated_time?: number
  api_profile_id?: string
  model: string
  prompt: string
  timestamp: string
}

export interface LocalModelOption {
  id: string
  name: string
  type: 'text'
}

export interface LocalModelDiscoveryResponse {
  api_type: 'ollama' | 'lm_studio'
  capabilities: string[]
  models: LocalModelOption[]
}

export type ReferenceRole = 'style' | 'composition' | 'subject' | 'palette'
export type PaletteMode = 'off' | 'extract' | 'fixed' | 'maximum'

export interface ImagePaletteSettings {
  mode: PaletteMode
  colors: string[]
  max_colors: number | null
  dither: boolean
  preserve_alpha: boolean
  source_reference?: ImagePaletteSourceReference | null
}

export interface ImagePaletteSourceReference {
  project_id: string
  reference_id: string
  sha256: string
  original_filename: string
}

export interface ExtractedReferencePalette {
  source_reference: ImagePaletteSourceReference
  max_colors: number
  colors: string[]
}

export interface ArtGenerationRequest {
  prompt: string
  negative_prompt?: string
  seed?: number
  config?: Record<string, unknown>
  palette?: ImagePaletteSettings
  prefer_local?: boolean
}

export interface ImageGenerationResult {
  image_base64: string
  seed: number
  backend: string
  metadata?: Record<string, unknown> | null
  palette?: {
    mode: PaletteMode
    max_colors?: number | null
    colors: string[]
    opaque_color_count: number | null
    alpha_preserved: boolean
    dither: boolean
  } | null
}

export interface StudioProject {
  id: string
  name: string
  description: string
  tags: string[]
  config: Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface ProjectReference {
  id: string
  project_id: string
  original_filename: string
  media_type: 'image' | 'audio'
  media_format: string
  size_bytes: number
  sha256: string
  role: ReferenceRole | null
  source: string | null
  media_info: {
    content_type: string
    format: string
    width?: number
    height?: number
    duration_seconds?: number
    sample_rate?: number
    channels?: number
    frames?: number
  }
  created_at: number
}