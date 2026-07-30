export const DEFAULT_TAG_COLOR = '#3B82F6';

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function validateTagName(value: unknown): string;
export function validateTagName(value: unknown, allowUndefined: true): string | undefined;
export function validateTagName(value: unknown, allowUndefined = false): string | undefined {
  if (value === undefined && allowUndefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error('Tag name is required');
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Tag name is required');
  }

  return trimmed;
}

export function validateTagColor(value: unknown): string;
export function validateTagColor(value: unknown, allowUndefined: true): string | undefined;
export function validateTagColor(value: unknown, allowUndefined = false): string | undefined {
  if (value === undefined && allowUndefined) {
    return undefined;
  }

  if (value === undefined || value === null || value === '') {
    return DEFAULT_TAG_COLOR;
  }

  if (typeof value !== 'string' || !isHexColor(value)) {
    throw new Error('Color must be a valid hex code');
  }

  return value.toUpperCase();
}

export function validateTagIds(value: unknown): string[];
export function validateTagIds(value: unknown, allowUndefined: true): string[] | undefined;
export function validateTagIds(value: unknown, allowUndefined = false): string[] | undefined {
  if (value === undefined && allowUndefined) {
    return undefined;
  }

  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error('Tag IDs must be an array of strings');
  }

  return [...new Set(value.map((item) => item.trim()))];
}
