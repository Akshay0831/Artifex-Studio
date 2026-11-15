import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FolderPlus, Image as ImageIcon, Music, Palette, Trash2, Upload } from 'lucide-react';
import { projectsApi } from '../../services/api';
import { ACTIVE_PROJECT_KEY } from '../../core/projectState';
import type { ProjectReference, ReferenceRole, StudioProject } from '../../types/api';

interface ProjectReferenceLibraryProps {
  onProjectChange: (projectId: string | null) => Promise<void>;
  onBeforeExport: () => Promise<void>;
  onUseImageReference?: (reference: ProjectReference) => Promise<boolean>;
  onExtractImagePalette?: (reference: ProjectReference) => Promise<number>;
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
  onProjectChange,
  onBeforeExport,
  onUseImageReference,
  onExtractImagePalette,
}) => {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [references, setReferences] = useState<ProjectReference[]>([]);
  const [projectName, setProjectName] = useState('');
  const [detailsName, setDetailsName] = useState('');
  const [detailsDescription, setDetailsDescription] = useState('');
  const [detailsTags, setDetailsTags] = useState('');
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [role, setRole] = useState<ReferenceRole>('style');
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => window.localStorage.getItem(ACTIVE_PROJECT_KEY) || '',
  );
  const initialSelectedProjectId = useRef(selectedProjectId);
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
        const preferredProjectId = initialSelectedProjectId.current;
        const nextProjectId =
          preferredProjectId && loadedProjects.some(project => project.id === preferredProjectId)
            ? preferredProjectId
            : '';
        setSelectedProjectId(nextProjectId);
        if (nextProjectId !== preferredProjectId) {
          onProjectChange(nextProjectId || null).catch(error => {
            if (active) {
              setStatus(`Could not load project editor state: ${getErrorMessage(error)}`);
            }
          });
        }
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
  }, [onProjectChange]);

  useEffect(() => {
    const project = projects.find(item => item.id === selectedProjectId);
    if (!project) {
      setIsEditingProject(false);
      return;
    }

    setDetailsName(project.name);
    setDetailsDescription(project.description);
    setDetailsTags(project.tags.join(', '));
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (isLoadingProjects) return;
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

  const selectedProject = projects.find(project => project.id === selectedProjectId);

  const selectProject = async (projectId: string) => {
    setIsBusy(true);
    setStatus('');
    try {
      await onProjectChange(projectId || null);
      setSelectedProjectId(projectId);
    } catch (error) {
      setStatus(`Could not switch projects: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

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
      try {
        await onProjectChange(project.id);
      } catch (error) {
        setStatus(`Project created, but its editor state could not be loaded: ${getErrorMessage(error)}`);
        return;
      }
      setSelectedProjectId(project.id);
      setProjectName('');
    } catch (error) {
      setStatus(`Could not create project: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const updateProjectDetails = async () => {
    if (!selectedProject) return;
    const name = detailsName.trim();
    if (!name) return;

    setIsBusy(true);
    setStatus('');
    try {
      const updatedProject = await projectsApi.update(selectedProject.id, {
        name,
        description: detailsDescription,
        tags: detailsTags.split(',').map(tag => tag.trim()).filter(Boolean),
        config: selectedProject.config,
      });
      setProjects(current =>
        current.map(project => project.id === updatedProject.id ? updatedProject : project),
      );
      setIsEditingProject(false);
      setStatus('Project details saved.');
    } catch (error) {
      setStatus(`Could not save project details: ${getErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const cancelProjectEdit = () => {
    if (!selectedProject) return;
    setDetailsName(selectedProject.name);
    setDetailsDescription(selectedProject.description);
    setDetailsTags(selectedProject.tags.join(', '));
    setIsEditingProject(false);
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
      await onBeforeExport();
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
      try {
        await onProjectChange(project.id);
      } catch (error) {
        setStatus(`Project imported, but its editor state could not be loaded: ${getErrorMessage(error)}`);
        return;
      }
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

  const handleExtractImagePalette = async (reference: ProjectReference) => {
    if (!onExtractImagePalette) return;
    setIsBusy(true);
    setStatus(`Extracting palette from ${reference.original_filename}...`);
    try {
      const colorCount = await onExtractImagePalette(reference);
      setStatus(
        `Applied ${colorCount} colors from ${reference.original_filename}; the image itself was not sent to generation.`,
      );
    } catch (error) {
      setStatus(`Could not extract palette: ${getErrorMessage(error)}`);
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
                disabled={isBusy || isEditingProject}
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
                disabled={isBusy || isEditingProject}
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
                void selectProject(event.target.value);
              }}
              disabled={isBusy || isEditingProject}
              className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
            >
              <option value="">Select a project</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>

          {selectedProject && (
            <div className="rounded border border-studio-border/60 bg-black/20 p-2">
              {isEditingProject ? (
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-studio-text-dim">
                    Project name
                    <input
                      value={detailsName}
                      onChange={event => setDetailsName(event.target.value)}
                      maxLength={200}
                      disabled={isBusy}
                      className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-studio-text-dim">
                    Description
                    <textarea
                      value={detailsDescription}
                      onChange={event => setDetailsDescription(event.target.value)}
                      rows={2}
                      disabled={isBusy}
                      className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-studio-text-dim">
                    Tags (comma-separated)
                    <input
                      value={detailsTags}
                      onChange={event => setDetailsTags(event.target.value)}
                      disabled={isBusy}
                      className="bg-black/40 border border-studio-border rounded px-2 py-1 text-xs normal-case"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void updateProjectDetails()}
                      disabled={!detailsName.trim() || isBusy}
                      className="flex-1 rounded border border-studio-border py-1 text-[9px] text-studio-text-dim hover:text-white disabled:opacity-40"
                    >
                      Save details
                    </button>
                    <button
                      type="button"
                      onClick={cancelProjectEdit}
                      disabled={isBusy}
                      className="flex-1 rounded border border-studio-border py-1 text-[9px] text-studio-text-dim hover:text-white disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[10px] text-studio-text">{selectedProject.name}</p>
                    {selectedProject.description && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-[9px] text-studio-text-dim">
                        {selectedProject.description}
                      </p>
                    )}
                    <p className="mt-1 break-words text-[9px] text-studio-text-dim">
                      {selectedProject.tags.length ? selectedProject.tags.join(', ') : 'No tags'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingProject(true)}
                    disabled={isBusy}
                    className="shrink-0 rounded border border-studio-border px-2 py-1 text-[9px] text-studio-text-dim hover:text-white disabled:opacity-40"
                  >
                    Edit details
                  </button>
                </div>
              )}
            </div>
          )}

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
                  {reference.media_type === 'image' && onExtractImagePalette && (
                    <button
                      type="button"
                      onClick={() => void handleExtractImagePalette(reference)}
                      disabled={isBusy}
                      aria-label={`Extract palette from ${reference.original_filename}`}
                      title="Extract a fixed palette from this image reference"
                      className="shrink-0 flex items-center gap-1 rounded border border-studio-border px-2 py-1 text-[9px] text-studio-text-dim hover:text-white disabled:opacity-40"
                    >
                      <Palette size={11} />
                      Use palette
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
        Reference images can be opened on canvas or used to extract fixed output colors. Their image content is not sent to generation. Sharing and training are not enabled.
      </p>
    </div>
  );
};
