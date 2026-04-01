import { publicProcedure, router } from "@src/trpc";
import {
  createProjectId,
  formatTimestamp,
  type ProjectFile,
  readProjectsFile,
  writeProjectsFile,
} from "../project-store";
import { z } from "zod";
import { dialog } from "electron";

function getStoredFilePath(file: string | ProjectFile) {
  return typeof file === "string" ? file : file.path;
}

export const projectRouter = router({
  getAll: publicProcedure.query(async () => {
    const data = await readProjectsFile();
    return data.projects;
  }),

  addFiles: publicProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.window) {
        throw new Error("No window context available");
      }

      const data = await readProjectsFile();
      const project = data.projects.find(
        (project) => project.id === input.projectId,
      );

      if (!project) {
        throw new Error(`Project with id ${input.projectId} not found`);
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

      const existingPaths = new Set(
        project.files.map((file) => getStoredFilePath(file)),
      );

      const newPaths = result.filePaths.filter(
        (filePath) => !existingPaths.has(filePath),
      );

      project.files.push(...newPaths);

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
        files: [
          {
            id: `${finalId}-readme`,
            name: "README.md",
            path: "README.md",
            type: "Markdown",
            size: "120 B",
            updatedAt: formatTimestamp(),
            content: `# ${input.name}\n\nNieuw project aangemaakt vanuit de Electron app.`,
          },
        ],
      };

      data.projects.push(newProject);
      await writeProjectsFile(data);

      return newProject;
    }),
});
