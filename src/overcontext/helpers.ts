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
    // Check new format
    const parentRel = projectB.relationships?.find(
        r => r.relationship === 'parent' || r.relationship === 'child_of' || r.relationship === 'part_of'
    );
    if (parentRel) {
        const parentId = parentRel.uri.split('/').pop();
        return parentId === projectA.id;
    }
    
    return false;
};

/**
 * Check if projectA is a child of projectB.
 */
export const isChildProject = (projectA: Project, projectB: Project): boolean => {
    // Check new format
    const parentRel = projectA.relationships?.find(
        r => r.relationship === 'parent' || r.relationship === 'child_of' || r.relationship === 'part_of'
    );
    if (parentRel) {
        const parentId = parentRel.uri.split('/').pop();
        return parentId === projectB.id;
    }
    
    return false;
};

/**
 * Check if two projects are siblings.
 */
export const areSiblingProjects = (projectA: Project, projectB: Project): boolean => {
    // Check new format
    const aSiblingRels = projectA.relationships?.filter(r => r.relationship === 'sibling') || [];
    const bSiblingRels = projectB.relationships?.filter(r => r.relationship === 'sibling') || [];
    
    for (const rel of aSiblingRels) {
        const siblingId = rel.uri.split('/').pop();
        if (siblingId === projectB.id) return true;
    }
    
    for (const rel of bSiblingRels) {
        const siblingId = rel.uri.split('/').pop();
        if (siblingId === projectA.id) return true;
    }
    
    return false;
};

/**
 * Get relationship distance between two projects.
 * Returns: 0 = same, 1 = parent/child, 2 = siblings/cousins, -1 = unrelated
 */
export const getProjectRelationshipDistance = (projectA: Project, projectB: Project): number => {
    if (projectA.id === projectB.id) return 0;
    if (isParentProject(projectA, projectB) || isChildProject(projectA, projectB)) return 1;
    if (areSiblingProjects(projectA, projectB)) return 2;
    
    // Check if they share a parent (new format)
    const aParentRel = projectA.relationships?.find(r => r.relationship === 'parent' || r.relationship === 'child_of' || r.relationship === 'part_of');
    const bParentRel = projectB.relationships?.find(r => r.relationship === 'parent' || r.relationship === 'child_of' || r.relationship === 'part_of');
    
    if (aParentRel && bParentRel) {
        const aParentId = aParentRel.uri.split('/').pop();
        const bParentId = bParentRel.uri.split('/').pop();
        if (aParentId === bParentId) {
            return 2;
        }
    }
  
    return -1;
};
