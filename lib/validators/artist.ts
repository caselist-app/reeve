import { z } from 'zod'

export const artistSchema = z.object({
  name: z.string().min(1, 'Artist name is required'),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens')
    .optional(),
})

export type ArtistFormData = z.infer<typeof artistSchema>
