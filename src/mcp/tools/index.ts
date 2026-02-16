/**
 * MCP Tools - Exports all tool definitions and handlers
 */

// eslint-disable-next-line import/extensions
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

import * as DiscoveryTools from './discoveryTools';
import * as AudioTools from './audioTools';
import * as ContextTools from './contextTools';
import * as EntityTools from './entityTools';
import * as AssistTools from './assistTools';
import * as TranscriptTools from './transcriptTools';
import * as SystemTools from './systemTools';
import * as RelationshipTools from './relationshipTools';
import * as ContentTools from './contentTools';
import * as StatusTools from './statusTools';

// Re-export all handlers for testing
export * from './discoveryTools';
export * from './audioTools';
export * from './contextTools';
export * from './entityTools';
export * from './assistTools';
export * from './transcriptTools';
export * from './systemTools';
export * from './relationshipTools';
export * from './contentTools';
export * from './statusTools';
export * from './shared';

// ============================================================================
// All Tools
// ============================================================================

export const tools: Tool[] = [
    // System Information
    SystemTools.getVersionTool,
    SystemTools.getInfoTool,

    // Discovery & Configuration
    DiscoveryTools.discoverConfigTool,
    DiscoveryTools.suggestProjectTool,

    // Audio Processing
    AudioTools.processAudioTool,
    AudioTools.batchProcessTool,

    // Context Management
    ContextTools.contextStatusTool,
    ContextTools.listProjectsTool,
    ContextTools.listPeopleTool,
    ContextTools.listTermsTool,
    ContextTools.listCompaniesTool,
    ContextTools.searchContextTool,
    ContextTools.getEntityTool,

    // Entity CRUD
    EntityTools.addPersonTool,
    EntityTools.editPersonTool,
    EntityTools.addProjectTool,
    EntityTools.editProjectTool,
    EntityTools.updateProjectTool,
    EntityTools.addTermTool,
    EntityTools.editTermTool,
    EntityTools.updateTermTool,
    EntityTools.mergeTermsTool,
    EntityTools.addCompanyTool,
    EntityTools.deleteEntityTool,

    // Relationship Management
    RelationshipTools.addRelationshipTool,
    RelationshipTools.removeRelationshipTool,
    RelationshipTools.listRelationshipsTool,
    RelationshipTools.findRelatedEntitiesTool,

    // Content Management
    ContentTools.addContentTool,
    ContentTools.removeContentTool,
    ContentTools.listContentTool,
    ContentTools.getContentTool,

    // Smart Assistance
    AssistTools.suggestProjectMetadataTool,
    AssistTools.suggestTermMetadataTool,

    // Transcript Operations
    TranscriptTools.readTranscriptTool,
    TranscriptTools.listTranscriptsTool,
    TranscriptTools.editTranscriptTool,
    TranscriptTools.changeTranscriptDateTool,
    TranscriptTools.combineTranscriptsTool,
    TranscriptTools.provideFeedbackTool,
    TranscriptTools.updateTranscriptContentTool,
    TranscriptTools.updateTranscriptEntityReferencesTool,
    TranscriptTools.createNoteTool,
    TranscriptTools.getEnhancementLogTool,

    // Lifecycle Status & Tasks
    StatusTools.setStatusTool,
    StatusTools.createTaskTool,
    StatusTools.completeTaskTool,
    StatusTools.deleteTaskTool,
];

// ============================================================================
// Tool Handler Router
// ============================================================================

