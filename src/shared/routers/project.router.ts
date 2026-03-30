import { publicProcedure, router } from "@src/trpc";
import {
  createProjectId,
  formatTimestamp,
  readProjectsFile,
  writeProjectsFile,
} from "../project-store";
import { z } from "zod";

export const projectRouter = router({
  getAll: publicProcedure.query(async () => {
    const data = await readProjectsFile();
    return data.projects;
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

      const duplicateCount = data.projects.filter((project) =>
        project.id === projectId || project.id.startsWith(`${projectId}-`),
      ).length;

      const finalId = duplicateCount === 0 ? projectId : `${projectId}-${duplicateCount + 1}`;

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
