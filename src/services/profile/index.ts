/**
 * Profile service – current user profile from public.profiles.
 */

export { getCurrentProfile, updateProfile, sanitizeProfileDisplayValue, normalizePhoneForProfile } from './profile';
export type {
  ProfileRow,
  GetCurrentProfileResult,
  UpdateProfilePayload,
  UpdateProfileResult,
} from './profile';
