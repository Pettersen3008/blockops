import { z } from "zod";

export const worldFileSchema = z.instanceof(File)
  .refine((file) => file.size > 0, "Choose a non-empty world ZIP.")
  .refine((file) => file.name.toLowerCase().endsWith(".zip"), "World uploads must use a .zip filename.")
  .refine(
    (file) => file.type === "" || file.type === "application/zip" || file.type === "application/x-zip-compressed",
    "The selected file must be a ZIP archive.",
  );

export const replaceWorldResponseSchema = z.object({ status: z.literal("replaced") });
