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
                            <div className="context-file context-indent-2">.protokoll.yaml</div>
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

                    <h3>Using the CLI</h3>
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">protokoll person add</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-highlight">[Add New Person]</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Full name: </span>
                                <span className="terminal-user">Priya Sharma</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">ID (Enter for "priya-sharma"): </span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Company ID: </span>
                                <span className="terminal-user">acme-corp</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Role: </span>
                                <span className="terminal-user">Engineering Manager</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Sounds like: </span>
                                <span className="terminal-user">pre a, pria, preeya</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-success">Person "Priya Sharma" saved successfully.</span>
                            </div>
                        </div>
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
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">protokoll project add --smart</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-highlight">[Add New Project - Smart Mode]</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Fetching content from source...</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Analyzing content...</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-highlight">[Generated Metadata]</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">  Name: Protokoll</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">  Description: Intelligent audio transcription...</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">  Sounds like: protocol, pro to call...</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">  Topics: audio, transcription, mcp</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-success">Project "Protokoll" saved successfully.</span>
                            </div>
                        </div>
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

                    <h3>CLI Examples</h3>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Add a term interactively</span></div>
                        <div className="code-line">protokoll term add</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># Add with all options</span></div>
                        <div className="code-line">protokoll term add --term "Kubernetes" --expansion "K8s" --domain devops</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># List all terms</span></div>
                        <div className="code-line">protokoll term list</div>
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
                        <div className="code-line">protokoll company add</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># List all companies</span></div>
                        <div className="code-line">protokoll company list</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Context Management</h2>
                    
                    <h3>Check Status</h3>
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">protokoll context status</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-highlight">[Protokoll Context Status]</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Context directory: /home/user/.protokoll</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">People: 12</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Projects: 5</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Terms: 28</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Companies: 3</span>
                            </div>
                        </div>
                    </div>

                    <h3>Search Context</h3>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Search across all entity types</span></div>
                        <div className="code-line">protokoll context search "acme"</div>
                        <div className="code-line"></div>
                        <div className="code-line"><span className="code-comment"># List specific entity types</span></div>
                        <div className="code-line">protokoll person list</div>
                        <div className="code-line">protokoll project list</div>
                        <div className="code-line">protokoll term list</div>
                        <div className="code-line">protokoll company list</div>
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
