export const MAX_TEMPLATE_SUBTASKS = 25;
export const MAX_TEMPLATE_SUBTASK_TITLE_LENGTH = 120;

export function validateTemplateName(value: unknown, allowUndefined = false): string | undefined {
  if (value === undefined && allowUndefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Template name is required');
  }

  return value.trim();
}

export function validateOptionalText(value: unknown, allowUndefined = false): string | null | undefined {
  if (value === undefined && allowUndefined) {
    return undefined;
  }

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function validateOffsetMinutes(value: unknown, allowUndefined = false): number | null | undefined {
  if (value === undefined && allowUndefined) {
    return undefined;
  }

  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Offset minutes must be a non-negative integer');
  }

  return parsed;
}

export function normalizeTemplateSubtasks(
  value: unknown
): Array<{
  title: string;
  position: number;
}> {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error('Subtasks must be an array');
  }

  if (value.length > MAX_TEMPLATE_SUBTASKS) {
    throw new Error(`Subtasks cannot exceed ${MAX_TEMPLATE_SUBTASKS} items`);
  }

  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || typeof (item as { title?: unknown }).title !== 'string') {
      throw new Error('Each subtask must include a title');
    }

    const trimmedTitle = (item as { title: string }).title.trim();
    if (!trimmedTitle) {
      throw new Error('Subtask title is required');
    }
    if (trimmedTitle.length > MAX_TEMPLATE_SUBTASK_TITLE_LENGTH) {
      throw new Error(`Subtask title cannot exceed ${MAX_TEMPLATE_SUBTASK_TITLE_LENGTH} characters`);
    }

    return {
      title: trimmedTitle,
      position: index
    };
  });
}
