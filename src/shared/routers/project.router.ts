import { publicProcedure, router } from "@src/trpc";
import {
  clearWorkspaceRestoreState,
  createProjectId,
  deleteProject,
  formatTimestamp,
  getProjectFileGroup,
  type ProjectFile,
  readProjectsFile,
  setLastSelectedProject,
  setProjectActiveFile,
  setProjectFileGroup,
  setProjectOpenedFiles,
  touchProject,
  writeProjectsFile,
} from "../project-store";
import { z } from "zod";
import { dialog, shell } from "electron";
import { access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";

function getStoredFilePath(file: string | ProjectFile) {
  return typeof file === "string" ? file : file.path;
}

function getNewProjectFilePaths(
  project: { files: Array<string | ProjectFile> },
  incomingPaths: string[],
) {
  const existingPaths = new Set(
    project.files.map((file) => getStoredFilePath(file)),
  );

  return incomingPaths.filter(
    (filePath) => isAbsolute(filePath) && !existingPaths.has(filePath),
  );
}

export const projectRouter = router({
  getAll: publicProcedure.query(async () => {
    const data = await readProjectsFile();
    return data.projects;
  }),

  selectProject: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await readProjectsFile();
      const project = data.projects.find(
        (project) => project.id === input.projectId,
      );

      if (!project) {
        throw new Error(`Project with id ${input.projectId} not found`);
      }

      touchProject(project);
      setLastSelectedProject(data, project.id);
      await writeProjectsFile(data);

      return project;
    }),

  restoreWorkspace: publicProcedure.mutation(async () => {
    try {
      const data = await readProjectsFile();
      const selectedProject =
        data.projects.find(
          (project) => project.id === data.workspace?.lastSelectedProjectId,
        ) ?? data.projects[0];

      if (!selectedProject) {
        return {
          projectId: "",
          restoredFilePaths: [],
          activeFilePath: "",
          invalidFilePaths: [],
          didClearRestoreState: false,
          skippedCount: 0,
        };
      }

      touchProject(selectedProject);
      setLastSelectedProject(data, selectedProject.id);

      const restoredFilePaths: string[] = [];
      const invalidFilePaths: string[] = [];
      let skippedCount = 0;

      for (const filePath of selectedProject.lastOpenedFilePaths ?? []) {
        if (!isAbsolute(filePath) || !existsSync(filePath)) {
          console.warn(
            `[workspace restore] Skipping missing file path: ${filePath}`,
          );
          invalidFilePaths.push(filePath);
          skippedCount += 1;
          continue;
        }

        const openError = await shell.openPath(filePath);

        if (openError) {
          console.warn(
            `[workspace restore] Failed to reopen file path: ${filePath}. ${openError}`,
          );
          invalidFilePaths.push(filePath);
          skippedCount += 1;
          continue;
        }

        restoredFilePaths.push(filePath);
      }

      const restoredActiveFilePath = restoredFilePaths.includes(
        selectedProject.activeFilePath ?? "",
      )
        ? selectedProject.activeFilePath
        : restoredFilePaths[0];

      if (
        selectedProject.activeFilePath &&
        !restoredFilePaths.includes(selectedProject.activeFilePath)
      ) {
        console.warn(
          `[workspace restore] Clearing invalid active file path: ${selectedProject.activeFilePath}`,
        );
      }

      setProjectOpenedFiles(selectedProject, restoredFilePaths);
      setProjectActiveFile(selectedProject, restoredActiveFilePath);
      await writeProjectsFile(data);

      return {
        projectId: selectedProject.id,
        restoredFilePaths,
        activeFilePath: restoredActiveFilePath ?? "",
        invalidFilePaths,
        didClearRestoreState: false,
        skippedCount,
      };
    } catch (error) {
      console.warn(
        "[workspace restore] Restore failed, clearing state.",
        error,
      );

      try {
        const data = await readProjectsFile();
        clearWorkspaceRestoreState(data);
        await writeProjectsFile(data);
      } catch (recoveryError) {
        console.warn(
          "[workspace restore] Failed to persist cleared restore state.",
          recoveryError,
        );
      }

      return {
        projectId: "",
        restoredFilePaths: [],
        activeFilePath: "",
        invalidFilePaths: [],
        didClearRestoreState: true,
        skippedCount: 0,
      };
    }
  }),

  openFile: publicProcedure
    .input(
      z.object({
        path: z.string().trim().min(1),
        projectId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isAbsolute(input.path)) {
        throw new Error("Only absolute file paths can be opened.");
      }

      try {
        await access(input.path);
      } catch {
        throw new Error("The selected file does not exist.");
      }

      const openError = await shell.openPath(input.path);

      if (openError) {
        throw new Error(openError);
      }

      if (input.projectId) {
        const data = await readProjectsFile();
        const project = data.projects.find(
          (project) => project.id === input.projectId,
        );

        if (project) {
          touchProject(project);
          setLastSelectedProject(data, project.id);
          setProjectOpenedFiles(project, [
            input.path,
            ...(project.lastOpenedFilePaths ?? []).filter(
              (filePath) => filePath !== input.path,
            ),
          ]);
          setProjectActiveFile(project, input.path);
          await writeProjectsFile(data);
        }
      }

      return {
        path: input.path,
      };
    }),

  revealFile: publicProcedure
    .input(
      z.object({
        filePath: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isAbsolute(input.filePath)) {
        throw new Error("Only absolute file paths can be revealed.");
      }

      try {
        await access(input.filePath);
      } catch {
        throw new Error("The selected file does not exist.");
      }

      shell.showItemInFolder(input.filePath);

      return {
        filePath: input.filePath,
      };
    }),

  openProject: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await readProjectsFile();
      const project = data.projects.find(
        (project) => project.id === input.projectId,
      );

      if (!project) {
        throw new Error(`Project with id ${input.projectId} not found`);
      }

      touchProject(project);
      setLastSelectedProject(data, project.id);

      const filePaths = project.files.map((file) => getStoredFilePath(file));
      let openedCount = 0;
      let skippedCount = 0;
      const openedFilePaths: string[] = [];

      for (const filePath of filePaths) {
        if (!isAbsolute(filePath)) {
          skippedCount += 1;
          continue;
        }

        try {
          await access(filePath);
        } catch {
          skippedCount += 1;
          continue;
        }

        const openError = await shell.openPath(filePath);

        if (openError) {
          skippedCount += 1;
          continue;
        }

        openedCount += 1;
        openedFilePaths.push(filePath);
      }

      setProjectOpenedFiles(project, openedFilePaths);
      setProjectActiveFile(project, openedFilePaths[0]);
      await writeProjectsFile(data);

      return {
        openedCount,
        skippedCount,
      };
    }),

  removeFile: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        filePath: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await readProjectsFile();
      const project = data.projects.find(
        (project) => project.id === input.projectId,
      );

      if (!project) {
        throw new Error(`Project with id ${input.projectId} not found`);
      }

      const nextFiles = project.files.filter(
        (file) => getStoredFilePath(file) !== input.filePath,
      );

      if (nextFiles.length === project.files.length) {
        return project;
      }

      project.files = nextFiles;
      if (project.fileGroups?.[input.filePath]) {
        delete project.fileGroups[input.filePath];
      }
      setProjectOpenedFiles(
        project,
        (project.lastOpenedFilePaths ?? []).filter(
          (filePath) => filePath !== input.filePath,
        ),
      );
      if (project.activeFilePath === input.filePath) {
        setProjectActiveFile(project, project.lastOpenedFilePaths?.[0]);
      }
      await writeProjectsFile(data);

      return project;
    }),

  moveFileToGroup: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        filePath: z.string().trim().min(1),
        groupName: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await readProjectsFile();
      const project = data.projects.find(
        (project) => project.id === input.projectId,
      );

      if (!project) {
        throw new Error(`Project with id ${input.projectId} not found`);
      }

      const hasFile = project.files.some(
        (file) => getStoredFilePath(file) === input.filePath,
      );

      if (!hasFile) {
        throw new Error("The selected file is not part of this project.");
      }

      setProjectFileGroup(project, input.filePath, input.groupName);
      await writeProjectsFile(data);

      return {
        filePath: input.filePath,
        groupName: getProjectFileGroup(project, input.filePath),
      };
    }),

  closeFileTab: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        filePath: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await readProjectsFile();
      const project = data.projects.find(
        (project) => project.id === input.projectId,
      );

      if (!project) {
        throw new Error(`Project with id ${input.projectId} not found`);
      }

      const remainingTabs = (project.lastOpenedFilePaths ?? []).filter(
        (filePath) => filePath !== input.filePath,
      );

      setProjectOpenedFiles(project, remainingTabs);

      if (project.activeFilePath === input.filePath) {
        setProjectActiveFile(project, remainingTabs[0]);
      }

      await writeProjectsFile(data);
      return project;
    }),

  activateFileTab: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        filePath: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await readProjectsFile();
      const project = data.projects.find(
        (project) => project.id === input.projectId,
      );

      if (!project) {
        throw new Error(`Project with id ${input.projectId} not found`);
      }

      const openTabs = project.lastOpenedFilePaths ?? [];
      const nextTabs = openTabs.includes(input.filePath)
        ? openTabs
        : [input.filePath, ...openTabs];

      setProjectOpenedFiles(project, nextTabs);
      setProjectActiveFile(project, input.filePath);
      touchProject(project);
      setLastSelectedProject(data, project.id);
      await writeProjectsFile(data);

      return project;
    }),

  addFiles: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        filePaths: z.array(z.string().trim().min(1)).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const data = await readProjectsFile();
      const project = data.projects.find(
        (project) => project.id === input.projectId,
      );

      if (!project) {
        throw new Error(`Project with id ${input.projectId} not found`);
      }

      let filePaths = input.filePaths ?? [];

      if (filePaths.length === 0) {
        if (!ctx.window) {
          throw new Error("No window context available");
        }

        const result = await dialog.showOpenDialog(ctx.window, {
          title: "Selecteer bestanden om toe te voegen",
          properties: ["openFile", "multiSelections"],
        });

        if (
          result.canceled ||
          !result.filePaths ||
          result.filePaths.length === 0
        ) {
          return project;
        }

        filePaths = result.filePaths;
      }

      const newPaths = getNewProjectFilePaths(project, filePaths);

      project.files.push(...newPaths);
      for (const filePath of newPaths) {
        setProjectFileGroup(project, filePath, "General");
      }

      await writeProjectsFile(data);
      return project;
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await readProjectsFile();
      const projectId = createProjectId(input.name);

      const duplicateCount = data.projects.filter(
        (project) =>
          project.id === projectId || project.id.startsWith(`${projectId}-`),
      ).length;

      const finalId =
        duplicateCount === 0 ? projectId : `${projectId}-${duplicateCount + 1}`;

      const newProject = {
        id: finalId,
        name: input.name,
        location: `C:/workspace/${finalId}`,
        description: "Nieuw project, aangemaakt vanuit de sidebar.",
        lastOpenedAt: formatTimestamp(),
        lastOpenedFilePaths: [],
        activeFilePath: undefined,
        files: [],
      };

      data.projects.push(newProject);
      setLastSelectedProject(data, newProject.id);
      await writeProjectsFile(data);

      return newProject;
    }),

  delete: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(({ input }) => {
      return deleteProject(input.id);
    }),
});
