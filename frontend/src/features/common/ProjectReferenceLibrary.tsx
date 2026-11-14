import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FolderPlus, Image as ImageIcon, Music, Trash2, Upload } from 'lucide-react';
import { projectsApi } from '../../services/api';
import type { ProjectReference, ReferenceRole, StudioProject } from '../../types/api';

const ACTIVE_PROJECT_KEY = 'artifex.activeProjectId';

interface ProjectReferenceLibraryProps {
  onUseImageReference?: (reference: ProjectReference) => Promise<boolean>;
}

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
};

const isImageFile = (file: File) =>
  file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);

export const ProjectReferenceLibrary: React.FC<ProjectReferenceLibraryProps> = ({
  onUseImageReference,
}) => {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [references, setReferences] = useState<ProjectReference[]>([]);
  const [projectName, setProjectName] = useState('');
  const [role, setRole] = useState<ReferenceRole>('style');
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => window.localStorage.getItem(ACTIVE_PROJECT_KEY) || '',
  );
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    projectsApi.list()
      .then(({ projects: loadedProjects }) => {
        if (!active) return;
        setProjects(loadedProjects);
        setSelectedProjectId(current =>
          current && loadedProjects.some(project => project.id === current) ? current : '',
        );
      })
      .catch(error => {
        if (active) setStatus(`Could not load projects: ${getErrorMessage(error)}`);
      })
      .finally(() => {
        if (active) setIsLoadingProjects(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isLoadingProjects) return;
    if (selectedProjectId) {
      window.localStorage.setItem(ACTIVE_PROJECT_KEY, selectedProjectId);
    } else {
      window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }

    if (!selectedProjectId) {
      setReferences([]);
      setIsLoadingReferences(false);
      return;
    }

    let active = true;
    setReferences([]);
    setIsLoadingReferences(true);
    projectsApi.listReferences(selectedProjectId)
      .then(({ references: loadedReferences }) => {
        if (active) setReferences(loadedReferences);
      })
      .catch(error => {
        if (active) setStatus(`Could not load references: ${getErrorMessage(error)}`);
      })
      .finally(() => {
        if (active) setIsLoadingReferences(false);
      });

    return () => {
      active = false;
    };
  }, [selectedProjectId, isLoadingProjects]);

  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    setIsBusy(true);
    setStatus('');
    try {
      const project = await projectsApi.create({
        name,
        description: '',
        tags: [],
        config: {},
      });
      setProjects(current => [project, ...current]);
      setSelectedProjectId(project.id);
      setProjectName('');
    } catch (error) {
      setStatus(`Could not create project: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const uploadReference = async (file: File) => {
    if (!selectedProjectId) return;
    setIsBusy(true);
    setStatus('');
    try {
      const reference = await projectsApi.uploadReference(
        selectedProjectId,
        file,
        isImageFile(file) ? role : undefined,
      );
      setReferences(current => [reference, ...current]);
      setStatus(`Added ${reference.original_filename}.`);
    } catch (error) {
      setStatus(`Upload failed: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const deleteReference = async (reference: ProjectReference) => {
    if (!selectedProjectId) return;
    if (!window.confirm(`Delete "${reference.original_filename}" from this project?`)) return;
    setIsBusy(true);
    setStatus('');
    try {
      await projectsApi.deleteReference(selectedProjectId, reference.id);
      setReferences(current => current.filter(item => item.id !== reference.id));
      setStatus(`Deleted ${reference.original_filename}.`);
    } catch (error) {
      setStatus(`Could not delete reference: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const exportProject = async () => {
    if (!selectedProjectId) return;
    setIsBusy(true);
    setStatus('');
    try {
      const bundle = await projectsApi.exportBundle(selectedProjectId);
      const url = URL.createObjectURL(bundle);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `artifex-project-${selectedProjectId}.zip`;
        document.body.append(link);
        try {
          link.click();
        } finally {
          link.remove();
        }
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setStatus('Project bundle exported.');
    } catch (error) {
      setStatus(`Could not export project: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const importProject = async (file: File) => {
    setIsBusy(true);
    setStatus('');
    try {
      const project = await projectsApi.importBundle(file);
      setProjects(current => [project, ...current]);
      setSelectedProjectId(project.id);
      setStatus(`Imported "${project.name}".`);
    } catch (error) {
      setStatus(`Could not import project: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleUseImageReference = async (reference: ProjectReference) => {
    if (!onUseImageReference) return;
    setIsBusy(true);
    setStatus('');
    try {
      const used = await onUseImageReference(reference);
      setStatus(used ? `Opened ${reference.original_filename} on the canvas.` : 'Open cancelled.');
    } catch (error) {
      setStatus(`Could not open image reference: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const referenceContentUrl = (reference: ProjectReference) =>
    projectsApi.referenceContentUrl(selectedProjectId, reference.id);

  return (
    <div className="flex flex-col gap-2">
      {isLoadingProjects ? (
        <p className="text-[10px] text-studio-text-dim">Loading projects...</p>
      ) : (
        <>
          <div className="flex gap-2">
            <label className="flex flex-1 items-center justify-center gap-1 rounded border border-dashed border-studio-border py-1.5 text-[9px] text-studio-text-dim hover:border-studio-accent hover:text-white cursor-pointer">
              <Upload size={11} />
              Import project
              <input
                type="file"
                accept=".zip,application/zip"
                disabled={isBusy}
                className="sr-only"
                onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void importProject(file);
                }}
              />
            </label>
            {selectedProjectId && (
              <button
                type="button"
                onClick={() => void exportProject()}
                disabled={isBusy}
                className="flex-1 rounded border border-studio-border py-1.5 text-[9px] text-studio-text-dim hover:text-white disabled:opacity-40"
              >
                Export bundle
              </button>
            )}
          </div>
          <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-studio-text-dim">
            Active local project
            <select
              value={selectedProjectId}
              onChange={event => {
                setSelectedProjectId(event.target.value);
                setStatus('');
              }}
              disabled={isBusy}
              className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
            >
              <option value="">Select a project</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>

          {!selectedProjectId && (
            <div className="flex gap-1">
              <input
                value={projectName}
                onChange={event => setProjectName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void createProject();
                }}
                aria-label="New project name"
                placeholder="New project name"
                maxLength={200}
                disabled={isBusy}
                className="min-w-0 flex-1 bg-black/40 border border-studio-border rounded px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => void createProject()}
                disabled={!projectName.trim() || isBusy}
                title="Create project"
                className="rounded border border-studio-border px-2 text-studio-text-dim hover:text-white disabled:opacity-40"
              >
                <FolderPlus size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {selectedProjectId && (
        <>
          <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-studio-text-dim">
            Image reference role
            <select
              value={role}
              onChange={event => setRole(event.target.value as ReferenceRole)}
              disabled={isBusy}
              className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
            >
              <option value="style">Style</option>
              <option value="composition">Composition</option>
              <option value="subject">Subject</option>
              <option value="palette">Palette</option>
            </select>
          </label>
          <label className="flex items-center justify-center gap-2 rounded border border-dashed border-studio-border py-2 text-[10px] text-studio-text-dim hover:border-studio-accent hover:text-white cursor-pointer">
            <Upload size={12} />
            {isBusy ? 'Working...' : isLoadingReferences ? 'Loading references...' : 'Add image or audio reference'}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.wav,.flac,.ogg,.aiff,.aif"
              disabled={isBusy || isLoadingReferences}
              className="sr-only"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void uploadReference(file);
              }}
            />
          </label>

          <div className="flex flex-col gap-2">
            {isLoadingReferences ? (
              <p className="text-[10px] text-studio-text-dim">Loading references...</p>
            ) : references.length === 0 ? (
              <p className="text-[10px] text-studio-text-dim">No references in this project.</p>
            ) : references.map(reference => (
              <div key={reference.id} className="rounded border border-studio-border/60 bg-black/20 p-2">
                {reference.media_type === 'image' ? (
                  <img
                    src={referenceContentUrl(reference)}
                    alt={reference.original_filename}
                    className="mb-2 max-h-24 w-full rounded object-contain bg-black/30"
                  />
                ) : (
                  <audio
                    controls
                    preload="none"
                    src={referenceContentUrl(reference)}
                    className="mb-2 w-full"
                  />
                )}
                <div className="flex items-start gap-2">
                  {reference.media_type === 'image'
                    ? <ImageIcon size={12} className="mt-0.5 shrink-0 text-studio-accent" />
                    : <Music size={12} className="mt-0.5 shrink-0 text-studio-accent" />}
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-[10px] text-studio-text">{reference.original_filename}</p>
                    <p className="text-[9px] text-studio-text-dim">
                      {reference.media_format.toUpperCase()}
                      {reference.role ? ` · ${reference.role}` : ''}
                      {reference.media_info.duration_seconds
                        ? ` · ${reference.media_info.duration_seconds.toFixed(1)}s`
                        : ''}
                    </p>
                  </div>
                  {reference.media_type === 'image' && onUseImageReference && (
                    <button
                      type="button"
                      onClick={() => void handleUseImageReference(reference)}
                      disabled={isBusy}
                      className="shrink-0 rounded border border-studio-border px-2 py-1 text-[9px] text-studio-text-dim hover:text-white disabled:opacity-40"
                    >
                      Use on canvas
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteReference(reference)}
                    disabled={isBusy}
                    aria-label={`Delete ${reference.original_filename}`}
                    className="shrink-0 p-1 text-studio-text-dim hover:text-red-400 disabled:opacity-40"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {status && <p role="status" className="break-words text-[9px] text-studio-text-dim">{status}</p>}
      <p className="text-[9px] leading-relaxed text-studio-text-dim">
        Image references can be opened on the canvas; they are not sent to generation automatically. Sharing and training are not enabled.
      </p>
    </div>
  );
};
