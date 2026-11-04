export function isMessagesDemoEnabled(development: boolean, flag: string | undefined): boolean {
  return development && flag === '1';
}

export const MESSAGES_DEMO_ENV_FLAG = 'EXPO_PUBLIC_MESSAGES_DEMO';
