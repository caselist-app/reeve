import { z } from 'zod'

export const emailSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
})

export const otpSchema = z.object({
  email: z.string().email(),
  token: z
    .string()
    .trim()
    .length(6, 'Code must be 6 digits.')
    .regex(/^\d{6}$/, 'Code must be 6 digits.'),
})

export type Email = z.infer<typeof emailSchema>
export type Otp = z.infer<typeof otpSchema>
