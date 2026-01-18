/**
 * Content Fetcher
 * 
 * Fetches content from URLs and local files for LLM analysis.
 * Handles GitHub URLs specially to get raw README content.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { MAX_CONTENT_LENGTH } from '../constants';
import { getLogger } from '../logging';

export interface FetchResult {
    success: boolean;
    content?: string;
    sourceType: 'url' | 'file' | 'directory' | 'github';
    sourceName: string;
    error?: string;
}

export interface ContentFetcherInstance {
    fetch(source: string): Promise<FetchResult>;
    isUrl(source: string): boolean;
    isGitHubUrl(source: string): boolean;
}

export const create = (): ContentFetcherInstance => {
    const logger = getLogger();

    const isUrl = (source: string): boolean => {
        return source.startsWith('http://') || source.startsWith('https://');
    };

    const isGitHubUrl = (source: string): boolean => {
        return source.includes('github.com/');
    };

    // Simple HTML tag stripper
    const stripHtml = (html: string): string => {
        // Remove script and style tags with content
        let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        
        // Remove HTML tags
        text = text.replace(/<[^>]+>/g, ' ');
        
        // Decode common HTML entities
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&quot;/g, '"');
        
        // Normalize whitespace
        text = text.replace(/\s+/g, ' ').trim();
        
        return text;
    };

    const fetchUrl = async (url: string): Promise<FetchResult> => {
        logger.debug('Fetching URL: %s', url);

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'protokoll/1.0',
                    'Accept': 'text/html,text/plain,text/markdown,application/json',
                },
                signal: AbortSignal.timeout(10000), // 10 second timeout
            });

            if (!response.ok) {
                return {
                    success: false,
                    sourceType: 'url',
                    sourceName: url,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                };
            }

            const contentType = response.headers.get('content-type') || '';
            let content = await response.text();

            // Strip HTML tags for basic text extraction
            if (contentType.includes('text/html')) {
                content = stripHtml(content);
            }

            // Truncate to max length
            if (content.length > MAX_CONTENT_LENGTH) {
                content = content.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
            }

            return {
                success: true,
                content,
                sourceType: 'url',
                sourceName: new URL(url).hostname,
            };
        } catch (error: any) {
            return {
                success: false,
                sourceType: 'url',
                sourceName: url,
                error: error.message,
            };
        }
    };

    const fetchGitHubReadme = async (url: string): Promise<FetchResult> => {
        logger.debug('Fetching GitHub repository: %s', url);

        try {
            // Parse GitHub URL: https://github.com/owner/repo
            const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
            if (!match) {
                // Fall back to regular URL fetch
                return await fetchUrl(url);
            }

            const [, owner, repo] = match;
            const repoName = repo.replace(/\.git$/, '');
            
            // Try to fetch raw README.md from main branch
            const readmeUrls = [
                `https://raw.githubusercontent.com/${owner}/${repoName}/main/README.md`,
                `https://raw.githubusercontent.com/${owner}/${repoName}/master/README.md`,
                `https://raw.githubusercontent.com/${owner}/${repoName}/main/readme.md`,
                `https://raw.githubusercontent.com/${owner}/${repoName}/master/readme.md`,
            ];

            for (const readmeUrl of readmeUrls) {
                try {
                    const response = await fetch(readmeUrl, {
                        headers: { 'User-Agent': 'protokoll/1.0' },
                        signal: AbortSignal.timeout(10000),
                    });

                    if (response.ok) {
                        let content = await response.text();
                        
                        if (content.length > MAX_CONTENT_LENGTH) {
                            content = content.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
                        }

                        return {
                            success: true,
                            content,
                            sourceType: 'github',
                            sourceName: `${owner}/${repoName}`,
                        };
                    }
                } catch {
                    // Try next URL
                }
            }

            // Fall back to regular URL fetch if README not found
            return await fetchUrl(url);
        } catch (error: any) {
            return {
                success: false,
                sourceType: 'github',
                sourceName: url,
                error: error.message,
            };
        }
    };

    const fetchFile = async (filePath: string): Promise<FetchResult> => {
        logger.debug('Reading file: %s', filePath);

        try {
            const ext = path.extname(filePath).toLowerCase();
            const supportedExtensions = ['.md', '.txt', '.yaml', '.yml', '.json', '.rst', '.adoc'];

            if (!supportedExtensions.includes(ext)) {
                return {
                    success: false,
                    sourceType: 'file',
                    sourceName: path.basename(filePath),
                    error: `Unsupported file type: ${ext}. Supported: ${supportedExtensions.join(', ')}`,
                };
            }

            let content = await fs.readFile(filePath, 'utf-8');

            if (content.length > MAX_CONTENT_LENGTH) {
                content = content.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
            }

            return {
                success: true,
                content,
                sourceType: 'file',
                sourceName: path.basename(filePath),
            };
        } catch (error: any) {
            return {
                success: false,
                sourceType: 'file',
                sourceName: path.basename(filePath),
                error: error.message,
            };
        }
    };

    const fetchDirectory = async (dirPath: string): Promise<FetchResult> => {
        logger.debug('Reading directory: %s', dirPath);

        try {
            const files = await fs.readdir(dirPath);
            
            // Priority order for finding content
            const priorityFiles = [
                'README.md',
                'readme.md',
                'README.txt',
                'readme.txt',
                'package.json',
                'README.rst',
                'README.adoc',
            ];

            for (const priorityFile of priorityFiles) {
                if (files.includes(priorityFile)) {
                    const filePath = path.join(dirPath, priorityFile);
                    const result = await fetchFile(filePath);
                    
                    if (result.success) {
                        return {
                            ...result,
                            sourceType: 'directory',
                            sourceName: `${path.basename(dirPath)}/${priorityFile}`,
                        };
                    }
                }
            }

            // If no priority file found, try first .md file
            const mdFile = files.find(f => f.endsWith('.md'));
            if (mdFile) {
                const result = await fetchFile(path.join(dirPath, mdFile));
                if (result.success) {
                    return {
                        ...result,
                        sourceType: 'directory',
                        sourceName: `${path.basename(dirPath)}/${mdFile}`,
                    };
                }
            }

            return {
                success: false,
                sourceType: 'directory',
                sourceName: path.basename(dirPath),
                error: 'No readable documentation files found in directory',
            };
        } catch (error: any) {
            return {
                success: false,
                sourceType: 'directory',
                sourceName: path.basename(dirPath),
                error: error.message,
            };
        }
    };

    const fetchContent = async (source: string): Promise<FetchResult> => {
        logger.debug('Fetching content from: %s', source);

        try {
            if (isUrl(source)) {
                if (isGitHubUrl(source)) {
                    return await fetchGitHubReadme(source);
                }
                return await fetchUrl(source);
            }

            // Local path
            const resolvedPath = path.resolve(source);
            const stat = await fs.stat(resolvedPath);

            if (stat.isDirectory()) {
                return await fetchDirectory(resolvedPath);
            } else {
                return await fetchFile(resolvedPath);
            }
        } catch (error: any) {
            logger.error('Failed to fetch content: %s', error.message);
            return {
                success: false,
                sourceType: isUrl(source) ? 'url' : 'file',
                sourceName: source,
                error: error.message,
            };
        }
    };

    return { 
        fetch: fetchContent, 
        isUrl, 
        isGitHubUrl 
    };
};
