import { 
    redaksjonSchemas,
} from '@redaksjon/context';

/**
 * Protokoll-specific plural names with context/ subdirectory prefix.
 */
export const protokollPluralNames = {
    person: 'context/people',
    company: 'context/companies',
    term: 'context/terms',
    ignored: 'context/ignored',
    project: 'context/projects',
};

/**
 * Default overcontext configuration for protokoll.
 */
export const protokollContextConfig: {
    schemas: typeof redaksjonSchemas;
    pluralNames: typeof protokollPluralNames;
    contextDirName: string;
} = {
    schemas: redaksjonSchemas,
    pluralNames: protokollPluralNames,
    contextDirName: 'context',
};

/**
 * Discovery options for protokoll.
 */
export const protokollDiscoveryOptions = {
    contextDirName: '.protokoll',
    maxLevels: 10,
};
