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
                    </div>

                    <h3>Add the MCP Server</h3>
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"command"</span>: <span className="code-string">"npx"</span>,</div>
                        <div className="code-line">      <span className="code-string">"args"</span>: [<span className="code-string">"-y"</span>, <span className="code-string">"-p"</span>, <span className="code-string">"@redaksjon/protokoll"</span>, <span className="code-string">"protokoll-mcp-http"</span>]</div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>

                    <div className="callout callout-info">
                        <h4>Local vs Remote</h4>
                        <p>The config above assumes your Protokoll server is running locally (default: <code>http://localhost:3000</code>). For remote servers, see the <Link to="/deploy">Deployment guide</Link>.</p>
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
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"command"</span>: <span className="code-string">"npx"</span>,</div>
                        <div className="code-line">      <span className="code-string">"args"</span>: [<span className="code-string">"-y"</span>, <span className="code-string">"-p"</span>, <span className="code-string">"@redaksjon/protokoll"</span>, <span className="code-string">"protokoll-mcp-http"</span>]</div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Other MCP Clients</h2>
                    <p>Protokoll works with any MCP-compatible client. The general configuration format is:</p>
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"command"</span>: <span className="code-string">"protokoll-mcp-http"</span></div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>
                    <p>Or with npx if installed globally:</p>
                    <div className="code-block">
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"command"</span>: <span className="code-string">"npx"</span>,</div>
                        <div className="code-line">      <span className="code-string">"args"</span>: [<span className="code-string">"-y"</span>, <span className="code-string">"-p"</span>, <span className="code-string">"@redaksjon/protokoll"</span>, <span className="code-string">"protokoll-mcp-http"</span>]</div>
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
                    <div className="tools-grid">
                        <div className="tool-card">
                            <h4>protokoll_process_audio</h4>
                            <p>Transcribe an audio file with context-aware enhancement.</p>
                        </div>
                        <div className="tool-card">
                            <h4>protokoll_list_transcripts</h4>
                            <p>List all transcripts with filtering and search.</p>
                        </div>
                        <div className="tool-card">
                            <h4>protokoll_read_transcript</h4>
                            <p>Read a transcript file with metadata.</p>
                        </div>
                        <div className="tool-card">
                            <h4>protokoll_context_status</h4>
                            <p>Check your configured context (people, projects, terms).</p>
                        </div>
                        <div className="tool-card">
                            <h4>protokoll_add_person</h4>
                            <p>Add a person to your context for name recognition.</p>
                        </div>
                        <div className="tool-card">
                            <h4>protokoll_add_project</h4>
                            <p>Add a project to enable intelligent routing.</p>
                        </div>
                        <div className="tool-card">
                            <h4>protokoll_add_term</h4>
                            <p>Add technical terms for domain-specific vocabulary.</p>
                        </div>
                        <div className="tool-card">
                            <h4>protokoll_provide_feedback</h4>
                            <p>Correct transcript errors with natural language.</p>
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
