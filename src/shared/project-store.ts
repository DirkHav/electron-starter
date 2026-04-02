import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import defaultProjectData from "../web/data/projects.json";
import { app } from "electron";

export type ProjectFile = {
  id: string;
  name: string;
  path: string;
  type: string;
  size: string;
  updatedAt: string;
  content: string;
};

export type StoredProjectFile = ProjectFile | string;

export type Project = {
  id: string;
  name: string;
  location: string;
  description: string;
  files: StoredProjectFile[];
  fileGroups?: Record<string, string>;
  lastOpenedAt?: string;
  lastOpenedFilePaths?: string[];
  activeFilePath?: string;
};

export type WorkspaceState = {
  lastSelectedProjectId?: string;
};

type ProjectData = {
  projects: Project[];
  workspace?: WorkspaceState;
};

const projectsFilePath = join(app.getPath("userData"), "projects.json");

function getStoredFilePath(file: StoredProjectFile) {
  return typeof file === "string" ? file : file.path;
}

function normalizeProjectFileGroups(project: Project) {
  const filePaths = project.files.map((file) => getStoredFilePath(file));
  const normalizedGroups = Object.fromEntries(
    filePaths.map((filePath) => {
      const groupName = project.fileGroups?.[filePath];
      return [
        filePath,
        typeof groupName === "string" && groupName ? groupName : "General",
      ];
    }),
  );

  return Object.keys(normalizedGroups).length > 0
    ? normalizedGroups
    : undefined;
}

function sortProjectsByRecent(projects: Project[]) {
  return [...projects].sort((left, right) => {
    const leftTimestamp = left.lastOpenedAt ?? "";
    const rightTimestamp = right.lastOpenedAt ?? "";

    return rightTimestamp.localeCompare(leftTimestamp);
  });
}

function normalizeProjectData(data: ProjectData): ProjectData {
  return {
    workspace: {
      lastSelectedProjectId:
        typeof data.workspace?.lastSelectedProjectId === "string" &&
        data.workspace.lastSelectedProjectId
          ? data.workspace.lastSelectedProjectId
          : undefined,
    },
    projects: sortProjectsByRecent(
      data.projects.map((project) => ({
        ...project,
        fileGroups: normalizeProjectFileGroups(project),
        lastOpenedAt:
          typeof project.lastOpenedAt === "string" && project.lastOpenedAt
            ? project.lastOpenedAt
            : undefined,
        lastOpenedFilePaths: Array.isArray(project.lastOpenedFilePaths)
          ? [...new Set(project.lastOpenedFilePaths.filter(Boolean))]
          : undefined,
        activeFilePath:
          typeof project.activeFilePath === "string" && project.activeFilePath
            ? project.activeFilePath
            : undefined,
      })),
    ),
  };
}

async function ensureProjectsFile() {
  try {
    await access(projectsFilePath);
  } catch {
    await writeProjectsFile(defaultProjectData as ProjectData);
  }
}

export async function readProjectsFile(): Promise<ProjectData> {
  await ensureProjectsFile();
  const rawFile = await readFile(projectsFilePath, "utf-8");
  return normalizeProjectData(JSON.parse(rawFile) as ProjectData);
}

export async function writeProjectsFile(data: ProjectData) {
  await writeFile(
    projectsFilePath,
    `${JSON.stringify(normalizeProjectData(data), null, 2)}\n`,
    "utf-8",
  );
}

export async function deleteProject(id: string) {
  const data = await readProjectsFile();
  const filteredProjects = data.projects.filter((project) => project.id !== id);

  data.projects = filteredProjects;
  if (data.workspace?.lastSelectedProjectId === id) {
    data.workspace = {
      ...data.workspace,
      lastSelectedProjectId: undefined,
    };
  }

  await writeProjectsFile(data);
  return true;
}

export function createProjectId(projectName: string) {
  const baseId = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return baseId || `project-${Date.now()}`;
}

export function formatTimestamp(date = new Date()) {
  const iso = date.toISOString();
  return iso.slice(0, 16).replace("T", " ");
}

export function touchProject(project: Project, date = new Date()) {
  project.lastOpenedAt = formatTimestamp(date);
  return project;
}

export function setLastSelectedProject(data: ProjectData, projectId: string) {
  data.workspace = {
    ...data.workspace,
    lastSelectedProjectId: projectId,
  };
}

export function setProjectOpenedFiles(project: Project, filePaths: string[]) {
  const normalizedFilePaths = [...new Set(filePaths.filter(Boolean))];
  project.lastOpenedFilePaths =
    normalizedFilePaths.length > 0 ? normalizedFilePaths : undefined;

  if (
    project.activeFilePath &&
    !normalizedFilePaths.includes(project.activeFilePath)
  ) {
    project.activeFilePath = normalizedFilePaths[0];
  }

  return project;
}

export function setProjectActiveFile(project: Project, filePath?: string) {
  project.activeFilePath = filePath || undefined;
  return project;
}

export function clearWorkspaceRestoreState(data: ProjectData) {
  data.workspace = {
    ...data.workspace,
    lastSelectedProjectId: undefined,
  };

  for (const project of data.projects) {
    project.lastOpenedFilePaths = undefined;
    project.activeFilePath = undefined;
  }

  return data;
}

export function getProjectFileGroup(project: Project, filePath: string) {
  return project.fileGroups?.[filePath] || "General";
}

export function setProjectFileGroup(
  project: Project,
  filePath: string,
  groupName?: string,
) {
  const nextGroupName = groupName?.trim() || "General";
  project.fileGroups = {
    ...(project.fileGroups ?? {}),
    [filePath]: nextGroupName,
  };
  return project;
}
