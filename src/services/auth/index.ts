/**
 * Auth service – session, current user, sign in / sign out.
 * Use these from auth screens or a global auth context.
 */

export { getSession, onAuthStateChange } from './session';
export { getCurrentUser } from './user';
export { signIn, signUp, signOut, signInWithOtp, resetPasswordForEmail } from './signInOut';
export type { SignInResult, SignUpResult } from './signInOut';