export async function handleToolCall(name: string, args: unknown): Promise<unknown> {
    switch (name) {
        // System Information
        case 'protokoll_get_version':
            return SystemTools.handleGetVersion();
        case 'protokoll_info':
            return SystemTools.handleGetInfo();

        // Discovery & Configuration
        case 'protokoll_discover_config':
            return DiscoveryTools.handleDiscoverConfig(args as Parameters<typeof DiscoveryTools.handleDiscoverConfig>[0]);
        case 'protokoll_suggest_project':
            return DiscoveryTools.handleSuggestProject(args as Parameters<typeof DiscoveryTools.handleSuggestProject>[0]);

        // Audio Processing
        case 'protokoll_process_audio':
            return AudioTools.handleProcessAudio(args as Parameters<typeof AudioTools.handleProcessAudio>[0]);
        case 'protokoll_batch_process':
            return AudioTools.handleBatchProcess(args as Parameters<typeof AudioTools.handleBatchProcess>[0]);

        // Context Management
        case 'protokoll_context_status':
            return ContextTools.handleContextStatus(args as Parameters<typeof ContextTools.handleContextStatus>[0]);
        case 'protokoll_list_projects':
            return ContextTools.handleListProjects(args as Parameters<typeof ContextTools.handleListProjects>[0]);
        case 'protokoll_list_people':
            return ContextTools.handleListPeople(args as Parameters<typeof ContextTools.handleListPeople>[0]);
        case 'protokoll_list_terms':
            return ContextTools.handleListTerms(args as Parameters<typeof ContextTools.handleListTerms>[0]);
        case 'protokoll_list_companies':
            return ContextTools.handleListCompanies(args as Parameters<typeof ContextTools.handleListCompanies>[0]);
        case 'protokoll_search_context':
            return ContextTools.handleSearchContext(args as Parameters<typeof ContextTools.handleSearchContext>[0]);
        case 'protokoll_get_entity':
            return ContextTools.handleGetEntity(args as Parameters<typeof ContextTools.handleGetEntity>[0]);

        // Entity CRUD
        case 'protokoll_add_person':
            return EntityTools.handleAddPerson(args as Parameters<typeof EntityTools.handleAddPerson>[0]);
        case 'protokoll_edit_person':
            return EntityTools.handleEditPerson(args as Parameters<typeof EntityTools.handleEditPerson>[0]);
        case 'protokoll_add_project':
            return EntityTools.handleAddProject(args as Parameters<typeof EntityTools.handleAddProject>[0]);
        case 'protokoll_edit_project':
            return EntityTools.handleEditProject(args as Parameters<typeof EntityTools.handleEditProject>[0]);
        case 'protokoll_update_project':
            return EntityTools.handleUpdateProject(args as Parameters<typeof EntityTools.handleUpdateProject>[0]);
        case 'protokoll_add_term':
            return EntityTools.handleAddTerm(args as Parameters<typeof EntityTools.handleAddTerm>[0]);
        case 'protokoll_edit_term':
            return EntityTools.handleEditTerm(args as Parameters<typeof EntityTools.handleEditTerm>[0]);
        case 'protokoll_update_term':
            return EntityTools.handleUpdateTerm(args as Parameters<typeof EntityTools.handleUpdateTerm>[0]);
        case 'protokoll_merge_terms':
            return EntityTools.handleMergeTerms(args as Parameters<typeof EntityTools.handleMergeTerms>[0]);
        case 'protokoll_add_company':
            return EntityTools.handleAddCompany(args as Parameters<typeof EntityTools.handleAddCompany>[0]);
        case 'protokoll_delete_entity':
            return EntityTools.handleDeleteEntity(args as Parameters<typeof EntityTools.handleDeleteEntity>[0]);

        // Smart Assistance
        case 'protokoll_suggest_project_metadata':
            return AssistTools.handleSuggestProjectMetadata(args as Parameters<typeof AssistTools.handleSuggestProjectMetadata>[0]);
        case 'protokoll_suggest_term_metadata':
            return AssistTools.handleSuggestTermMetadata(args as Parameters<typeof AssistTools.handleSuggestTermMetadata>[0]);

        // Relationship Management
        case 'protokoll_add_relationship':
            return RelationshipTools.handleAddRelationship(args as Parameters<typeof RelationshipTools.handleAddRelationship>[0]);
        case 'protokoll_remove_relationship':
            return RelationshipTools.handleRemoveRelationship(args as Parameters<typeof RelationshipTools.handleRemoveRelationship>[0]);
        case 'protokoll_list_relationships':
            return RelationshipTools.handleListRelationships(args as Parameters<typeof RelationshipTools.handleListRelationships>[0]);
        case 'protokoll_find_related_entities':
            return RelationshipTools.handleFindRelatedEntities(args as Parameters<typeof RelationshipTools.handleFindRelatedEntities>[0]);

        // Content Management
        case 'protokoll_add_content':
            return ContentTools.handleAddContent(args as Parameters<typeof ContentTools.handleAddContent>[0]);
        case 'protokoll_remove_content':
            return ContentTools.handleRemoveContent(args as Parameters<typeof ContentTools.handleRemoveContent>[0]);
        case 'protokoll_list_content':
            return ContentTools.handleListContent(args as Parameters<typeof ContentTools.handleListContent>[0]);
        case 'protokoll_get_content':
            return ContentTools.handleGetContent(args as Parameters<typeof ContentTools.handleGetContent>[0]);

        // Transcript Operations
        case 'protokoll_read_transcript':
            return TranscriptTools.handleReadTranscript(args as Parameters<typeof TranscriptTools.handleReadTranscript>[0]);
        case 'protokoll_list_transcripts':
            return TranscriptTools.handleListTranscripts(args as Parameters<typeof TranscriptTools.handleListTranscripts>[0]);
        case 'protokoll_edit_transcript':
            return TranscriptTools.handleEditTranscript(args as Parameters<typeof TranscriptTools.handleEditTranscript>[0]);
        case 'protokoll_change_transcript_date':
            return TranscriptTools.handleChangeTranscriptDate(args as Parameters<typeof TranscriptTools.handleChangeTranscriptDate>[0]);
        case 'protokoll_combine_transcripts':
            return TranscriptTools.handleCombineTranscripts(args as Parameters<typeof TranscriptTools.handleCombineTranscripts>[0]);
        case 'protokoll_provide_feedback':
            return TranscriptTools.handleProvideFeedback(args as Parameters<typeof TranscriptTools.handleProvideFeedback>[0]);
        case 'protokoll_update_transcript_content':
            return TranscriptTools.handleUpdateTranscriptContent(args as Parameters<typeof TranscriptTools.handleUpdateTranscriptContent>[0]);
        case 'protokoll_update_transcript_entity_references':
            return TranscriptTools.handleUpdateTranscriptEntityReferences(args as Parameters<typeof TranscriptTools.handleUpdateTranscriptEntityReferences>[0]);
        case 'protokoll_create_note':
            return TranscriptTools.handleCreateNote(args as Parameters<typeof TranscriptTools.handleCreateNote>[0]);
        case 'protokoll_get_enhancement_log':
            return TranscriptTools.handleGetEnhancementLog(args as Parameters<typeof TranscriptTools.handleGetEnhancementLog>[0]);

        // Lifecycle Status & Tasks
        case 'protokoll_set_status':
            return StatusTools.handleSetStatus(args as Parameters<typeof StatusTools.handleSetStatus>[0]);
        case 'protokoll_create_task':
            return StatusTools.handleCreateTask(args as Parameters<typeof StatusTools.handleCreateTask>[0]);
        case 'protokoll_complete_task':
            return StatusTools.handleCompleteTask(args as Parameters<typeof StatusTools.handleCompleteTask>[0]);
        case 'protokoll_delete_task':
            return StatusTools.handleDeleteTask(args as Parameters<typeof StatusTools.handleDeleteTask>[0]);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
