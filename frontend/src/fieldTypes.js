/**
 * Field-type registry for Instance schema builder.
 * Defines available field types + per-type validation rules.
 */

export const FIELD_TYPES = {
  short_text: {
    label: 'Short Text',
    icon: '📝',
    maxLength: 255,
    validate: (value) => {
      if (value === null || value === undefined) return true; // optional allowed
      if (typeof value !== 'string') return false;
      return value.length <= 255;
    },
  },
  long_text: {
    label: 'Long Text',
    icon: '📄',
    maxLength: 10000,
    validate: (value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      return value.length <= 10000;
    },
  },
  date: {
    label: 'Date',
    icon: '📅',
    format: 'YYYY-MM-DD',
    validate: (value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      return /^\d{4}-\d{2}-\d{2}$/.test(value);
    },
  },
  time: {
    label: 'Time',
    icon: '🕐',
    format: 'HH:MM:SS',
    validate: (value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      return /^\d{2}:\d{2}:\d{2}$/.test(value);
    },
  },
  datetime: {
    label: 'Date & Time',
    icon: '🕰️',
    format: 'YYYY-MM-DD HH:MM:SS',
    validate: (value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
    },
  },
  url: {
    label: 'URL',
    icon: '🔗',
    validate: (value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
  },
  dropdown: {
    label: 'Dropdown',
    icon: '📋',
    hasOptions: true,
    validate: (value, options) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      return (options || []).includes(value);
    },
  },
  checkbox: {
    label: 'Checkbox',
    icon: '☑️',
    validate: (value) => {
      if (value === null || value === undefined) return true;
      return typeof value === 'boolean';
    },
  },
  color: {
    label: 'Color',
    icon: '🎨',
    validate: (value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      return /^#[0-9a-fA-F]{6}$/.test(value);
    },
  },
  image: {
    label: 'Image',
    icon: '🖼️',
    alwaysOptional: true, // image/file fields are always optional
    validate: (value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      return true; // accept any string (URL or identifier)
    },
  },
  file: {
    label: 'File',
    icon: '📎',
    alwaysOptional: true,
    validate: (value) => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'string') return false;
      return true;
    },
  },
};

/**
 * Get field type info by key
 */
export const getFieldType = (typeKey) => FIELD_TYPES[typeKey] || null;

/**
 * Get list of all available field types
 */
export const getAvailableFieldTypes = () => Object.entries(FIELD_TYPES).map(([key, config]) => ({
  key,
  ...config,
}));

/**
 * Validate a value against field type + options
 */
export const validateFieldValue = (value, typeKey, options) => {
  const fieldType = getFieldType(typeKey);
  if (!fieldType) return false;
  return fieldType.validate(value, options);
};

/**
 * Check if field type has options (e.g., dropdown)
 */
export const fieldTypeHasOptions = (typeKey) => {
  const fieldType = getFieldType(typeKey);
  return fieldType?.hasOptions || false;
};

/**
 * Check if field type is always optional (image/file)
 */
export const isAlwaysOptional = (typeKey) => {
  const fieldType = getFieldType(typeKey);
  return fieldType?.alwaysOptional || false;
};
