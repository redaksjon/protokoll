export * from './adapter';
export * from './discovery';
export * from './config';
export * from './helpers';

// Re-export redaksjon-context types for convenience
export {
    PersonSchema,
    ProjectSchema,
    CompanySchema,
    TermSchema,
    IgnoredTermSchema,
    redaksjonSchemas,
    redaksjonPluralNames,
} from '@redaksjon/context';
