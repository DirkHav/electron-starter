import { createLazyFileRoute } from "@tanstack/react-router";
import React from "react";
import t from "@src/shared/config";
import type {
  Project,
  ProjectFile,
  StoredProjectFile,
} from "@src/shared/project-store";

type DisplayFile = {
  id: string;
  name: string;
  path: string;
  type: string;
  size: string;
  updatedAt: string;
  content: string;
  isLinkedFile: boolean;
};

type QuickOpenResult = {
  file: DisplayFile;
  score: number;
};

type GlobalSearchResult = {
  project: Project;
  file?: DisplayFile;
  score: number;
  label: string;
};

const DEFAULT_FILE_GROUP = "General";
const FILE_GROUP_OPTIONS = ["General", "Data", "Reports", "Code"];
const ENABLE_RESTORE = false;
const RESTORE_STORAGE_KEYS = [
  "selectedProjectId",
  "selectedFileId",
  "restoredFilePath",
  "lastSelectedProjectId",
  "lastOpenedFilePaths",
  "activeFilePath",
  "juu:selectedProjectId",
  "juu:selectedFileId",
  "juu:restoredFilePath",
  "juu:lastSelectedProjectId",
];

function clearPersistedRestoreUiState() {
  for (const storageKey of RESTORE_STORAGE_KEYS) {
    window.localStorage.removeItem(storageKey);
  }
}

function EmptyProjectState() {
  return <div className="empty-state" />;
}

function LoadingProjectState() {
  return (
    <div className="empty-state">
      <h2>Project laden</h2>
      <p>Projectgegevens worden geladen.</p>
    </div>
  );
}

function ProjectNotFoundState() {
  return (
    <div className="empty-state">
      <h2>Project niet gevonden</h2>
      <p>Het geselecteerde project kon niet worden geladen.</p>
    </div>
  );
}

function getFileNameFromPath(path: string) {
  const pathParts = path.split(/[/\\]/);
  return pathParts[pathParts.length - 1] || path;
}

function isAbsoluteFilePath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/");
}

function getDroppedFilePaths(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.files)
    .map((file) => (file as File & { path?: string }).path)
    .filter(
      (path): path is string => Boolean(path) && isAbsoluteFilePath(path),
    );
}

function normalizeFile(file: StoredProjectFile): DisplayFile {
  if (typeof file === "string") {
    return {
      id: `linked-${file}`,
      name: getFileNameFromPath(file),
      path: file,
      type: "Linked file",
      size: "-",
      updatedAt: "-",
      content:
        "Bestand is gekoppeld via absoluut pad. De inhoud is niet gekopieerd naar de app.",
      isLinkedFile: true,
    };
  }

  const projectFile = file as ProjectFile;

  return {
    id: projectFile.id,
    name: projectFile.name,
    path: projectFile.path,
    type: projectFile.type,
    size: projectFile.size,
    updatedAt: projectFile.updatedAt,
    content: projectFile.content,
    isLinkedFile: false,
  };
}

function getFuzzyScore(query: string, value: string) {
  if (!query) {
    return 0;
  }

  const normalizedQuery = query.toLowerCase();
  const normalizedValue = value.toLowerCase();
  let queryIndex = 0;
  let score = 0;
  let consecutiveMatches = 0;

  for (
    let valueIndex = 0;
    valueIndex < normalizedValue.length;
    valueIndex += 1
  ) {
    if (normalizedValue[valueIndex] !== normalizedQuery[queryIndex]) {
      consecutiveMatches = 0;
      continue;
    }

    queryIndex += 1;
    consecutiveMatches += 1;
    score += 1 + consecutiveMatches;

    if (valueIndex === 0) {
      score += 3;
    }

    if (queryIndex === normalizedQuery.length) {
      return score;
    }
  }

  return -1;
}

function getInitialOpenTabId(
  project: Project | undefined,
  displayedFiles: DisplayFile[],
) {
  if (!project) {
    return "";
  }

  const activeFile = displayedFiles.find(
    (file) => file.path === project.activeFilePath,
  );

  if (activeFile) {
    return activeFile.id;
  }

  for (const filePath of project.lastOpenedFilePaths ?? []) {
    const matchingFile = displayedFiles.find((file) => file.path === filePath);

    if (matchingFile) {
      return matchingFile.id;
    }
  }

  return displayedFiles[0]?.id ?? "";
}

function getFileGroup(project: Project | undefined, filePath: string) {
  return project?.fileGroups?.[filePath] || DEFAULT_FILE_GROUP;
}

