import { Terminal, History, RotateCcw, FlaskConical, Check, X, Key, Bot } from 'lucide-react';
import * as Y from 'yjs';
import type { ExtensionManifest } from '../features/registry';
import { useStudioStore } from '../core/useStudioStore';
import { useWorktree } from '../core/useWorktree';
import { ApiKeySidebar } from '../features/common/ApiKeySidebar';
import { SidebarSection } from './lookup/CollapsibleSidebar';
import { DockSectionStack } from './layout/DockSectionStack';
import { TruncatedText } from './common/TruncatedText';
import { AiToolAssistant } from '../features/tools/AiToolAssistant';

interface ChatPanelProps {
  activeExtension: ExtensionManifest;
  onOpenProfiles: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ activeExtension, onOpenProfiles }) => {
  const { yHistory } = useStudioStore();
  const { proposals, activeProposalId, startReview, commitProposal, discardProposal } = useWorktree();
  const history = yHistory?.toArray() || [];

  const proposalList = proposals ? Array.from((proposals as Y.Map<any>).entries()).map(([id, data]: [string, any]) => ({ id, ...data })) : [];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-studio-panel">
      <DockSectionStack
        key={activeExtension.id}
        storageKey={`studio-activity-sections:${activeExtension.id}`}
        className="min-h-0 flex-1 overflow-y-auto bg-studio-background p-2 custom-scrollbar"
      >
        {activeExtension.id !== 'api-keys' && (
          <SidebarSection id="api-profiles" title="API Profiles" icon={Key}>
            <ApiKeySidebar onOpenProfiles={onOpenProfiles} />
          </SidebarSection>
        )}

        <SidebarSection id="ai-tool-assistant" title="AI Agent Tools" icon={Bot}>
          <AiToolAssistant />
        </SidebarSection>

        {proposalList.length > 0 && (
          <SidebarSection id="active-proposals" title="Active Proposals" icon={FlaskConical}>
            <div className="flex flex-col gap-2">
              {proposalList.map((proposal) => (
                <div
                  key={proposal.id}
                  className={`bg-studio-panel-darker border rounded p-2 flex flex-col gap-2 transition-all ${activeProposalId === proposal.id ? 'border-studio-accent-orange ring-1 ring-studio-accent-orange/30 shadow-lg' : 'border-studio-border/50 hover:border-studio-accent-orange/50'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-studio-accent-orange uppercase">{proposal.type}</span>
                    <span className="text-[8px] text-studio-text-dim">{new Date(proposal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {proposal.data && <img src={`data:image/png;base64,${proposal.data}`} className="w-full h-12 object-cover rounded border border-white/5" alt="" />}

                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={() => commitProposal(proposal.id)}
                      className="flex-1 bg-green-900/40 hover:bg-green-800/60 text-green-200 border border-green-800/50 py-1 rounded flex items-center justify-center gap-1 transition-colors"
                      title="Accept & Commit"
                    >
                      <Check size={10} />
                      <span className="text-[8px] font-bold">ACCEPT</span>
                    </button>
                    <button
                      onClick={() => discardProposal(proposal.id)}
                      className="flex-1 bg-red-900/40 hover:bg-red-800/60 text-red-200 border border-red-800/50 py-1 rounded flex items-center justify-center gap-1 transition-colors"
                      title="Reject & Discard"
                    >
                      <X size={10} />
                      <span className="text-[8px] font-bold">REJECT</span>
                    </button>
                    <button
                      onClick={() => startReview(proposal.id)}
                      className="bg-studio-accent-orange/40 hover:bg-studio-accent-orange/60 text-white border border-studio-accent-orange/50 px-2 py-1 rounded flex items-center justify-center transition-colors"
                      title="Review on Canvas"
                    >
                      <History size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SidebarSection>
        )}

        <SidebarSection id="project-history" title="Project History" icon={History}>
          <div className="flex flex-col gap-2">
            {history.slice().reverse().map((item: any, i) => (
              <div key={i} className="bg-studio-panel-darker border border-studio-border/50 rounded p-2 flex flex-col gap-2 hover:border-studio-accent/50 transition-colors group">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-studio-accent uppercase">{item.type}</span>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity"><RotateCcw size={10} className="text-studio-text-dim hover:text-white" /></button>
                </div>
                {item.preview && <img src={item.preview} className="w-full h-12 object-cover rounded border border-white/5" alt="" />}
                <TruncatedText text={`"${item.label}"`} className="text-[9px] italic text-studio-text-dim" />
              </div>
            ))}
            {history.length === 0 && <div className="text-[9px] text-center text-studio-text-dim py-4 italic">No history yet</div>}
          </div>
        </SidebarSection>
      </DockSectionStack>

      <div className="h-20 border-t border-studio-border p-3 bg-studio-header flex flex-col gap-1 overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-2 text-[9px] font-mono">
          <Terminal size={10} className="text-blue-400" />
          <span className="text-studio-text-dim uppercase tracking-tighter">System initialized</span>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
