import React from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'

function Install() {
    return (
        <Layout>
            <header className="page-header">
                <div className="container">
                    <nav className="breadcrumb">
                        <Link to="/">Home</Link>
                        <span className="breadcrumb-sep">/</span>
                        <span>Installation</span>
                    </nav>
                    <h1>Installation</h1>
                    <p className="page-desc">
                        Install the Protokoll MCP server and configure it for first use.
                    </p>
                </div>
            </header>

            <section className="page-section">
                <div className="container">
                    <h2>Prerequisites</h2>
                    <div className="prereq-grid">
                        <div className="prereq-card">
                            <div className="prereq-icon">ffmpeg</div>
                            <h4>ffmpeg</h4>
                            <p>Required for audio conversion. Install via your package manager:</p>
                            <div className="code-block">
                                <div className="code-line"># macOS</div>
                                <div className="code-line">brew install ffmpeg</div>
                                <div className="code-line"></div>
                                <div className="code-line"># Ubuntu/Debian</div>
                                <div className="code-line">sudo apt install ffmpeg</div>
                                <div className="code-line"></div>
                                <div className="code-line"># Windows (with WSL)</div>
                                <div className="code-line">sudo apt install ffmpeg</div>
                            </div>
                        </div>
                        <div className="prereq-card">
                            <div className="prereq-icon">key</div>
                            <h4>OpenAI API Key</h4>
                            <p>Required for transcription. Get one from platform.openai.com</p>
                            <div className="code-block">
                                <div className="code-line"># Add to your shell profile</div>
                                <div className="code-line">export OPENAI_API_KEY='sk-...'</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Quick Install</h2>
                    <p>Install the server globally with npm:</p>
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">Terminal</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">npm install -g @redaksjon/protokoll</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-success">✓ Installed @redaksjon/protokoll@latest</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Configuration</h2>
                    <p>Create a <code>.protokoll</code> configuration directory in your home folder:</p>
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">Terminal</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">mkdir -p ~/.protokoll</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">cd ~/.protokoll</span>
                            </div>
                        </div>
                    </div>

                    <h3>Environment Variables</h3>
                    <p>Create a <code>.env</code> file in your configuration directory:</p>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Required: OpenAI API key for Whisper transcription</span></div>
                        <div className="code-line">OPENAI_API_KEY=sk-...</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># Optional: Protokoll license key (if applicable)</span></div>
                        <div className="code-line">PROTOKOLL_LICENSE_KEY=pk_live_...</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># Optional: Default output directory for transcripts</span></div>
                        <div className="code-line">PROTOKOLL_OUTPUT_DIR=~/notes</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Test Your Installation</h2>
                    <p>Start the server to verify everything is working:</p>
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">Terminal</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">protokoll</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-highlight">[Protokoll MCP Server]</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Server running at http://localhost:3000</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">MCP endpoint: http://localhost:3000/mcp</span>
                            </div>
                        </div>
                    </div>

                    <div className="callout callout-info">
                        <h4>Server Modes</h4>
                        <p>Protokoll runs as an HTTP MCP server by default. You can configure it for local-only access or expose it for remote connections. See the <Link to="/deploy">Deployment guide</Link> for details.</p>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Next Steps</h2>
                    <div className="next-steps-grid">
                        <Link to="/ai-assistants" className="next-step-card">
                            <h4>Connect an AI Assistant</h4>
                            <p>Configure Cursor, Claude Desktop, or another MCP client to use Protokoll.</p>
                            <span className="next-step-link">View guides →</span>
                        </Link>
                        <Link to="/deploy" className="next-step-card">
                            <h4>Deploy the Server</h4>
                            <p>Learn about different deployment options including Docker and cloud hosting.</p>
                            <span className="next-step-link">View options →</span>
                        </Link>
                        <Link to="/context" className="next-step-card">
                            <h4>Set Up Context</h4>
                            <p>Add people, projects, and terms to improve transcription accuracy.</p>
                            <span className="next-step-link">Learn more →</span>
                        </Link>
                    </div>
                </div>
            </section>
        </Layout>
    )
}

export default Install
