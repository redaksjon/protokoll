import React from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'

function Home() {
    return (
        <Layout>
            {/* Hero Section */}
            <header className="hero">
                <div className="hero-glow"></div>
                <div className="hero-content">
                    <div className="badge">MCP Server for Audio Transcription</div>
                    <h1 className="title">Protokoll</h1>
                    <p className="tagline">
                        Run a transcription server, connect from anywhere.
                        <br />
                        <span className="highlight">Whisper mishears names. Protokoll fixes them.</span>
                    </p>
                    <div className="hero-actions">
                        <Link to="/install" className="btn btn-primary">Get Started</Link>
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

            {/* Architecture Overview */}
            <section className="architecture-section">
                <div className="container">
                    <h2 className="section-title">How It Works</h2>
                    <div className="architecture-grid">
                        <div className="architecture-card">
                            <div className="architecture-icon">1</div>
                            <h3>Deploy the Server</h3>
                            <p>Run Protokoll as an MCP HTTP server on your machine, VPS, or cloud.</p>
                            <Link to="/deploy" className="architecture-link">Deploy options →</Link>
                        </div>
                        <div className="architecture-card">
                            <div className="architecture-icon">2</div>
                            <h3>Connect Your AI</h3>
                            <p>Point your AI assistant (Cursor, Claude Desktop) to your Protokoll server.</p>
                            <Link to="/ai-assistants" className="architecture-link">View guides →</Link>
                        </div>
                        <div className="architecture-card">
                            <div className="architecture-icon">3</div>
                            <h3>Transcribe Anywhere</h3>
                            <p>Ask your AI to transcribe audio files. Context travels with the server.</p>
                            <Link to="/context" className="architecture-link">Learn about context →</Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature Highlights */}
            <section className="features-section">
                <div className="container">
                    <h2 className="section-title">Features</h2>
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon feature-icon-text">C</div>
                            <h4>Context System</h4>
                            <p>Define people, projects, companies, and terms. Protokoll learns your world.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon feature-icon-text">R</div>
                            <h4>Intelligent Routing</h4>
                            <p>Notes automatically go to the right folder based on content analysis.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon feature-icon-text">P</div>
                            <h4>Phonetic Matching</h4>
                            <p>Teach Protokoll how names sound when Whisper mishears them.</p>
                        </div>
                        <div className="feature-card">
                            <div className="feature-icon feature-icon-text">M</div>
                            <h4>MCP Integration</h4>
                            <p>Works with any MCP-compatible AI assistant via HTTP transport.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="cta-section">
                <div className="container">
                    <h2>Ready to set up Protokoll?</h2>
                    <p>Get started in minutes with our installation guides.</p>
                    <div className="cta-buttons">
                        <Link to="/install" className="btn btn-primary btn-large">Install Protokoll</Link>
                    </div>
                </div>
            </section>
        </Layout>
    )
}

export default Home
