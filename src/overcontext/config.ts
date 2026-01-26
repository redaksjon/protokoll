import { 
    redaksjonSchemas, 
    redaksjonPluralNames,
} from '@redaksjon/context';

/**
 * Default overcontext configuration for protokoll.
 */
export const protokollContextConfig: {
    schemas: typeof redaksjonSchemas;
    pluralNames: typeof redaksjonPluralNames;
    contextDirName: string;
} = {
    schemas: redaksjonSchemas,
    pluralNames: redaksjonPluralNames,
    contextDirName: '.protokoll/context',  // Keep existing path
};

/**
 * Discovery options for protokoll.
 */
export const protokollDiscoveryOptions = {
    contextDirName: '.protokoll/context',
    maxLevels: 10,
};
