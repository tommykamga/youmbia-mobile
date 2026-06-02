/**
 * Profile service – current user profile from public.profiles.
 */

export { getCurrentProfile, updateProfile, sanitizeProfileDisplayValue, normalizePhoneForProfile, getAvatarVersion } from './profile';
export { getUserDisplayName, isApplePrivateRelayEmail, APPLE_PRIVATE_RELAY_DISPLAY_NAME } from './profile';
export { checkPhoneUniquenessForPublish } from './profile';
export type {
  ProfileRow,
  GetCurrentProfileResult,
  UpdateProfilePayload,
  UpdateProfileResult,
} from './profile';