export const Route = createLazyFileRoute("/" as never)({
  component: Index,
});

function Index() {
  const utils = t.useUtils();
  const { data: projects, isLoading } = t.project.getAll.useQuery(undefined, {
    placeholderData: (previousData) => previousData,
  });
  const projectList = projects ?? [];
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [projectPendingClose, setProjectPendingClose] =
    React.useState<Project | null>(null);
  const [projectPendingDelete, setProjectPendingDelete] =
    React.useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = React.useState("");
  const [createError, setCreateError] = React.useState("");
  const [isDragOverFiles, setIsDragOverFiles] = React.useState(false);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = React.useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = React.useState("");
  const [quickOpenActiveIndex, setQuickOpenActiveIndex] = React.useState(0);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = React.useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = React.useState("");
  const [globalSearchActiveIndex, setGlobalSearchActiveIndex] =
    React.useState(0);
  const [restoredFilePath, setRestoredFilePath] = React.useState("");
  const [collapsedGroups, setCollapsedGroups] = React.useState<
    Record<string, boolean>
  >({});
  const hasRestoredWorkspaceRef = React.useRef(false);
  const quickOpenInputRef = React.useRef<HTMLInputElement | null>(null);
  const globalSearchInputRef = React.useRef<HTMLInputElement | null>(null);

  const { mutateAsync: createProject, isLoading: isCreatingProject } =
    t.project.create.useMutation({
      onSuccess: async (newProject) => {
        await utils.project.getAll.invalidate();
        setSelectedProjectId(newProject.id);
        setSelectedFileId("");
        setIsCreateModalOpen(false);
        setNewProjectName("");
        setCreateError("");
      },
    });

  const { mutateAsync: addFiles, isLoading: isAddingFiles } =
    t.project.addFiles.useMutation({
      onSuccess: async () => {
        await utils.project.getAll.invalidate();
      },
    });
  const { mutateAsync: selectProject } = t.project.selectProject.useMutation({
    onSuccess: async () => {
      await utils.project.getAll.invalidate();
    },
  });
  const { mutateAsync: removeFile, isLoading: isRemovingFile } =
    t.project.removeFile.useMutation({
      onSuccess: async () => {
        await utils.project.getAll.invalidate();
      },
    });
  const { mutateAsync: deleteProject, isLoading: isDeletingProject } =
    t.project.delete.useMutation({
      onSuccess: async () => {
        await utils.project.getAll.invalidate();
      },
    });
  const { mutateAsync: moveFileToGroup, isLoading: isMovingFileToGroup } =
    t.project.moveFileToGroup.useMutation({
      onSuccess: async () => {
        await utils.project.getAll.invalidate();
      },
    });
  const { mutateAsync: closeFileTab, isLoading: isClosingTab } =
    t.project.closeFileTab.useMutation({
      onSuccess: async () => {
        await utils.project.getAll.invalidate();
      },
    });
  const { mutateAsync: activateFileTab } =
    t.project.activateFileTab.useMutation({
      onSuccess: async () => {
        await utils.project.getAll.invalidate();
      },
    });
  const { mutateAsync: openProject, isLoading: isOpeningProject } =
    t.project.openProject.useMutation({
      onSuccess: async () => {
        await utils.project.getAll.invalidate();
      },
    });
  const { mutateAsync: openFile, isLoading: isOpeningFile } =
    t.project.openFile.useMutation();
  const { mutateAsync: revealFile, isLoading: isRevealingFile } =
    t.project.revealFile.useMutation();

  const [selectedProjectId, setSelectedProjectId] = React.useState<
    string | null
  >(ENABLE_RESTORE ? "" : null);
  const selectedProject = React.useMemo(() => {
    if (!selectedProjectId) {
      return null;
    }

    return (
      projectList.find((project) => project.id === selectedProjectId) ?? null
    );
  }, [projectList, selectedProjectId]);
  const [selectedFileId, setSelectedFileId] = React.useState("");

  React.useEffect(() => {
    if (!ENABLE_RESTORE || isLoading || !selectedProjectId) {
      return;
    }

    const selectedProjectStillExists = projectList.some(
      (project) => project.id === selectedProjectId,
    );

    if (!selectedProjectStillExists) {
      setSelectedProjectId(null);
      setSelectedFileId("");
    }
  }, [isLoading, projectList, selectedProjectId]);

  React.useEffect(() => {
    if (ENABLE_RESTORE || hasRestoredWorkspaceRef.current) {
      return;
    }

    clearPersistedRestoreUiState();
    hasRestoredWorkspaceRef.current = true;
  }, []);

  React.useEffect(() => {
    if (!selectedProject) {
      return;
    }

    const normalizedFiles = (selectedProject.files ?? []).map((file) =>
      normalizeFile(file),
    );

    setSelectedFileId((currentFileId) => {
      const initialTabId = getInitialOpenTabId(
        selectedProject,
        normalizedFiles,
      );

      if (restoredFilePath) {
        const restoredFile = normalizedFiles.find(
          (file) => file.path === restoredFilePath,
        );

        if (restoredFile) {
          return restoredFile.id;
        }
      }

      const fileStillExists = normalizedFiles.some(
        (file) => file.id === currentFileId,
      );
      return fileStillExists ? currentFileId : initialTabId;
    });
  }, [selectedProject, restoredFilePath]);

  React.useEffect(() => {
    if (!restoredFilePath || !selectedProject) {
      return;
    }

    const hasRestoredFile = (selectedProject.files ?? []).some((file) => {
      const normalizedFile = normalizeFile(file);
      return normalizedFile.path === restoredFilePath;
    });

    if (hasRestoredFile) {
      setRestoredFilePath("");
    }
  }, [restoredFilePath, selectedProject]);

  React.useEffect(() => {
    if (!isQuickOpenOpen) {
      return;
    }

    setQuickOpenActiveIndex(0);
  }, [isQuickOpenOpen]);

  React.useEffect(() => {
    if (!isQuickOpenOpen) {
      return;
    }

    quickOpenInputRef.current?.focus();
  }, [isQuickOpenOpen]);

  React.useEffect(() => {
    if (!isGlobalSearchOpen) {
      return;
    }

    setGlobalSearchActiveIndex(0);
  }, [isGlobalSearchOpen]);

  React.useEffect(() => {
    if (!isGlobalSearchOpen) {
      return;
    }

    globalSearchInputRef.current?.focus();
  }, [isGlobalSearchOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "r"
      ) {
        event.preventDefault();
        clearPersistedRestoreUiState();
        setSelectedProjectId(null);
        setSelectedFileId("");
        setRestoredFilePath("");
        setIsQuickOpenOpen(false);
        setIsGlobalSearchOpen(false);
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        setIsGlobalSearchOpen(true);
        setGlobalSearchQuery("");
        setIsQuickOpenOpen(false);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setIsQuickOpenOpen(true);
        setQuickOpenQuery("");
        setIsGlobalSearchOpen(false);
        return;
      }

      if (event.key === "Escape") {
        setIsQuickOpenOpen(false);
        setIsGlobalSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const displayedFiles = (selectedProject?.files ?? []).map((file) =>
    normalizeFile(file),
  );

  const groupedFiles = React.useMemo(() => {
    const groups = new Map<string, DisplayFile[]>();

    for (const file of displayedFiles) {
      const groupName = getFileGroup(selectedProject, file.path);
      const existingGroup = groups.get(groupName) ?? [];
      existingGroup.push(file);
      groups.set(groupName, existingGroup);
    }

    return Array.from(groups.entries())
      .sort(([leftName], [rightName]) => {
        if (leftName === DEFAULT_FILE_GROUP) {
          return -1;
        }

        if (rightName === DEFAULT_FILE_GROUP) {
          return 1;
        }

        return leftName.localeCompare(rightName);
      })
      .map(([groupName, files]) => ({
        groupName,
        files,
      }));
  }, [displayedFiles, selectedProject]);

  const quickOpenResults = React.useMemo<QuickOpenResult[]>(() => {
    const trimmedQuery = quickOpenQuery.trim();

    if (!trimmedQuery) {
      return displayedFiles.slice(0, 12).map((file, index) => ({
        file,
        score: 1000 - index,
      }));
    }

    return displayedFiles
      .map((file) => ({
        file,
        score: getFuzzyScore(trimmedQuery, file.name),
      }))
      .filter((result) => result.score >= 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 12);
  }, [displayedFiles, quickOpenQuery]);

  const globalSearchResults = React.useMemo<GlobalSearchResult[]>(() => {
    const trimmedQuery = globalSearchQuery.trim();

    if (!trimmedQuery) {
      return projectList.slice(0, 12).map((project, index) => ({
        project,
        score: 10_000 - index,
        label: project.name,
      }));
    }

    return projectList
      .flatMap((project) => {
        const results: GlobalSearchResult[] = [];
        const projectScore = getFuzzyScore(trimmedQuery, project.name);

        if (projectScore >= 0) {
          const projectFiles = (project.files ?? []).map((file) =>
            normalizeFile(file),
          );
          const fallbackFile =
            projectFiles.find((file) => file.path === project.activeFilePath) ??
            projectFiles[0];

          results.push({
            project,
            file: fallbackFile,
            score: projectScore + 50,
            label: project.name,
          });
        }

        for (const file of (project.files ?? []).map((storedFile) =>
          normalizeFile(storedFile),
        )) {
          const fileScore = getFuzzyScore(trimmedQuery, file.name);

          if (fileScore >= 0) {
            results.push({
              project,
              file,
              score: fileScore,
              label: file.name,
            });
          }
        }

        return results;
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 24);
  }, [globalSearchQuery, projectList]);

  const groupedGlobalSearchResults = React.useMemo(() => {
    const groups = new Map<
      string,
      { project: Project; results: GlobalSearchResult[] }
    >();

    for (const result of globalSearchResults) {
      const existingGroup = groups.get(result.project.id);

      if (existingGroup) {
        existingGroup.results.push(result);
        continue;
      }

      groups.set(result.project.id, {
        project: result.project,
        results: [result],
      });
    }

    return Array.from(groups.values());
  }, [globalSearchResults]);

  const openTabs = displayedFiles.filter((file) =>
    selectedProject?.lastOpenedFilePaths?.includes(file.path),
  );

  const selectedFile =
    openTabs.find((file) => file.id === selectedFileId) ??
    displayedFiles.find((file) => file.id === selectedFileId);

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
        error instanceof Error
          ? error.message
          : "Could not create the project.",
      );
    }
  };

  const handleAddFiles = async () => {
    if (!selectedProject?.id) {
      window.alert("Selecteer eerst een project.");
      return;
    }

    try {
      await addFiles({ projectId: selectedProject.id });
    } catch (error) {
      console.error("Kon geen bestanden toevoegen", error);
      window.alert("Kon geen bestanden toevoegen. Check console voor details.");
    }
  };

  const handleSelectProject = async (projectId: string) => {
    setSelectedProjectId(projectId);

    try {
      await selectProject({ projectId });
    } catch (error) {
      console.error("Kon projectrecency niet bijwerken", error);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectPendingDelete) {
      return;
    }

    const deletedProjectId = projectPendingDelete.id;
    const remainingProjects = projectList.filter(
      (project) => project.id !== deletedProjectId,
    );
    const nextSelectedProjectId =
      selectedProjectId === deletedProjectId
        ? remainingProjects[0]?.id ?? null
        : selectedProjectId;

    try {
      await deleteProject({ id: deletedProjectId });
      setSelectedProjectId(nextSelectedProjectId);
      if (!nextSelectedProjectId) {
        setSelectedFileId("");
      }
      setProjectPendingDelete(null);
    } catch (error) {
      console.error("Kon project niet verwijderen", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Kon het project niet verwijderen.",
      );
    }
  };

  const handleDroppedFiles = async (filePaths: string[]) => {
    if (!selectedProject?.id) {
      window.alert("Selecteer eerst een project.");
      return;
    }

    if (filePaths.length === 0) {
      return;
    }

    try {
      await addFiles({
        projectId: selectedProject.id,
        filePaths,
      });
    } catch (error) {
      console.error("Kon gesleepte bestanden niet toevoegen", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Kon de gesleepte bestanden niet toevoegen.",
      );
    }
  };

  const handleOpenProject = async () => {
    if (!selectedProject?.id) {
      window.alert("Selecteer eerst een project.");
      return;
    }

    try {
      const result = await openProject({ projectId: selectedProject.id });

      if (result.openedCount === 0) {
        window.alert(
          "Geen geldige absolute bestandspaden gevonden om te openen.",
        );
      }
    } catch (error) {
      console.error("Kon projectbestanden niet openen", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Kon de projectbestanden niet openen.",
      );
    }
  };

  const handleFileSelect = (file: DisplayFile) => {
    setSelectedFileId(file.id);
  };

  const handleFileOpen = async (
    file: DisplayFile,
    projectOverride?: Project,
  ) => {
    const targetProject = projectOverride ?? selectedProject;
    setSelectedFileId(file.id);

    if (!isAbsoluteFilePath(file.path)) {
      return;
    }

    try {
      await openFile({
        path: file.path,
        projectId: targetProject?.id,
      });
    } catch (error) {
      console.error("Kon bestand niet openen", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Kon het geselecteerde bestand niet openen.",
      );
    }
  };

  const handleCloseProject = () => {
    if (!selectedProject) {
      return;
    }

    setProjectPendingClose(selectedProject);
  };

  const closeSelectedProject = () => {
    setSelectedProjectId(null);
    setSelectedFileId("");
    setProjectPendingClose(null);
  };

  const handleConfirmCloseProject = async (shouldSave: boolean) => {
    if (!projectPendingClose) {
      return;
    }

    if (shouldSave) {
      try {
        await selectProject({ projectId: projectPendingClose.id });
      } catch (error) {
        console.error("Kon projectstatus niet opslaan voor sluiten", error);
        window.alert(
          error instanceof Error
            ? error.message
            : "Kon het project niet opslaan voor sluiten.",
        );
        return;
      }
    }

    closeSelectedProject();
  };

  const handleOpenFileButtonClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
    file: DisplayFile,
  ) => {
    event.stopPropagation();
    await handleFileOpen(file);
  };

  const handleQuickOpenSelect = async (file: DisplayFile) => {
    await handleFileOpen(file);
    setIsQuickOpenOpen(false);
    setQuickOpenQuery("");
  };

  const handleGlobalSearchSelect = async (result: GlobalSearchResult) => {
    setSelectedProjectId(result.project.id);

    try {
      await selectProject({ projectId: result.project.id });
    } catch (error) {
      console.error("Kon project niet selecteren vanuit global search", error);
    }

    if (result.file) {
      await handleFileOpen(result.file, result.project);
    }

    setIsGlobalSearchOpen(false);
    setGlobalSearchQuery("");
  };

  const handleTabClick = async (file: DisplayFile) => {
    setSelectedFileId(file.id);

    if (!selectedProject?.id) {
      return;
    }

    try {
      await activateFileTab({
        projectId: selectedProject.id,
        filePath: file.path,
      });
    } catch (error) {
      console.error("Kon actieve tab niet bijwerken", error);
    }
  };

  const handleCloseTab = async (
    event: React.MouseEvent<HTMLButtonElement>,
    file: DisplayFile,
  ) => {
    event.stopPropagation();

    if (!selectedProject?.id) {
      return;
    }

    const remainingTabs = openTabs.filter((tab) => tab.id !== file.id);

    if (selectedFileId === file.id) {
      setSelectedFileId(remainingTabs[0]?.id ?? "");
    }

    try {
      await closeFileTab({
        projectId: selectedProject.id,
        filePath: file.path,
      });
    } catch (error) {
      console.error("Kon tab niet sluiten", error);
      window.alert(
        error instanceof Error ? error.message : "Kon tab niet sluiten.",
      );
    }
  };

  const handleRemoveFile = async (
    event: React.MouseEvent<HTMLButtonElement>,
    file: DisplayFile,
  ) => {
    event.stopPropagation();

    if (!selectedProject?.id) {
      return;
    }

    const shouldRemove = window.confirm(
      "Are you sure you want to remove this file from the project?",
    );

    if (!shouldRemove) {
      return;
    }

    const previousProjects = utils.project.getAll.getData();
    const nextSelectedFileId =
      selectedFileId === file.id
        ? openTabs.filter((tab) => tab.id !== file.id)[0]?.id ?? ""
        : selectedFileId;

    setSelectedFileId(nextSelectedFileId);
    utils.project.getAll.setData(undefined, (currentProjects) => {
      if (!currentProjects) {
        return currentProjects;
      }

      return currentProjects.map((project) => {
        if (project.id !== selectedProject.id) {
          return project;
        }

        const nextFiles = project.files.filter((projectFile) => {
          const projectFilePath =
            typeof projectFile === "string" ? projectFile : projectFile.path;
          return projectFilePath !== file.path;
        });
        const nextOpenedFilePaths = (project.lastOpenedFilePaths ?? []).filter(
          (filePath) => filePath !== file.path,
        );
        const nextFileGroups = project.fileGroups
          ? Object.fromEntries(
              Object.entries(project.fileGroups).filter(
                ([filePath]) => filePath !== file.path,
              ),
            )
          : undefined;

        return {
          ...project,
          files: nextFiles,
          fileGroups:
            Object.keys(nextFileGroups ?? {}).length > 0
              ? nextFileGroups
              : undefined,
          lastOpenedFilePaths:
            nextOpenedFilePaths.length > 0 ? nextOpenedFilePaths : undefined,
          activeFilePath:
            project.activeFilePath === file.path
              ? nextOpenedFilePaths[0]
              : project.activeFilePath,
        };
      });
    });

    try {
      await removeFile({
        projectId: selectedProject.id,
        filePath: file.path,
      });
    } catch (error) {
      utils.project.getAll.setData(undefined, previousProjects);
      setSelectedFileId(selectedFileId);
      console.error("Kon bestand niet verwijderen uit project", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Kon het bestand niet uit het project verwijderen.",
      );
    }
  };

  const handleRevealFile = async (
    event: React.MouseEvent<HTMLButtonElement>,
    file: DisplayFile,
  ) => {
    event.stopPropagation();

    if (!isAbsoluteFilePath(file.path)) {
      return;
    }

    try {
      await revealFile({ filePath: file.path });
    } catch (error) {
      console.error("Kon bestand niet tonen in map", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Kon het bestand niet tonen in de map.",
      );
    }
  };

  const handleMoveFileToGroup = async (
    event: React.ChangeEvent<HTMLSelectElement>,
    file: DisplayFile,
  ) => {
    if (!selectedProject?.id) {
      return;
    }

    try {
      await moveFileToGroup({
        projectId: selectedProject.id,
        filePath: file.path,
        groupName: event.target.value,
      });
    } catch (error) {
      console.error("Kon bestand niet naar groep verplaatsen", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Kon het bestand niet naar een andere groep verplaatsen.",
      );
    }
  };

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((currentGroups) => ({
      ...currentGroups,
      [groupName]: !currentGroups[groupName],
    }));
  };

  const handleFileListDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOverFiles(true);
  };

  const handleFileListDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsDragOverFiles(false);
  };

  const handleFileListDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOverFiles(false);

    const filePaths = getDroppedFilePaths(event.dataTransfer);
    await handleDroppedFiles(filePaths);
  };

  const handleQuickOpenKeyDown = async (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (quickOpenResults.length === 0) {
        return;
      }

      setQuickOpenActiveIndex((currentIndex) =>
        Math.min(currentIndex + 1, quickOpenResults.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (quickOpenResults.length === 0) {
        return;
      }

      setQuickOpenActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activeResult = quickOpenResults[quickOpenActiveIndex];

      if (activeResult) {
        await handleQuickOpenSelect(activeResult.file);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsQuickOpenOpen(false);
      setQuickOpenQuery("");
    }
  };

  const handleGlobalSearchKeyDown = async (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (globalSearchResults.length === 0) {
        return;
      }

      setGlobalSearchActiveIndex((currentIndex) =>
        Math.min(currentIndex + 1, globalSearchResults.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (globalSearchResults.length === 0) {
        return;
      }

      setGlobalSearchActiveIndex((currentIndex) =>
        Math.max(currentIndex - 1, 0),
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activeResult = globalSearchResults[globalSearchActiveIndex];

      if (activeResult) {
        await handleGlobalSearchSelect(activeResult);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsGlobalSearchOpen(false);
      setGlobalSearchQuery("");
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
            {projectList.map((project) => {
              const isActive = project.id === selectedProject?.id;

              return (
                <div
                  key={project.id}
                  className={`project-card ${isActive ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="project-card__button"
                    onClick={() => void handleSelectProject(project.id)}
                  >
                    <span className="project-card__name">{project.name}</span>
                    <span className="project-card__meta">
                      {project.location}
                    </span>
                    <span className="project-card__count">
                      {(project.files ?? []).length} bestanden
                    </span>
                  </button>
                  <button
                    type="button"
                    className="project-card__delete"
                    aria-label={`Delete ${project.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setProjectPendingDelete(project);
                    }}
                    disabled={isDeletingProject}
                  >
                    x
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="project-content">
          {!selectedProjectId ? (
            <EmptyProjectState />
          ) : isLoading ? (
            <LoadingProjectState />
          ) : !selectedProject ? (
            <ProjectNotFoundState />
          ) : (
            <>
              <header className="project-header">
                <div>
                  <span className="eyebrow">Selected project</span>
                  <h2>{selectedProject.name}</h2>
                  <p>{selectedProject.description}</p>
                </div>
                <div>
                  <button
                    type="button"
                    className="secondary-button project-action-button"
                    onClick={() => void handleOpenProject()}
                    disabled={isOpeningProject}
                  >
                    {isOpeningProject ? "Opening..." : "Open Project"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button project-action-button"
                    onClick={handleCloseProject}
                  >
                    Close Project
                  </button>
                  <button
                    type="button"
                    className="primary-button add-file-button"
                    onClick={handleAddFiles}
                    disabled={isAddingFiles}
                  >
                    {isAddingFiles ? "Opening..." : "Add File"}
                  </button>
                  <div className="project-badge">
                    {selectedProject.location}
                  </div>
                </div>
              </header>

              <div className="content-grid">
                <div className="file-panel">
                  <div className="panel-heading">
                    <span className="eyebrow">Files</span>
                    <h3>Bestandsoverzicht</h3>
                  </div>

                  <div
                    className={`file-list ${
                      isDragOverFiles ? "drag-over" : ""
                    }`}
                    onDragOver={handleFileListDragOver}
                    onDragLeave={handleFileListDragLeave}
                    onDrop={(event) => void handleFileListDrop(event)}
                  >
                    {groupedFiles.map(({ groupName, files }) => {
                      const isCollapsed = Boolean(collapsedGroups[groupName]);

                      return (
                        <section key={groupName} className="file-group">
                          <button
                            type="button"
                            className="file-group__header"
                            onClick={() => toggleGroup(groupName)}
                          >
                            <span className="file-group__title">
                              {groupName}
                            </span>
                            <span className="file-group__count">
                              {files.length} bestanden
                            </span>
                          </button>

                          {!isCollapsed
                            ? files.map((file) => {
                                const isActive = file.id === selectedFile?.id;

                                return (
                                  <div
                                    key={file.id}
                                    className={`file-row ${
                                      isActive ? "active" : ""
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      className="file-row__button"
                                      onClick={() => void handleFileSelect(file)}
                                      onDoubleClick={() =>
                                        void handleFileOpen(file)
                                      }
                                      disabled={
                                        isOpeningFile ||
                                        isRemovingFile ||
                                        isRevealingFile ||
                                        isMovingFileToGroup
                                      }
                                    >
                                      <span className="file-row__content">
                                        <span className="file-row__name">
                                          {file.name}
                                        </span>
                                        <span className="file-row__meta">
                                          {file.path} | {file.size}
                                        </span>
                                      </span>
                                    </button>
                                    <div className="file-row__actions">
                                      <select
                                        className="file-row__group-select"
                                        value={getFileGroup(
                                          selectedProject,
                                          file.path,
                                        )}
                                        onChange={(event) =>
                                          void handleMoveFileToGroup(
                                            event,
                                            file,
                                          )
                                        }
                                        aria-label={`Move ${file.name} to group`}
                                        disabled={isMovingFileToGroup}
                                      >
                                        {FILE_GROUP_OPTIONS.map((option) => (
                                          <option key={option} value={option}>
                                            {option}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        className="file-row__action file-row__action--open"
                                        onClick={(event) =>
                                          void handleOpenFileButtonClick(
                                            event,
                                            file,
                                          )
                                        }
                                        aria-label={`Open ${file.name}`}
                                        disabled={isOpeningFile}
                                      >
                                        open
                                      </button>
                                      <button
                                        type="button"
                                        className="file-row__action file-row__action--reveal"
                                        onClick={(event) =>
                                          void handleRevealFile(event, file)
                                        }
                                        aria-label={`Reveal ${file.name} in folder`}
                                        disabled={isRevealingFile}
                                      >
                                        dir
                                      </button>
                                      <button
                                        type="button"
                                        className="file-row__action file-row__action--remove"
                                        onClick={(event) =>
                                          void handleRemoveFile(event, file)
                                        }
                                        aria-label={`Remove ${file.name} from project`}
                                        disabled={isRemovingFile}
                                      >
                                        x
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            : null}
                        </section>
                      );
                    })}
                  </div>
                </div>

                <div className="details-panel">
                  {selectedFile ? (
                    <>
                      {openTabs.length > 0 ? (
                        <div className="file-tabs">
                          {openTabs.map((file) => {
                            const isActive = file.id === selectedFile?.id;

                            return (
                              <div
                                key={file.id}
                                className={`file-tab ${isActive ? "active" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="file-tab__button"
                                  onClick={() => void handleTabClick(file)}
                                >
                                  <span className="file-tab__label">
                                    {file.name}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="file-tab__close"
                                  onClick={(event) =>
                                    void handleCloseTab(event, file)
                                  }
                                  aria-label={`Close ${file.name} tab`}
                                  disabled={isClosingTab}
                                >
                                  x
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
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
                      {selectedFile.isLinkedFile ? (
                        <p className="linked-file-note">
                          Dit bestand is toegevoegd via de native file picker.
                          In `projects.json` wordt alleen het absolute pad
                          opgeslagen.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="empty-state">
                      {selectedProject ? (
                        <>
                          <h3>Geen tab geopend</h3>
                          <p>Kies links een bestand om een tab te openen.</p>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </>
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

      {projectPendingDelete ? (
        <div className="modal-overlay" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <div className="panel-heading">
              <span className="eyebrow">Delete project</span>
              <h2 id="delete-project-title">
                Are you sure you want to delete this project?
              </h2>
              <p>
                {projectPendingDelete.name} wordt verwijderd uit
                `projects.json`. Bestanden op schijf blijven onaangeraakt.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setProjectPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleDeleteProject()}
                disabled={isDeletingProject}
              >
                {isDeletingProject ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {projectPendingClose ? (
        <div className="modal-overlay" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-project-title"
          >
            <div className="panel-heading">
              <span className="eyebrow">Close project</span>
              <h2 id="close-project-title">
                Do you want to save changes before closing?
              </h2>
              <p>{projectPendingClose.name} wordt gesloten in de interface.</p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setProjectPendingClose(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleConfirmCloseProject(false)}
              >
                No
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleConfirmCloseProject(true)}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isQuickOpenOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => {
            setIsQuickOpenOpen(false);
            setQuickOpenQuery("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              setIsQuickOpenOpen(false);
              setQuickOpenQuery("");
            }
          }}
        >
          <div
            className="modal-card quick-open-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-open-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="panel-heading">
              <span className="eyebrow">Quick Open</span>
              <h2 id="quick-open-title">Open file</h2>
              <p>Zoek bestanden in het geselecteerde project.</p>
            </div>

            <input
              ref={quickOpenInputRef}
              className="modal-input quick-open-input"
              value={quickOpenQuery}
              onChange={(event) => setQuickOpenQuery(event.target.value)}
              onKeyDown={(event) => void handleQuickOpenKeyDown(event)}
              placeholder="Type a filename..."
            />

            <div className="quick-open-results">
              {quickOpenResults.length > 0 ? (
                quickOpenResults.map((result, index) => {
                  const isActive = index === quickOpenActiveIndex;

                  return (
                    <button
                      key={result.file.id}
                      type="button"
                      className={`quick-open-result ${
                        isActive ? "active" : ""
                      }`}
                      onClick={() => void handleQuickOpenSelect(result.file)}
                    >
                      <span className="quick-open-result__name">
                        {result.file.name}
                      </span>
                      <span className="quick-open-result__path">
                        {result.file.path}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="quick-open-empty">
                  Geen bestanden gevonden voor deze zoekopdracht.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isGlobalSearchOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => {
            setIsGlobalSearchOpen(false);
            setGlobalSearchQuery("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              setIsGlobalSearchOpen(false);
              setGlobalSearchQuery("");
            }
          }}
        >
          <div
            className="modal-card quick-open-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-search-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="panel-heading">
              <span className="eyebrow">Global Search</span>
              <h2 id="global-search-title">Search workspace</h2>
              <p>Zoek projectnamen en bestandsnamen over alle projecten.</p>
            </div>

            <input
              ref={globalSearchInputRef}
              className="modal-input quick-open-input"
              value={globalSearchQuery}
              onChange={(event) => setGlobalSearchQuery(event.target.value)}
              onKeyDown={(event) => void handleGlobalSearchKeyDown(event)}
              placeholder="Type a project or filename..."
            />

            <div className="quick-open-results">
              {groupedGlobalSearchResults.length > 0 ? (
                groupedGlobalSearchResults.map((group) => (
                  <div key={group.project.id} className="global-search-group">
                    <div className="global-search-group__header">
                      {group.project.name}
                    </div>
                    {group.results.map((result) => {
                      const resultIndex = globalSearchResults.findIndex(
                        (candidate) =>
                          candidate.project.id === result.project.id &&
                          candidate.label === result.label &&
                          candidate.file?.path === result.file?.path,
                      );
                      const isActive = resultIndex === globalSearchActiveIndex;

                      return (
                        <button
                          key={`${result.project.id}-${
                            result.file?.path ?? result.label
                          }`}
                          type="button"
                          className={`quick-open-result ${
                            isActive ? "active" : ""
                          }`}
                          onClick={() => void handleGlobalSearchSelect(result)}
                        >
                          <span className="quick-open-result__name">
                            {result.file
                              ? result.file.name
                              : result.project.name}
                          </span>
                          <span className="quick-open-result__path">
                            {result.file
                              ? result.file.path
                              : result.project.location}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="quick-open-empty">
                  Geen projecten of bestanden gevonden voor deze zoekopdracht.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
