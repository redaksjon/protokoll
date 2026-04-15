import React from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'

function Context() {
    return (
        <Layout>
            <header className="page-header">
                <div className="container">
                    <nav className="breadcrumb">
                        <Link to="/">Home</Link>
                        <span className="breadcrumb-sep">/</span>
                        <span>Context</span>
                    </nav>
                    <h1>Context System</h1>
                    <p className="page-desc">
                        Teach Protokoll about your world. Define people, projects, companies, and terms
                        for smarter transcriptions.
                    </p>
                </div>
            </header>

            <section className="page-section">
                <div className="container">
                    <h2>How Context Works</h2>
                    <p>Protokoll uses a YAML-based context system stored in a <code>.protokoll</code> directory. This context travels with your server, so every transcription benefits from your configured knowledge.</p>
                    
                    <div className="context-structure">
                        <div className="context-tree">
                            <div className="context-folder">~/.protokoll/</div>
                            <div className="context-folder context-indent">context/</div>
                            <div className="context-folder context-indent-2">people/</div>
                            <div className="context-file context-indent-3">priya-sharma.yaml</div>
                            <div className="context-file context-indent-3">john-chen.yaml</div>
                            <div className="context-folder context-indent-2">projects/</div>
                            <div className="context-file context-indent-3">protokoll.yaml</div>
                            <div className="context-file context-indent-3">acme-corp.yaml</div>
                            <div className="context-folder context-indent-2">terms/</div>
                            <div className="context-file context-indent-3">kubernetes.yaml</div>
                            <div className="context-folder context-indent-2">companies/</div>
                            <div className="context-file context-indent-3">acme-corp.yaml</div>
                            <div className="context-file context-indent-2">protokoll-config.yaml</div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>People</h2>
                    <p>Define people to help Protokoll recognize names that Whisper might mishear:</p>
                    
                    <div className="example-file">
                        <div className="example-file-header">
                            <span className="example-file-icon">P</span>
                            <span>people/priya-sharma.yaml</span>
                        </div>
                        <pre className="example-file-content">{`id: priya-sharma
name: Priya Sharma
role: Engineering Manager
company: acme-corp
sounds_like:
  - "pre a"
  - "pria"
  - "preeya"
context: "Met at the CloudConf 2025"`}</pre>
                    </div>

                    <h3>Using MCP Tools</h3>
                    <p>Protokoll is an MCP server — you invoke these tools through your AI assistant, not via a CLI.</p>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Add a person</span></div>
                        <div className="code-line">protokoll_add_person</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># Key parameters:</span></div>
                        <div className="code-line"><span className="code-dim">  name: "Priya Sharma"</span></div>
                        <div className="code-line"><span className="code-dim">  id: "priya-sharma"</span></div>
                        <div className="code-line"><span className="code-dim">  company: "acme-corp"</span></div>
                        <div className="code-line"><span className="code-dim">  role: "Engineering Manager"</span></div>
                        <div className="code-line"><span className="code-dim">  sounds_like: ["pre a", "pria", "preeya"]</span></div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># List all people</span></div>
                        <div className="code-line">protokoll_list_people</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Projects</h2>
                    <p>Define projects to enable intelligent routing. Transcripts are automatically saved to the correct location:</p>
                    
                    <div className="example-file">
                        <div className="example-file-header">
                            <span className="example-file-icon">P</span>
                            <span>projects/protokoll.yaml</span>
                        </div>
                        <pre className="example-file-content">{`id: protokoll
name: Protokoll
description: Intelligent audio transcription system
destination: ~/notes/protokoll
structure: month
contextType: work
sounds_like:
  - "protocol"
  - "pro to call"
  - "proto call"
topics:
  - audio
  - transcription
  - mcp
explicit_phrases:
  - "protokoll"
  - "transcription system"`}</pre>
                    </div>

                    <h3>Smart Project Creation</h3>
                    <p>Use AI to generate project metadata from a GitHub repo or documentation:</p>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Add a project with smart assist</span></div>
                        <div className="code-line">protokoll_add_project</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># Key parameters:</span></div>
                        <div className="code-line"><span className="code-dim">  name: "Protokoll"</span></div>
                        <div className="code-line"><span className="code-dim">  useSmartAssist: true</span></div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># List all projects</span></div>
                        <div className="code-line">protokoll_list_projects</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Terms</h2>
                    <p>Define technical terms, abbreviations, and domain-specific vocabulary:</p>
                    
                    <div className="example-file">
                        <div className="example-file-header">
                            <span className="example-file-icon">T</span>
                            <span>terms/kubernetes.yaml</span>
                        </div>
                        <pre className="example-file-content">{`id: kubernetes
term: Kubernetes
expansion: K8s
domain: devops
description: Container orchestration platform
sounds_like:
  - "k8s"
  - "kube"
  - "cube er net ease"
topics:
  - containers
  - orchestration
  - cloud`}</pre>
                    </div>

                    <h3>MCP Tool Examples</h3>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Add a term</span></div>
                        <div className="code-line">protokoll_add_term</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># Key parameters:</span></div>
                        <div className="code-line"><span className="code-dim">  term: "Kubernetes"</span></div>
                        <div className="code-line"><span className="code-dim">  expansion: "K8s"</span></div>
                        <div className="code-line"><span className="code-dim">  domain: "devops"</span></div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># List all terms</span></div>
                        <div className="code-line">protokoll_list_terms</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Companies</h2>
                    <p>Define companies for better organization recognition:</p>
                    
                    <div className="example-file">
                        <div className="example-file-header">
                            <span className="example-file-icon">C</span>
                            <span>companies/acme-corp.yaml</span>
                        </div>
                        <pre className="example-file-content">{`id: acme-corp
name: Acme Corporation
fullName: Acme Corporation Inc.
industry: Technology
sounds_like:
  - "a c m e"
  - "ack-me"
  - "ah-kee-mee"`}</pre>
                    </div>

                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Add a company</span></div>
                        <div className="code-line">protokoll_add_company</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># List all companies</span></div>
                        <div className="code-line">protokoll_list_companies</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Context Management</h2>
                    
                    <h3>Check Status</h3>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Check context status</span></div>
                        <div className="code-line">protokoll_context_status</div>
                    </div>

                    <h3>Search Context</h3>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Search across all entity types</span></div>
                        <div className="code-line">protokoll_search_context</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># Key parameter:</span></div>
                        <div className="code-line"><span className="code-dim">  query: "acme"</span></div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># List specific entity types</span></div>
                        <div className="code-line">protokoll_list_people</div>
                        <div className="code-line">protokoll_list_projects</div>
                        <div className="code-line">protokoll_list_terms</div>
                        <div className="code-line">protokoll_list_companies</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Learning from Corrections</h2>
                    <p>When you correct a transcript, Protokoll learns for future transcriptions:</p>
                    
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">Transcript Correction</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-dim">Original: "Meeting with pre a about k8s"</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Corrected: "Meeting with Priya Sharma about Kubernetes"</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-success">✓ Updated person "priya-sharma" sounds_like array</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-success">✓ Updated term "kubernetes" sounds_like array</span>
                            </div>
                        </div>
                    </div>

                    <p>Protokoll automatically adds the phonetic variants it encountered to your context, so future transcriptions will be more accurate.</p>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <div className="next-steps-grid">
                        <Link to="/ai-assistants" className="next-step-card">
                            <h4>Connect an AI Assistant</h4>
                            <p>Start using your configured context with your AI assistant.</p>
                            <span className="next-step-link">AI Assistants →</span>
                        </Link>
                        <Link to="/install" className="next-step-card">
                            <h4>Back to Installation</h4>
                            <p>Review the installation guide if needed.</p>
                            <span className="next-step-link">Installation →</span>
                        </Link>
                    </div>
                </div>
            </section>
        </Layout>
    )
}

export default Context
