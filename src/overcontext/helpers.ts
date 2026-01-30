import { Term, Project } from '@redaksjon/context';

/**
 * Check if a term is associated with a given project.
 */
export const isTermAssociatedWithProject = (term: Term, projectId: string): boolean => {
    return term.projects?.includes(projectId) ?? false;
};

/**
 * Add a project association to a term.
 */
export const addProjectToTerm = (term: Term, projectId: string): Term => {
    const projects = term.projects || [];
    if (projects.includes(projectId)) {
        return term;
    }
    return {
        ...term,
        projects: [...projects, projectId],
        updatedAt: new Date(),
    };
};

/**
 * Remove a project association from a term.
 */
export const removeProjectFromTerm = (term: Term, projectId: string): Term => {
    const projects = term.projects || [];
    return {
        ...term,
        projects: projects.filter((id: string) => id !== projectId),
        updatedAt: new Date(),
    };
};

/**
 * Check if projectA is a parent of projectB.
 */
export const isParentProject = (projectA: Project, projectB: Project): boolean => {
    return projectB.relationships?.parent === projectA.id;
};

/**
 * Check if projectA is a child of projectB.
 */
export const isChildProject = (projectA: Project, projectB: Project): boolean => {
    return projectA.relationships?.parent === projectB.id;
};

/**
 * Check if two projects are siblings.
 */
export const areSiblingProjects = (projectA: Project, projectB: Project): boolean => {
    const aSiblings = projectA.relationships?.siblings || [];
    const bSiblings = projectB.relationships?.siblings || [];
    return aSiblings.includes(projectB.id) || bSiblings.includes(projectA.id);
};

/**
 * Get relationship distance between two projects.
 * Returns: 0 = same, 1 = parent/child, 2 = siblings/cousins, -1 = unrelated
 */
export const getProjectRelationshipDistance = (projectA: Project, projectB: Project): number => {
    if (projectA.id === projectB.id) return 0;
    if (isParentProject(projectA, projectB) || isChildProject(projectA, projectB)) return 1;
    if (areSiblingProjects(projectA, projectB)) return 2;
  
    if (projectA.relationships?.parent && projectB.relationships?.parent &&
      projectA.relationships.parent === projectB.relationships.parent) {
        return 2;
    }
  
    return -1;
};
