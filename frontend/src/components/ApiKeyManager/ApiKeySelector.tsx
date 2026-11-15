import React, { useMemo } from 'react'
import { useApiKey } from './ApiKeyContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/themed'
import { Badge } from '@/components/ui/themed'
import { Select } from '@/components/ui/themed'
import { Alert, AlertDescription } from '@/components/ui/themed'
import { CheckCircle, AlertCircle, Zap, RefreshCw } from 'lucide-react'
import { TruncatedText } from '../common/TruncatedText'

export const ApiKeySelector: React.FC = () => {
  const { state, setCurrentProfile } = useApiKey()
  
  const activeProfiles = useMemo(() => {
    return Object.values(state.profiles).filter(profile => profile.is_active)
  }, [state.profiles])

  const selectedProfile = useMemo(() => {
    if (!state.currentProfile) return null
    return state.profiles[state.currentProfile]
  }, [state.currentProfile, state.profiles])

  const handleProfileChange = (profileId: string) => {
    setCurrentProfile(profileId)
  }

  const getProviderIcon = (apiType: string) => {
    switch (apiType) {
      case 'replicate': return '🧪'
      case 'runpod': return '🚀'
      case 'openai': return '🤖'
      default: return '🔑'
    }
  }

  const getStatusMessage = () => {
    if (!state.currentProfile) {
      if (activeProfiles.length === 0) {
        return {
          type: 'error' as const,
          message: 'No active API profiles available. Please add at least one profile in the management tab.'
        }
      }
      return {
        type: 'warning' as const,
        message: 'No API profile selected. Please choose one to start generating.'
      }
    }
    
    return {
      type: 'success' as const,
      message: `Active profile: ${selectedProfile?.name} (${getProviderIcon(selectedProfile?.api_type || '')})`
    }
  }

  const status = getStatusMessage()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Current API Configuration
          </CardTitle>
          <CardDescription>
            Select the API profile and model to use for generation tasks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Alert */}
          <Alert className={status.type === 'error' ? 'border-studio-error' : status.type === 'warning' ? 'border-studio-warning' : 'border-studio-success'}>
            {status.type === 'error' && <AlertCircle className="h-4 w-4 text-studio-error" />}
            {status.type === 'warning' && <RefreshCw className="h-4 w-4 text-studio-warning" />}
            {status.type === 'success' && <CheckCircle className="h-4 w-4 text-studio-success" />}
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>

          {/* Profile Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Active API Profile</label>
            <Select
              value={state.currentProfile || ''}
              onValueChange={handleProfileChange}
              disabled={activeProfiles.length === 0}
              placeholder={activeProfiles.length === 0 ? 'No active profiles' : 'Select API profile'}
            >
                {activeProfiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {getProviderIcon(profile.api_type)} {profile.name} ({profile.api_type.toUpperCase()})
                  </option>
                ))}
            </Select>
            {activeProfiles.length === 0 && (
              <p className="text-xs text-studio-error">Please add at least one active API profile to continue</p>
            )}
          </div>

          {/* Selected Profile Details */}
          {selectedProfile && (
            <Card className="bg-studio-card border-studio-border text-studio-text">
              <CardContent className="pt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <TruncatedText text={selectedProfile.name} className="font-semibold" />
                    <div className="flex items-center gap-2">
                      <span>{getProviderIcon(selectedProfile.api_type)}</span>
                      <Badge variant="default">{selectedProfile.api_type.toUpperCase()}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-studio-text-dim">Default Model:</span>
                      <span className="ml-2 font-medium">{selectedProfile.default_model || 'None selected'}</span>
                    </div>
                    <div>
                      <span className="text-studio-text-dim">Rate Limit:</span>
                      <span className="ml-2 font-medium">{selectedProfile.rate_limit}/min</span>
                    </div>
                    <div>
                      <span className="text-studio-text-dim">Available Models:</span>
                      <span className="ml-2 font-medium">{selectedProfile.models.length}</span>
                    </div>
                    <div>
                      <span className="text-studio-text-dim">Usage Count:</span>
                      <span className="ml-2 font-medium">{selectedProfile.usage_count}</span>
                    </div>
                  </div>

                  {/* Model Selection */}
                  {selectedProfile.models.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Available Models</label>
                      <div className="flex flex-wrap gap-2">
                        {selectedProfile.models.map(modelId => (
                          <Badge
                            key={modelId}
                            variant={modelId === selectedProfile.default_model ? "default" : "secondary"}
                            className="cursor-pointer hover:bg-studio-hover"
                          >
                            {modelId}
                            {modelId === selectedProfile.default_model && (
                              <span className="ml-1">🌟</span>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active Profiles Overview */}
          {activeProfiles.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">All Active Profiles</label>
              <div className="space-y-2">
                {activeProfiles.map(profile => (
                  <Card
                    key={profile.id}
                    className={`transition-all cursor-pointer ${
                      profile.id === state.currentProfile
                        ? 'ring-2 ring-studio-accent bg-studio-panel-selected'
                        : 'hover:bg-studio-panel-hover'
                    }`}
                    onClick={() => handleProfileChange(profile.id)}
                  >
                    <CardContent className="pt-3">
                      <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="text-lg">{getProviderIcon(profile.api_type)}</span>
                          <div className="min-w-0">
                            <TruncatedText text={profile.name} className="font-medium" />
                            <p className="text-sm text-studio-text-dim">
                              {profile.models.length} models • {profile.rate_limit}/min
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={profile.id === state.currentProfile ? "default" : "outline"}>
                            {profile.api_type.toUpperCase()}
                          </Badge>
                          {profile.id === state.currentProfile && (
                            <CheckCircle className="h-4 w-4 text-studio-success" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}