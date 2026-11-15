import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Activity } from 'lucide-react';
import { useStudioStore } from '../../core/useStudioStore';

export const ApiStatusChecker: React.FC = () => {
  const { connected } = useStudioStore();
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [healthStatus, setHealthStatus] = useState<'ok' | 'error' | 'websocket-error' | 'checking'>('checking');

  const checkHealth = async () => {
    setIsChecking(true);
    setHealthStatus('checking');
    setLastCheck(new Date());

    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        const health: unknown = await response.json();
        const websocketUnavailable =
          typeof health === 'object' &&
          health !== null &&
          'websocket_available' in health &&
          health.websocket_available === false;
        setHealthStatus(websocketUnavailable ? 'websocket-error' : 'ok');
      } else {
        setHealthStatus('error');
      }
    } catch (error) {
      setHealthStatus('error');
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Check health on mount and every 30 seconds
    checkHealth();
    const interval = setInterval(checkHealth, 30000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    switch (healthStatus) {
      case 'ok': return connected ? 'text-green-500' : 'text-yellow-500';
      case 'websocket-error': return 'text-red-500';
      case 'error': return 'text-red-500';
      case 'checking': return 'text-yellow-500';
      default: return 'text-studio-text-dim';
    }
  };

  const getStatusText = () => {
    switch (healthStatus) {
      case 'ok': return connected ? 'Connected' : 'WebSocket reconnecting';
      case 'websocket-error': return 'WebSocket support missing';
      case 'error': return 'API connection error';
      case 'checking': return 'Checking...';
      default: return 'Disconnected';
    }
  };

  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded px-3 py-1 text-[10px] font-bold ${getStatusColor()}`}
      role="status"
      aria-live="polite"
      title={healthStatus === 'websocket-error'
        ? 'Install backend requirements; image and audio generation need a WebSocket protocol implementation.'
        : healthStatus === 'ok' && !connected
          ? 'The HTTP API is available, but the realtime WebSocket is disconnected. Check the backend address and runtime dependencies.'
          : undefined}
    >
      {isChecking && <Activity size={10} className="animate-spin" />}
      {!isChecking && (
        connected ? (
          <Wifi size={10} />
        ) : (
          <WifiOff size={10} />
        )
      )}
      <span className="truncate">{getStatusText()}</span>
      {lastCheck && (
        <span className="opacity-60">
          {lastCheck.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
};
