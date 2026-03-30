import { createLazyFileRoute } from "@tanstack/react-router";
import React from "react";
import t from "@src/shared/config";

const LAST_PROJECT_STORAGE_KEY = "electron-projects:last-opened-project";

export const Route = createLazyFileRoute("/" as never)({
  component: Index,
});

function Index() {
  const utils = t.useUtils();
  const { data: projects = [] } = t.project.getAll.useQuery();
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState("");
  const [createError, setCreateError] = React.useState("");

  const { mutateAsync: createProject, isLoading: isCreatingProject } =
    t.project.create.useMutation({
      onSuccess: async (newProject) => {
        await utils.project.getAll.invalidate();
        setSelectedProjectId(newProject.id);
        setSelectedFileId(newProject.files[0]?.id ?? "");
        setIsCreateModalOpen(false);
        setNewProjectName("");
        setCreateError("");
      },
    });

  const [selectedProjectId, setSelectedProjectId] = React.useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY) ?? "";
  });
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const [selectedFileId, setSelectedFileId] = React.useState("");

  React.useEffect(() => {
    if (projects.length === 0) {
      return;
    }

    const selectedProjectStillExists = projects.some(
      (project) => project.id === selectedProjectId,
    );

    if (!selectedProjectStillExists) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  React.useEffect(() => {
    if (!selectedProjectId || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      LAST_PROJECT_STORAGE_KEY,
      selectedProjectId,
    );
  }, [selectedProjectId]);

  React.useEffect(() => {
    if (!selectedProject) {
      return;
    }

    setSelectedFileId((currentFileId) => {
      const fileStillExists = selectedProject.files.some(
        (file) => file.id === currentFileId,
      );
      return fileStillExists ? currentFileId : (selectedProject.files[0]?.id ?? "");
    });
  }, [selectedProject]);

  const selectedFile = selectedProject?.files.find(
    (file) => file.id === selectedFileId,
  );

  const handleCreateProject = async () => {
    const trimmedName = newProjectName.trim();

    if (!trimmedName) {
      setCreateError("Enter a project name.");
      return;
    }

    try {
      await createProject({
        name: trimmedName,
      });
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Could not create the project.",
      );
    }
  };

  return (
    <>
      <div className="project-browser">
        <aside className="project-sidebar">
          <div className="panel-heading">
            <span className="eyebrow">Projects</span>
            <div className="sidebar-heading">
              <h1>Workspace</h1>
              <button
                type="button"
                className="add-project-button"
                onClick={() => setIsCreateModalOpen(true)}
                disabled={isCreatingProject}
                aria-label="Create new project"
              >
                +
              </button>
            </div>
            <p>Kies een project om de bijbehorende bestanden te bekijken.</p>
          </div>

          <div className="project-list">
            {projects.map((project) => {
              const isActive = project.id === selectedProject?.id;

              return (
                <button
                  key={project.id}
                  type="button"
                  className={`project-card ${isActive ? "active" : ""}`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <span className="project-card__name">{project.name}</span>
                  <span className="project-card__meta">{project.location}</span>
                  <span className="project-card__count">
                    {project.files.length} bestanden
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="project-content">
          {selectedProject ? (
            <>
              <header className="project-header">
                <div>
                  <span className="eyebrow">Selected project</span>
                  <h2>{selectedProject.name}</h2>
                  <p>{selectedProject.description}</p>
                </div>
                <div className="project-badge">{selectedProject.location}</div>
              </header>

              <div className="content-grid">
                <div className="file-panel">
                  <div className="panel-heading">
                    <span className="eyebrow">Files</span>
                    <h3>Bestandsoverzicht</h3>
                  </div>

                  <div className="file-list">
                    {selectedProject.files.map((file) => {
                      const isActive = file.id === selectedFile?.id;

                      return (
                        <button
                          key={file.id}
                          type="button"
                          className={`file-row ${isActive ? "active" : ""}`}
                          onClick={() => setSelectedFileId(file.id)}
                        >
                          <span className="file-row__name">{file.name}</span>
                          <span className="file-row__meta">
                            {file.path} | {file.size}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="details-panel">
                  {selectedFile ? (
                    <>
                      <div className="panel-heading">
                        <span className="eyebrow">Preview</span>
                        <h3>{selectedFile.name}</h3>
                        <p>{selectedFile.path}</p>
                      </div>

                      <div className="file-stats">
                        <div className="stat-card">
                          <span className="stat-card__label">Type</span>
                          <strong>{selectedFile.type}</strong>
                        </div>
                        <div className="stat-card">
                          <span className="stat-card__label">Size</span>
                          <strong>{selectedFile.size}</strong>
                        </div>
                        <div className="stat-card">
                          <span className="stat-card__label">Updated</span>
                          <strong>{selectedFile.updatedAt}</strong>
                        </div>
                      </div>

                      <pre className="file-preview">
                        <code>{selectedFile.content}</code>
                      </pre>
                    </>
                  ) : (
                    <div className="empty-state">
                      <h3>Geen bestand geselecteerd</h3>
                      <p>Kies links een bestand om details te zien.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h2>Geen projecten geladen</h2>
              <p>Voeg projecten toe via de `+` knop of in `src/web/data/projects.json`.</p>
            </div>
          )}
        </section>
      </div>

      {isCreateModalOpen ? (
        <div className="modal-overlay" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-title"
          >
            <div className="panel-heading">
              <span className="eyebrow">New project</span>
              <h2 id="new-project-title">Create project</h2>
              <p>Enter a name and save it directly to the JSON project file.</p>
            </div>

            <label className="modal-label" htmlFor="new-project-name">
              Project name
            </label>
            <input
              id="new-project-name"
              className="modal-input"
              value={newProjectName}
              onChange={(event) => {
                setNewProjectName(event.target.value);
                if (createError) {
                  setCreateError("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleCreateProject();
                }
              }}
              placeholder="My new project"
              autoFocus
            />

            {createError ? <p className="modal-error">{createError}</p> : null}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setNewProjectName("");
                  setCreateError("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleCreateProject()}
                disabled={isCreatingProject}
              >
                {isCreatingProject ? "Saving..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
