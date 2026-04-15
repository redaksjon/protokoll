import React from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'

function AIAssistants() {
    return (
        <Layout>
            <header className="page-header">
                <div className="container">
                    <nav className="breadcrumb">
                        <Link to="/">Home</Link>
                        <span className="breadcrumb-sep">/</span>
                        <span>AI Assistants</span>
                    </nav>
                    <h1>AI Assistants</h1>
                    <p className="page-desc">
                        Connect Protokoll to your favorite AI assistant via MCP.
                    </p>
                </div>
            </header>

            <section className="page-section">
                <div className="container">
                    <h2>How MCP Works</h2>
                    <div className="mcp-diagram">
                        <div className="mcp-node">
                            <span className="mcp-node-label">Your AI Assistant</span>
                            <p>Cursor, Claude Desktop, etc.</p>
                        </div>
                        <div className="mcp-arrow">⟷</div>
                        <div className="mcp-node">
                            <span className="mcp-node-label">MCP Transport</span>
                            <p>HTTP (local or remote)</p>
                        </div>
                        <div className="mcp-arrow">⟷</div>
                        <div className="mcp-node">
                            <span className="mcp-node-label">Protokoll Server</span>
                            <p>Your transcription engine</p>
                        </div>
                    </div>
                    <p>Protokoll exposes an MCP HTTP endpoint. Your AI assistant connects to this endpoint to access transcription tools.</p>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Claude Desktop</h2>
                    <p>Add Protokoll to your Claude Desktop configuration:</p>
                    
                    <h3>Find Your Config File</h3>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># macOS</span></div>
                        <div className="code-line">~/Library/Application Support/Claude/claude_desktop_config.json</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># Linux</span></div>
                        <div className="code-line">~/.config/Claude/claude_desktop_config.json</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># Windows</span></div>
                        <div className="code-line">%APPDATA%\Claude\claude_desktop_config.json</div>
                    </div>

                    <h3>Add the MCP Server</h3>

                    <h4>Option A: Local (stdio)</h4>
                    <p>Claude Desktop launches the MCP server for you via stdio. Use the <code>protokoll-mcp</code> binary:</p>
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"command"</span>: <span className="code-string">"npx"</span>,</div>
                        <div className="code-line">      <span className="code-string">"args"</span>: [<span className="code-string">"-y"</span>, <span className="code-string">"-p"</span>, <span className="code-string">"@redaksjon/protokoll"</span>, <span className="code-string">"protokoll-mcp"</span>]</div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>

                    <h4>Option B: Remote (HTTP)</h4>
                    <p>Connect to an already-running Protokoll HTTP server:</p>
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"url"</span>: <span className="code-string">"http://localhost:3000/mcp"</span></div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>

                    <div className="callout callout-info">
                        <h4>Local vs Remote</h4>
                        <p><strong>stdio (local):</strong> Claude Desktop launches the MCP server process for you and communicates over stdin/stdout. No separate server needs to be running. Use <code>protokoll-mcp</code> with the <code>command</code>/<code>args</code> format.</p>
                        <p><strong>HTTP (remote):</strong> Connects to an already-running Protokoll HTTP server using a <code>url</code> field. You must start the server separately (e.g. <code>protokoll-mcp-http</code>). For remote servers, see the <Link to="/deploy">Deployment guide</Link>.</p>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Cursor</h2>
                    <p>Add Protokoll to Cursor's MCP configuration:</p>
                    
                    <h3>Find Your Config File</h3>
                    <div className="code-block">
                        <div className="code-line">~/.cursor/mcp.json</div>
                    </div>

                    <h3>Add the MCP Server</h3>

                    <h4>Option A: Local (stdio)</h4>
                    <p>Cursor launches the MCP server for you via stdio. Use the <code>protokoll-mcp</code> binary:</p>
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"command"</span>: <span className="code-string">"npx"</span>,</div>
                        <div className="code-line">      <span className="code-string">"args"</span>: [<span className="code-string">"-y"</span>, <span className="code-string">"-p"</span>, <span className="code-string">"@redaksjon/protokoll"</span>, <span className="code-string">"protokoll-mcp"</span>]</div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>

                    <h4>Option B: Remote (HTTP)</h4>
                    <p>Connect to an already-running Protokoll HTTP server:</p>
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"url"</span>: <span className="code-string">"http://localhost:3000/mcp"</span></div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Other MCP Clients</h2>
                    <p>Protokoll works with any MCP-compatible client. Choose the transport that matches your setup:</p>

                    <h3>stdio (Local)</h3>
                    <p>The client launches the MCP server process for you and communicates over stdin/stdout:</p>
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"command"</span>: <span className="code-string">"npx"</span>,</div>
                        <div className="code-line">      <span className="code-string">"args"</span>: [<span className="code-string">"-y"</span>, <span className="code-string">"-p"</span>, <span className="code-string">"@redaksjon/protokoll"</span>, <span className="code-string">"protokoll-mcp"</span>]</div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>

                    <h3>HTTP (Remote)</h3>
                    <p>Connect to an already-running Protokoll HTTP server:</p>
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"url"</span>: <span className="code-string">"http://localhost:3000/mcp"</span></div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Available Tools</h2>
                    <p>Once connected, you can use these tools in your AI assistant:</p>
                    <div className="tools-categories">
                        <div className="tool-category">
                            <h4>Audio & Transcription</h4>
                            <ul>
                                <li><code>protokoll_process_audio</code> — Transcribe audio with context-aware enhancement</li>
                                <li><code>protokoll_batch_process</code> — Process multiple audio files</li>
                                <li><code>protokoll_enhance_transcript</code> — Re-enhance an existing transcript</li>
                            </ul>
                        </div>
                        <div className="tool-category">
                            <h4>Transcript Management</h4>
                            <ul>
                                <li><code>protokoll_list_transcripts</code> — List and search transcripts</li>
                                <li><code>protokoll_read_transcript</code> — Read transcript content</li>
                                <li><code>protokoll_edit_transcript</code> — Edit title, project, tags, status</li>
                                <li><code>protokoll_provide_feedback</code> — Correct errors with natural language</li>
                                <li><code>protokoll_summarize_transcript</code> — Generate audience-aware summaries</li>
                            </ul>
                        </div>
                        <div className="tool-category">
                            <h4>Context & Entities</h4>
                            <ul>
                                <li><code>protokoll_add_person</code> / <code>protokoll_edit_person</code> — Manage people</li>
                                <li><code>protokoll_add_project</code> / <code>protokoll_edit_project</code> — Manage projects</li>
                                <li><code>protokoll_add_term</code> / <code>protokoll_edit_term</code> — Manage terms</li>
                                <li><code>protokoll_add_company</code> / <code>protokoll_edit_company</code> — Manage companies</li>
                                <li><code>protokoll_search_context</code> — Search across all entities</li>
                            </ul>
                        </div>
                        <div className="tool-category">
                            <h4>Tasks & Notes</h4>
                            <ul>
                                <li><code>protokoll_create_note</code> — Create a new note/transcript</li>
                                <li><code>protokoll_create_task</code> — Add follow-up tasks</li>
                                <li><code>protokoll_identify_tasks_from_transcript</code> — Auto-suggest tasks</li>
                                <li><code>protokoll_complete_task</code> — Mark tasks done</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <div className="next-steps-grid">
                        <Link to="/install" className="next-step-card">
                            <h4>Need Help?</h4>
                            <p>Review the installation guide if you haven't set up Protokoll yet.</p>
                            <span className="next-step-link">Installation →</span>
                        </Link>
                        <Link to="/deploy" className="next-step-card">
                            <h4>Deploy Remotely</h4>
                            <p>Access your transcription server from anywhere.</p>
                            <span className="next-step-link">View options →</span>
                        </Link>
                    </div>
                </div>
            </section>
        </Layout>
    )
}

export default AIAssistants
