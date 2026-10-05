import { z } from "zod";

export const pinterestTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  refresh_token_expires_at: z.number().int().positive().optional(),
  scope: z.string().min(1),
}).passthrough();

export const pinterestUserAccountSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  business_name: z.string().nullable().optional(),
  profile_image: z.string().nullable().optional(),
  website_url: z.string().nullable().optional(),
  account_type: z.string().nullable().optional(),
}).passthrough();

export const pinterestBoardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  privacy: z.string().nullable().optional(),
  owner: z.object({ username: z.string().optional() }).passthrough().nullable().optional(),
}).passthrough();

export const pinterestBoardsPageSchema = z.object({
  items: z.array(pinterestBoardSchema),
  bookmark: z.string().nullable().optional(),
}).passthrough();

export type PinterestTokenResponse = z.infer<typeof pinterestTokenResponseSchema>;
export type PinterestUserAccount = z.infer<typeof pinterestUserAccountSchema>;
export type PinterestBoard = z.infer<typeof pinterestBoardSchema>;
