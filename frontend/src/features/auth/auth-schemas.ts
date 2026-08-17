import { z } from "zod";

const usernamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/;

export const roleSchema = z.enum(["administrator", "operator", "viewer"]);

export const userSchema = z.object({
  id: z.string().min(1),
  username: z.string().regex(usernamePattern),
  role: roleSchema,
  disabled: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const sessionSchema = z.object({
  user: userSchema,
  csrfToken: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
});

export const setupStatusSchema = z.object({ required: z.boolean() });

export const usernameSchema = z.string().regex(
  usernamePattern,
  "Username must be 3–32 characters using letters, numbers, dot, underscore, or hyphen.",
);

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

export const passwordSchema = z.string()
  .min(1, "Password is required.")
  .refine((password) => utf8Length(password) <= 256, "Password must be at most 256 characters.");

export const strongPasswordSchema = passwordSchema
  .refine((password) => utf8Length(password) >= 12, "Password must be at least 12 characters.")
  .refine((password) => {
    const categories = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{Ll}\p{Lu}\p{Nd}]/u]
      .filter((pattern) => pattern.test(password));
    return categories.length >= 3;
  }, "Password must use at least three of lowercase, uppercase, numbers, and symbols.");

export const loginCredentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const setupCredentialsSchema = z.object({
  username: usernameSchema,
  password: strongPasswordSchema,
});

export type Role = z.infer<typeof roleSchema>;
export type User = z.infer<typeof userSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type AuthCredentials = z.infer<typeof loginCredentialsSchema>;
