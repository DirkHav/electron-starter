import { createLazyFileRoute } from "@tanstack/react-router";
import React from "react";
import projectData from "../data/projects.json";

export const Route = createLazyFileRoute("/" as never)({
  component: Index,
});

function Index() {
  const projects = projectData.projects;
  const [selectedProjectId, setSelectedProjectId] = React.useState(
    projects[0]?.id ?? "",
  );
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const [selectedFileId, setSelectedFileId] = React.useState(
    selectedProject?.files[0]?.id ?? "",
  );

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

  return (
    <div className="project-browser">
      <aside className="project-sidebar">
        <div className="panel-heading">
          <span className="eyebrow">Projects</span>
          <h1>Workspace</h1>
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
            <p>Voeg projecten toe aan `src/web/data/projects.json`.</p>
          </div>
        )}
      </section>
    </div>
  );
}
