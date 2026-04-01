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
};

type ProjectData = {
  projects: Project[];
};

const projectsFilePath = join(app.getPath("userData"), "projects.json");

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
  return JSON.parse(rawFile) as ProjectData;
}

export async function writeProjectsFile(data: ProjectData) {
  await writeFile(
    projectsFilePath,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf-8",
  );
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
