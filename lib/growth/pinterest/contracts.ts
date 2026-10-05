import { GrowthPinterestPublicationRole } from "@prisma/client";
import { z } from "zod";

export const pinterestPublicationRoleSchema = z.nativeEnum(GrowthPinterestPublicationRole);
export const pinterestAccountIdSchema = z.string().min(1).max(191);
export const pinterestRoleUpdateSchema = z.object({ role: pinterestPublicationRoleSchema }).strict();
export const pinterestDisconnectSchema = z.object({ confirm: z.literal(true) }).strict();
