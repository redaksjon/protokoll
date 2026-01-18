import React from 'react'

function App() {
    return (
        <div className="site">
            {/* Hero Section */}
            <header className="hero">
                <div className="hero-glow"></div>
                <div className="hero-content">
                    <div className="badge">Intelligent Audio Transcription</div>
                    <h1 className="title">Protokoll</h1>
                    <p className="tagline">
                        Transform voice memos into perfectly organized, context-aware notes.
                        <br />
                        <span className="highlight">Whisper mishears names. Protokoll fixes them.</span>
                    </p>
                    <div className="hero-actions">
                        <a href="https://www.npmjs.com/package/@redaksjon/protokoll" className="btn btn-primary" target="_blank" rel="noopener noreferrer">
                            npm install -g @redaksjon/protokoll
                        </a>
                        <a href="https://github.com/redaksjon/protokoll" className="btn btn-secondary" target="_blank" rel="noopener noreferrer">
                            View on GitHub
                        </a>
                    </div>
                </div>
            </header>

            {/* Problem Statement */}
            <section className="problem-section">
                <div className="container">
                    <h2 className="section-title">The Transcription Problem</h2>
                    <div className="problem-grid">
                        <div className="problem-card">
                            <div className="problem-icon problem-icon-text">1</div>
                            <h3>Whisper Mishears</h3>
                            <p>"Priya" becomes "pre a"<br/>"Kubernetes" becomes "cube er net ease"</p>
                        </div>
                        <div className="problem-card">
                            <div className="problem-icon problem-icon-text">2</div>
                            <h3>Notes Go Everywhere</h3>
                            <p>Work notes in personal folders<br/>Client calls mixed with internal meetings</p>
                        </div>
                        <div className="problem-card">
                            <div className="problem-icon problem-icon-text">3</div>
                            <h3>Manual Organization</h3>
                            <p>30% of your time fixing and organizing<br/>what transcription services got wrong</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Before/After Demo */}
            <section className="demo-section">
                <div className="container">
                    <h2 className="section-title">See the Difference</h2>
                    <div className="demo-grid">
                        <div className="demo-card demo-before">
                            <div className="demo-label">Raw Whisper Output</div>
                            <div className="demo-content">
                                <p className="demo-text">
                                    "Meeting with pre a and john about the cube er net ease deployment. 
                                    She mentioned that a c m e corp wants to move to the cloud by q one. 
                                    Need to follow up with dev ops team about the time line."
                                </p>
                            </div>
                        </div>
                        <div className="demo-arrow">→</div>
                        <div className="demo-card demo-after">
                            <div className="demo-label">Protokoll Enhanced</div>
                            <div className="demo-content">
                                <p className="demo-text">
                                    "Meeting with <span className="corrected">Priya Sharma</span> and <span className="corrected">John Chen</span> about the <span className="corrected">Kubernetes</span> deployment. 
                                    She mentioned that <span className="corrected">Acme Corp</span> wants to move to the cloud by <span className="corrected">Q1</span>. 
                                    Need to follow up with <span className="corrected">DevOps</span> team about the timeline."
                                </p>
                                <div className="demo-meta">
                                    <span className="meta-item">Routed to: ~/work/acme-corp/notes/</span>
                                    <span className="meta-item">Tags: meeting, kubernetes, acme</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Context System - Hero Feature */}
            <section className="context-section">
                <div className="container">
                    <div className="context-header">
                        <h2 className="section-title">The Context System</h2>
                        <p className="section-subtitle">
                            Protokoll learns your world. Define people, projects, companies, and technical terms once.
                            <br/>Every transcription gets smarter automatically.
                        </p>
                    </div>
                    
                    <div className="context-demo">
                        <div className="context-files">
                            <div className="file-card">
                                <div className="file-header">
                                    <span className="file-icon file-icon-text">P</span>
                                    <span className="file-name">people/priya-sharma.yaml</span>
                                </div>
                                <pre className="file-content">{`id: priya-sharma
name: Priya Sharma
role: Engineering Manager
company: acme-corp
sounds_like:
  - "pre a"
  - "pria"
  - "preeya"`}</pre>
                            </div>
                            <div className="file-card">
                                <div className="file-header">
                                    <span className="file-icon file-icon-text">C</span>
                                    <span className="file-name">companies/acme-corp.yaml</span>
                                </div>
                                <pre className="file-content">{`id: acme-corp
name: Acme Corporation
sounds_like:
  - "acme"
  - "a c m e"
  - "acme corp"`}</pre>
                            </div>
                            <div className="file-card">
                                <div className="file-header">
                                    <span className="file-icon file-icon-text">R</span>
                                    <span className="file-name">projects/protokoll.yaml</span>
                                </div>
                                <pre className="file-content">{`id: protokoll
destination: ~/work/notes
explicit_phrases:
  - "work on protokoll"
  - "protokoll project"
sounds_like:
  - "protocol"
  - "pro to call"`}</pre>
                            </div>
                            <div className="file-card">
                                <div className="file-header">
                                    <span className="file-icon file-icon-text">T</span>
                                    <span className="file-name">terms/kubernetes.yaml</span>
                                </div>
                                <pre className="file-content">{`id: kubernetes
term: Kubernetes
sounds_like:
  - "cube er net ease"
  - "kube"
  - "k8s"`}</pre>
                            </div>
                        </div>
                    </div>
                    
                    <div className="context-features">
                        <div className="context-feature">
                            <div className="feature-number">01</div>
                            <h3>Hierarchical Discovery</h3>
                            <p>Context files are discovered walking up the directory tree. Project-specific context overrides global settings.</p>
                        </div>
                        <div className="context-feature">
                            <div className="feature-number">02</div>
                            <h3>Phonetic Matching</h3>
                            <p>The <code>sounds_like</code> field maps common mishearings to correct spellings automatically.</p>
                        </div>
                        <div className="context-feature">
                            <div className="feature-number">03</div>
                            <h3>Grows Over Time</h3>
                            <p>Add new people and terms as you encounter them. Each session makes Protokoll smarter.</p>
                </div>
                </div>
                </div>
            </section>

            {/* Interactive Mode */}
            <section className="interactive-section">
                <div className="container">
                    <div className="interactive-content">
                        <div className="interactive-text">
                            <h2 className="section-title">Interactive Learning Mode</h2>
                            <p className="section-subtitle">
                                Don't know who "pre a" is? Protokoll asks. Then remembers forever.
                            </p>
                            
                            <div className="terminal-demo">
                                <div className="terminal-header">
                                    <span className="terminal-dot red"></span>
                                    <span className="terminal-dot yellow"></span>
                                    <span className="terminal-dot green"></span>
                                    <span className="terminal-title">protokoll --interactive</span>
                                </div>
                                <div className="terminal-body">
                                    <div className="terminal-line">
                                        <span className="terminal-prompt">?</span>
                                        <span className="terminal-question">Name Clarification Needed</span>
                                    </div>
                                    <div className="terminal-line indent">
                                        <span className="terminal-dim">Context: "...meeting with pre a about..."</span>
                                    </div>
                                    <div className="terminal-line indent">
                                        <span className="terminal-dim">Detected: </span>
                                        <span className="terminal-highlight">"pre a"</span>
                                    </div>
                                    <div className="terminal-line">
                                        <span className="terminal-prompt">→</span>
                                        <span className="terminal-input">Enter correct spelling: </span>
                                        <span className="terminal-user">Priya Sharma</span>
                                    </div>
                                    <div className="terminal-line">
                                        <span className="terminal-prompt">?</span>
                                        <span className="terminal-input">Remember for future? </span>
                                        <span className="terminal-success">Yes</span>
                                    </div>
                                    <div className="terminal-line">
                                        <span className="terminal-success">✓ Saved to ~/.protokoll/people/priya-sharma.yaml</span>
                                    </div>
                                </div>
                            </div>
                </div>

                        <div className="interactive-features">
                            <div className="interactive-feature">
                                <span className="feature-icon feature-icon-text">N</span>
                                <div>
                                    <h4>Name Corrections</h4>
                                    <p>Fix misspelled names and save phonetic variants</p>
                                </div>
                            </div>
                            <div className="interactive-feature">
                                <span className="feature-icon feature-icon-text">P</span>
                                <div>
                                    <h4>New People</h4>
                                    <p>Add company, role, and context for unknown people</p>
                                </div>
                            </div>
                            <div className="interactive-feature">
                                <span className="feature-icon feature-icon-text">R</span>
                                <div>
                                    <h4>Routing Decisions</h4>
                                    <p>Confirm or override where notes should be saved</p>
                                </div>
                            </div>
                            <div className="interactive-feature">
                                <span className="feature-icon feature-icon-text">V</span>
                                <div>
                                    <h4>Vocabulary</h4>
                                    <p>Define technical terms and domain-specific language</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Context Management Commands */}
            <section className="commands-section">
                <div className="container">
                    <h2 className="section-title">Context Management Commands</h2>
                    <p className="section-subtitle">
                        Manage your context entities directly from the command line.
                        No need to edit YAML files manually.
                    </p>
                    
                    <div className="commands-grid">
                        <div className="command-group">
                            <h4>Entity Commands</h4>
                            <div className="code-block">
                                <div className="code-line"><span className="code-comment"># List all entities</span></div>
                                <div className="code-line">protokoll project list</div>
                                <div className="code-line">protokoll person list</div>
                                <div className="code-line">protokoll term list</div>
                                <div className="code-line">protokoll company list</div>
                                <div className="code-line">protokoll ignored list</div>
                            </div>
                        </div>
                        <div className="command-group">
                            <h4>View & Manage</h4>
                            <div className="code-block">
                                <div className="code-line"><span className="code-comment"># Show entity details</span></div>
                                <div className="code-line">protokoll person show priya-sharma</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># Add new entities (interactive)</span></div>
                                <div className="code-line">protokoll project add</div>
                                <div className="code-line">protokoll person add</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># Delete entities</span></div>
                                <div className="code-line">protokoll person delete john-smith</div>
                            </div>
                        </div>
                        <div className="command-group">
                            <h4>Context Overview</h4>
                            <div className="code-block">
                                <div className="code-line"><span className="code-comment"># Check context status</span></div>
                                <div className="code-line">protokoll context status</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># Search across all entities</span></div>
                                <div className="code-line">protokoll context search "acme"</div>
                            </div>
                        </div>
                        <div className="command-group">
                            <h4>Smart Project Creation</h4>
                            <div className="code-block">
                                <div className="code-line"><span className="code-comment"># AI-assisted project creation</span></div>
                                <div className="code-line">protokoll project add --smart</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># Non-interactive: trust AI suggestions</span></div>
                                <div className="code-line">protokoll project add --name "My Project" --yes</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># From GitHub repo</span></div>
                                <div className="code-line">protokoll project add https://github.com/org/repo</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># From local file</span></div>
                                <div className="code-line">protokoll project add ./README.md</div>
                            </div>
                        </div>
                    </div>

                    <div className="terminal-demo" style={{marginTop: '2rem'}}>
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
                            <div className="terminal-line"></div>
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
                                <span className="terminal-user">Product Manager</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Sounds like: </span>
                                <span className="terminal-user">pre a, pria, preeya</span>
                            </div>
                            <div className="terminal-line"></div>
                            <div className="terminal-line">
                                <span className="terminal-success">Person "Priya Sharma" saved successfully.</span>
                            </div>
                        </div>
                    </div>

                    <div className="terminal-demo" style={{marginTop: '2rem'}}>
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">protokoll project add https://github.com/org/repo</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-highlight">[Add New Project]</span>
                            </div>
                            <div className="terminal-line"></div>
                            <div className="terminal-line">
                                <span className="terminal-dim">[Fetching content from source...]</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Found: github - org/repo</span>
                            </div>
                            <div className="terminal-line"></div>
                            <div className="terminal-line">
                                <span className="terminal-dim">[Analyzing content...]</span>
                            </div>
                            <div className="terminal-line"></div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Project name: </span>
                                <span className="terminal-user">Protokoll</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">ID (Enter for "protokoll"): </span>
                            </div>
                            <div className="terminal-line"></div>
                            <div className="terminal-line">
                                <span className="terminal-highlight">[Generating phonetic variants...]</span>
                            </div>
                            <div className="terminal-line indent">
                                <span className="terminal-dim">  (Phonetic variants help when Whisper mishears the project name)</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Sounds like (Enter for suggested, or edit):</span>
                            </div>
                            <div className="terminal-line indent">
                                <span className="terminal-ai">  protocol,pro to call,proto call,protocolle,...</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-user">&gt; </span>
                            </div>
                            <div className="terminal-line"></div>
                            <div className="terminal-line">
                                <span className="terminal-highlight">[Generating trigger phrases...]</span>
                            </div>
                            <div className="terminal-line indent">
                                <span className="terminal-dim">  (Trigger phrases indicate content belongs to this project)</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Trigger phrases (Enter for suggested, or edit):</span>
                            </div>
                            <div className="terminal-line indent">
                                <span className="terminal-ai">  protokoll,working on protokoll,protokoll meeting,...</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-user">&gt; </span>
                            </div>
                            <div className="terminal-line"></div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Topic keywords (Enter for suggested, or edit):</span>
                            </div>
                            <div className="terminal-line indent">
                                <span className="terminal-ai">  typescript,transcription,audio,automation,...</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-user">&gt; </span>
                            </div>
                            <div className="terminal-line"></div>
                            <div className="terminal-line">
                                <span className="terminal-success">Project "Protokoll" saved successfully.</span>
                            </div>
                        </div>
                    </div>

                    <div className="context-features" style={{marginTop: '2rem'}}>
                        <div className="context-feature">
                            <div className="feature-number">T</div>
                            <h3>Trigger Phrases</h3>
                            <p>High-confidence content matching. Routes transcripts when these phrases appear in your audio.</p>
                        </div>
                        <div className="context-feature">
                            <div className="feature-number">S</div>
                            <h3>Sounds Like</h3>
                            <p>Phonetic variants for when Whisper mishears the project name itself. Great for Norwegian names!</p>
                        </div>
                        <div className="context-feature">
                            <div className="feature-number">K</div>
                            <h3>Topic Keywords</h3>
                            <p>Lower-confidence theme associations. Helps with classification but shouldn't be relied on alone.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Self-Reflection */}
            <section className="reflection-section">
                <div className="container">
                    <h2 className="section-title">Self-Reflection Reports</h2>
                    <p className="section-subtitle">
                        Protokoll tells you how well it's working. Enabled by default.
                    </p>
                    
                    <div className="reflection-demo">
                        <div className="reflection-card">
                            <div className="reflection-header">
                                Self-Reflection Report
                            </div>
                            <div className="reflection-body">
                                <div className="reflection-row">
                                    <span className="reflection-label">Duration</span>
                                    <span className="reflection-value">8.3s</span>
                                </div>
                                <div className="reflection-row">
                                    <span className="reflection-label">Tool Calls</span>
                                    <span className="reflection-value">7</span>
                                </div>
                                <div className="reflection-row">
                                    <span className="reflection-label">Confidence</span>
                                    <span className="reflection-value highlight">92.5%</span>
                                </div>
                                <div className="reflection-divider"></div>
                                <div className="reflection-tools">
                                    <div className="tool-row">
                                        <span>lookup_person</span>
                                        <span className="tool-success">3 calls - 100%</span>
                                    </div>
                                    <div className="tool-row">
                                        <span>lookup_project</span>
                                        <span className="tool-success">2 calls - 100%</span>
                                    </div>
                                    <div className="tool-row">
                                        <span>route_note</span>
                                        <span className="tool-success">1 call - 100%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Transcript Actions */}
            <section className="actions-section">
                <div className="container">
                    <h2 className="section-title">Transcript Actions</h2>
                    <p className="section-subtitle">
                        Edit single transcripts or combine multiple notes. Reorganize by project.
                    </p>
                    
                    <div className="actions-demo">
                        <div className="action-card">
                            <div className="action-header">
                                <h4>Edit & Combine</h4>
                            </div>
                            <p className="action-description">
                                Change titles, move between projects, or merge related transcripts.
                                Source files are auto-deleted when combining.
                            </p>
                            <div className="code-block">
                                <div className="code-line"><span className="code-comment"># Edit a single transcript</span></div>
                                <div className="code-line">protokoll action --title "Time to Celebrate" /path/to/file.md</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># Combine multiple transcripts</span></div>
                                <div className="code-line">protokoll action --title "Full Meeting" --combine "/path/to/part1.md</div>
                                <div className="code-line">/path/to/part2.md"</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># Change project (with routing)</span></div>
                                <div className="code-line">protokoll action --project client-alpha /path/to/file.md</div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="actions-features">
                        <div className="action-feature">
                            <span className="feature-icon feature-icon-text">T</span>
                            <div>
                                <h4>Custom Titles</h4>
                                <p>--title updates document heading and renames the file</p>
                            </div>
                        </div>
                        <div className="action-feature">
                            <span className="feature-icon feature-icon-text">P</span>
                            <div>
                                <h4>Project Routing</h4>
                                <p>--project updates metadata and moves to project destination</p>
                            </div>
                        </div>
                        <div className="action-feature">
                            <span className="feature-icon feature-icon-text">C</span>
                            <div>
                                <h4>Smart Combine</h4>
                                <p>--combine merges files chronologically with auto-cleanup</p>
                            </div>
                        </div>
                        <div className="action-feature">
                            <span className="feature-icon feature-icon-text">M</span>
                            <div>
                                <h4>Metadata Merging</h4>
                                <p>Combines durations, deduplicates tags, preserves timestamps</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feedback System */}
            <section className="feedback-section">
                <div className="container">
                    <h2 className="section-title">Intelligent Feedback</h2>
                    <p className="section-subtitle">
                        Describe problems in plain English. Protokoll understands and fixes them automatically.
                    </p>
                    
                    <div className="feedback-demo">
                        <div className="feedback-card">
                            <div className="feedback-header">
                                <h4>Natural Language Corrections</h4>
                            </div>
                            <p className="feedback-description">
                                Tell Protokoll what's wrong in plain English. It corrects the transcript AND learns for the future.
                            </p>
                            <div className="code-block">
                                <div className="code-line"><span className="code-comment"># Fix a term and teach it</span></div>
                                <div className="code-line">protokoll feedback notes.md -f "WCMP should be WCNP"</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># Fix a name</span></div>
                                <div className="code-line">protokoll feedback notes.md -f "San Jay Grouper is Sanjay Gupta"</div>
                                <div className="code-line"></div>
                                <div className="code-line"><span className="code-comment"># Reassign to different project</span></div>
                                <div className="code-line">protokoll feedback notes.md -f "This should be in Quantum project"</div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="feedback-features">
                        <div className="feedback-feature">
                            <span className="feature-icon feature-icon-text">T</span>
                            <div>
                                <h4>Term Corrections</h4>
                                <p>Fix abbreviations and add them to your vocabulary</p>
                            </div>
                        </div>
                        <div className="feedback-feature">
                            <span className="feature-icon feature-icon-text">N</span>
                            <div>
                                <h4>Name Corrections</h4>
                                <p>Fix names and teach phonetic variants</p>
                            </div>
                        </div>
                        <div className="feedback-feature">
                            <span className="feature-icon feature-icon-text">P</span>
                            <div>
                                <h4>Project Assignment</h4>
                                <p>Move transcripts to the right project</p>
                            </div>
                        </div>
                        <div className="feedback-feature">
                            <span className="feature-icon feature-icon-text">L</span>
                            <div>
                                <h4>Context Learning</h4>
                                <p>Corrections become future knowledge</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Routing System */}
            <section className="routing-section">
                <div className="container">
                    <h2 className="section-title">Intelligent Routing</h2>
                    <p className="section-subtitle">
                        Notes automatically go to the right place. Work stays in work folders. Personal stays personal.
                    </p>
                    
                    <div className="routing-demo">
                        <div className="routing-flow">
                            <div className="routing-input">
                                <div className="routing-icon routing-icon-text">IN</div>
                                <span>"This is a work meeting about the sprint planning..."</span>
                            </div>
                            <div className="routing-arrow">
                                <div className="arrow-line"></div>
                                <div className="routing-signals">
                                    <span className="signal">trigger: "work meeting"</span>
                                    <span className="signal">trigger: "sprint"</span>
                                    <span className="signal">confidence: 95%</span>
                                </div>
                            </div>
                            <div className="routing-output">
                                <div className="routing-icon routing-icon-text">OUT</div>
                                <span>~/work/notes/2026/01/sprint-planning.md</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="routing-features">
                        <div className="routing-feature">
                            <h4>Multi-Signal Classification</h4>
                            <p>Analyzes trigger phrases, mentioned people, companies, and topic keywords</p>
                        </div>
                        <div className="routing-feature">
                            <h4>Confidence Scoring</h4>
                            <p>Each signal contributes to a confidence score. Highest confidence wins.</p>
                        </div>
                        <div className="routing-feature">
                            <h4>Flexible Structure</h4>
                            <p>Organize by year, month, day, or flat. Choose what works for you.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Proactive Phonetic with Observasjon */}
            <section className="proactive-section">
                <div className="container">
                    <h2 className="section-title">Proactive Phonetic Enhancement</h2>
                    <p className="section-subtitle">
                        Protokoll and Observasjon work together for the most accurate transcriptions possible.
                        <br/>Your project data fixes names <strong>during</strong> transcription, not after.
                    </p>
                    
                    <div className="proactive-hero">
                        <div className="proactive-flow">
                            <div className="proactive-step">
                                <div className="proactive-number">1</div>
                                <h4>Define in Protokoll</h4>
                                <div className="code-block">
                                    <div className="code-line">protokoll project add</div>
                                    <div className="code-line"><span className="terminal-dim">Name: </span>Observasjon</div>
                                    <div className="code-line"><span className="terminal-dim">Sounds like: </span>observation, observashun</div>
                                </div>
                            </div>
                            <div className="proactive-arrow">→</div>
                            <div className="proactive-step">
                                <div className="proactive-number">2</div>
                                <h4>Observasjon Detects</h4>
                                <p className="proactive-detail">
                                    Automatically finds projects in<br/>
                                    <code>~/.protokoll/context/projects/</code>
                                </p>
                            </div>
                            <div className="proactive-arrow">→</div>
                            <div className="proactive-step">
                                <div className="proactive-number">3</div>
                                <h4>Whisper Gets It Right</h4>
                                <p className="proactive-detail highlight">
                                    "Observasjon" ✓<br/>
                                    <span className="crossed">not "observation" ✗</span>
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="proactive-benefits">
                        <div className="benefit-card">
                            <div className="benefit-icon">A</div>
                            <h4>Better Accuracy</h4>
                            <p>Project names spelled correctly from the start</p>
                        </div>
                        <div className="benefit-card">
                            <div className="benefit-icon">$</div>
                            <h4>Lower Cost</h4>
                            <p>~$0.0045 per transcription for 30 projects<br/>Eliminates correction passes</p>
                        </div>
                        <div className="benefit-card">
                            <div className="benefit-icon">C</div>
                            <h4>Zero Configuration</h4>
                            <p>Works automatically if you use both tools<br/>Enabled by default</p>
                        </div>
                        <div className="benefit-card">
                            <div className="benefit-icon">S</div>
                            <h4>Smart Defaults</h4>
                            <p>Auto-enabled for ≤50 projects<br/>Override with CLI flags</p>
                        </div>
                    </div>
                    
                    <div className="proactive-example">
                        <h3>How It Works</h3>
                        <div className="example-grid">
                            <div className="example-step">
                                <h4>In Protokoll</h4>
                                <div className="code-block">
                                    <div className="code-line"># ~/.protokoll/context/projects/observasjon.yaml</div>
                                    <div className="code-line">id: observasjon</div>
                                    <div className="code-line">name: Observasjon</div>
                                    <div className="code-line">sounds_like:</div>
                                    <div className="code-line">  - observation</div>
                                    <div className="code-line">  - observashun</div>
                                    <div className="code-line">  - observe a shun</div>
                                </div>
                            </div>
                            <div className="example-step">
                                <h4>In Observasjon</h4>
                                <div className="code-block">
                                    <div className="code-line"># Just run normally!</div>
                                    <div className="code-line">observasjon --input-directory ./recordings</div>
                                    <div className="code-line"></div>
                                    <div className="code-line terminal-success">✓ Loaded 30 projects for proactive phonetic</div>
                                    <div className="code-line terminal-dim">  (~1,520 tokens, ~$0.0045)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="proactive-cli">
                        <h3>CLI Options (Optional)</h3>
                        <div className="code-block">
                            <div className="code-line"><span className="code-comment"># Disable proactive phonetic</span></div>
                            <div className="code-line">observasjon --no-proactive-phonetic --input-directory ./recordings</div>
                            <div className="code-line"></div>
                            <div className="code-line"><span className="code-comment"># Force enable even if >50 projects (accepts higher cost)</span></div>
                            <div className="code-line">observasjon --force-proactive-phonetic --input-directory ./recordings</div>
                        </div>
                    </div>
                    
                    <div className="integration-note">
                        <p><strong>New to Observasjon?</strong> Install it alongside Protokoll:</p>
                        <div className="code-block">
                            <div className="code-line">npm install -g @redaksjon/observasjon</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Quick Start */}
            <section className="quickstart-section">
                <div className="container">
                    <h2 className="section-title">Get Started in 60 Seconds</h2>
                    
                    <div className="quickstart-steps">
                        <div className="step">
                            <div className="step-number">1</div>
                            <div className="step-content">
                                <h4>Install</h4>
                                <code>npm install -g @redaksjon/protokoll</code>
                            </div>
                        </div>
                        <div className="step">
                            <div className="step-number">2</div>
                            <div className="step-content">
                                <h4>Set API Key</h4>
                                <code>export OPENAI_API_KEY='sk-...'</code>
                            </div>
                        </div>
                        <div className="step">
                            <div className="step-number">3</div>
                            <div className="step-content">
                                <h4>Transcribe</h4>
                                <code>protokoll --input-directory ~/recordings</code>
                            </div>
                        </div>
                    </div>
                    
                    <div className="quickstart-examples">
                        <h3>Common Commands</h3>
                        <div className="code-block">
                            <div className="code-line"><span className="code-comment"># Basic transcription (self-reflection enabled by default)</span></div>
                            <div className="code-line">protokoll --input-directory ~/recordings</div>
                            <div className="code-line"></div>
                            <div className="code-line"><span className="code-comment"># Interactive mode - learn as you go</span></div>
                            <div className="code-line">protokoll --input-directory ~/recordings --interactive</div>
                            <div className="code-line"></div>
                            <div className="code-line"><span className="code-comment"># Use Claude for better name recognition</span></div>
                            <div className="code-line">protokoll --input-directory ~/recordings --model claude-3-5-sonnet</div>
                            <div className="code-line"></div>
                            <div className="code-line"><span className="code-comment"># Debug mode with verbose output</span></div>
                            <div className="code-line">protokoll --input-directory ~/recordings --debug --verbose</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* MCP Integration */}
            <section className="mcp-section">
                <div className="container">
                    <h2 className="section-title">AI Assistant Integration (MCP)</h2>
                    <p className="section-subtitle">
                        Skip the command line. Let your AI assistant handle transcription directly.
                    </p>
                    
                    <div className="mcp-demo">
                        <div className="mcp-conversation">
                            <div className="mcp-message human">
                                <div className="mcp-label">You</div>
                                <p>"Can you transcribe ~/recordings/meeting.m4a?"</p>
                            </div>
                            <div className="mcp-message ai">
                                <div className="mcp-label">AI Assistant</div>
                                <p>"I found your Protokoll config with 3 projects. Based on the file location, I can't determine which project this belongs to. Is this for:<br/>
                                1. Client Alpha<br/>
                                2. Internal Notes<br/>
                                3. Personal"</p>
                            </div>
                            <div className="mcp-message human">
                                <div className="mcp-label">You</div>
                                <p>"It's for Client Alpha"</p>
                            </div>
                            <div className="mcp-message ai">
                                <div className="mcp-label">AI Assistant</div>
                                <p>"Done! Transcript saved to ~/notes/client-alpha/2026/01/meeting.md<br/>
                                <span className="mcp-detail">• Routed to Client Alpha (95% confidence)</span><br/>
                                <span className="mcp-detail">• Corrected 'San Jay' → 'Sanjay Gupta'</span><br/>
                                <span className="mcp-detail">• Added WCNP to vocabulary</span>"</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mcp-features">
                        <div className="mcp-feature">
                            <span className="feature-icon feature-icon-text">D</span>
                            <div>
                                <h4>Project-Aware Discovery</h4>
                                <p>Automatically finds and uses the right .protokoll configuration</p>
                            </div>
                        </div>
                        <div className="mcp-feature">
                            <span className="feature-icon feature-icon-text">C</span>
                            <div>
                                <h4>Context Management</h4>
                                <p>"Add Priya as a person - Whisper hears 'pre a'"</p>
                            </div>
                        </div>
                        <div className="mcp-feature">
                            <span className="feature-icon feature-icon-text">F</span>
                            <div>
                                <h4>Natural Feedback</h4>
                                <p>"WCMP should be WCNP in that transcript"</p>
                            </div>
                        </div>
                        <div className="mcp-feature">
                            <span className="feature-icon feature-icon-text">M</span>
                            <div>
                                <h4>Combine & Edit</h4>
                                <p>"Merge these three meeting parts into one"</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mcp-setup">
                        <h3>One-Time Setup</h3>
                        <p className="mcp-setup-subtitle">Add to <code>~/.cursor/mcp.json</code> or Claude Desktop config:</p>
                        <div className="code-block">
                            <div className="code-line">{`{`}</div>
                            <div className="code-line">  "mcpServers": {`{`}</div>
                            <div className="code-line">    "protokoll": {`{`}</div>
                            <div className="code-line">      "command": "npx",</div>
                            <div className="code-line">      "args": ["-y", "-p", "@redaksjon/protokoll", "protokoll-mcp"]</div>
                            <div className="code-line">    {`}`}</div>
                            <div className="code-line">  {`}`}</div>
                            <div className="code-line">{`}`}</div>
                        </div>
                        <p className="mcp-setup-alt">Or if installed globally (<code>npm install -g @redaksjon/protokoll</code>):</p>
                        <div className="code-block">
                            <div className="code-line">{`{`}</div>
                            <div className="code-line">  "mcpServers": {`{`}</div>
                            <div className="code-line">    "protokoll": {`{`} "command": "protokoll-mcp" {`}`}</div>
                            <div className="code-line">  {`}`}</div>
                            <div className="code-line">{`}`}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Supported Models */}
            <section className="models-section">
                <div className="container">
                    <h2 className="section-title">Supported Models</h2>
                    <div className="models-grid">
                        <div className="model-group">
                            <h4>OpenAI</h4>
                            <ul>
                                <li><strong>gpt-5.2</strong> <span className="model-badge default">default</span></li>
                                <li>gpt-5.1, gpt-5, gpt-4o</li>
                                <li>o1, o1-mini</li>
                            </ul>
                        </div>
                        <div className="model-group">
                            <h4>Anthropic</h4>
                            <ul>
                                <li><strong>claude-3-5-sonnet</strong> <span className="model-badge recommended">recommended</span></li>
                                <li>claude-3-opus</li>
                                <li>claude-3-haiku</li>
                            </ul>
                        </div>
                        <div className="model-group">
                            <h4>Transcription</h4>
                            <ul>
                                <li><strong>whisper-1</strong> <span className="model-badge default">default</span></li>
                                <li>gpt-4o-transcribe</li>
                </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="cta-section">
                <div className="container">
                    <h2>Stop Fighting Your Transcripts</h2>
                    <p>Transform your audio recordings into intelligent, perfectly organized notes.</p>
                    <div className="cta-buttons">
                        <a href="https://www.npmjs.com/package/@redaksjon/protokoll" className="btn btn-primary btn-large" target="_blank" rel="noopener noreferrer">
                    Install from NPM
                </a>
                        <a href="https://github.com/redaksjon/protokoll" className="btn btn-secondary btn-large" target="_blank" rel="noopener noreferrer">
                    View on GitHub
                </a>
                    </div>
                </div>
            </section>

            <footer className="footer">
                <div className="container">
                    <p>Apache 2.0 License | Built by <a href="https://github.com/redaksjon">Redaksjon</a></p>
                </div>
            </footer>
        </div>
    )
}

export default App 
