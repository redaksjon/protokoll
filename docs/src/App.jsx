import React from 'react'

function App() {
    return (
        <div className="container">
            <header className="header">
                <h1 className="title">Matnava</h1>
                <p className="subtitle">
                    A focused transcription tool that helps you transcribe audio intelligently using context
                </p>
            </header>

            <section className="install-section">
                <h2>Quick Start</h2>
                <p>Get started with Matnava in seconds:</p>
                <div className="code-block">
                    # Install globally with npm<br />
                    npm install -g @jankhoj/matnava<br /><br />
                    # Set up your OpenAI API key<br />
                    echo "OPENAI_API_KEY=your-api-key" &gt; .env<br /><br />
                    # Start transcribing!<br />
                    matnava --input-directory ./recordings --output-directory ./notes
                </div>
            </section>

            <section className="feature-grid">
                <div className="feature-card">
                    <h3>🎯 Focused</h3>
                    <p>Designed specifically for intelligent audio transcription with context awareness.</p>
                </div>
                <div className="feature-card">
                    <h3>🤖 AI-Powered</h3>
                    <p>Uses OpenAI's Whisper for transcription and GPT models for intelligent processing.</p>
                </div>
                <div className="feature-card">
                    <h3>📝 Smart Output</h3>
                    <p>Generates both structured JSON data and readable Markdown notes.</p>
                </div>
                <div className="feature-card">
                    <h3>🔧 Configurable</h3>
                    <p>Customize AI instructions, output formats, and processing behavior.</p>
                </div>
            </section>

            <section className="example-section">
                <h2>How It Works</h2>
                <p>Matnava processes your audio files through intelligent phases:</p>

                <div className="phase">
                    <h4>1. Locate Phase</h4>
                    <p>Extracts metadata, calculates unique identifiers, and sets up output structure.</p>
                </div>

                <div className="phase">
                    <h4>2. Classify Phase</h4>
                    <p>Transcribes audio using Whisper, then classifies content type (meeting, call, email, etc.) and extracts key metadata.</p>
                </div>

                <div className="phase">
                    <h4>3. Compose Phase</h4>
                    <p>Creates intelligent, well-structured markdown notes based on the content type and classification.</p>
                </div>
            </section>

            <section>
                <h2>Example Usage</h2>
                <div className="code-block">
                    # Basic transcription<br />
                    matnava --input-directory ./meetings --output-directory ./notes<br /><br />
                    # Recursive processing with verbose output<br />
                    matnava --input-directory ./recordings --recursive --verbose<br /><br />
                    # Custom AI model<br />
                    matnava --input-directory ./audio --model gpt-4-turbo<br /><br />
                    # With context from existing notes<br />
                    matnava --input-directory ./recordings --context-directories ./my-notes
                </div>
            </section>

            <section>
                <h2>Output Files</h2>
                <p>For each audio file, Matnava generates:</p>
                <div className="feature-grid">
                    <div className="feature-card">
                        <h3>📊 JSON Classification</h3>
                        <p>Structured data with content type, metadata, attendees, tasks, and original transcript.</p>
                    </div>
                    <div className="feature-card">
                        <h3>📄 Markdown Notes</h3>
                        <p>Enhanced, formatted notes ready for your knowledge management system.</p>
                    </div>
                </div>
            </section>

            <section>
                <h2>Key Features</h2>
                <ul style={{ textAlign: 'left', color: '#ccc', lineHeight: '1.8' }}>
                    <li>Support for multiple audio formats (mp3, mp4, wav, m4a)</li>
                    <li>Automatic content classification and type-specific formatting</li>
                    <li>Configurable output directory structure and filename formats</li>
                    <li>Context enhancement from existing knowledge bases</li>
                    <li>Customizable AI instructions and personas</li>
                    <li>Debug mode for inspecting AI prompts and responses</li>
                    <li>Recursive directory processing</li>
                    <li>Timezone-aware date handling</li>
                </ul>
            </section>

            <section className="cta-section">
                <h2>Get Started Today</h2>
                <p>Transform your audio recordings into intelligent, actionable notes.</p>
                <a href="https://www.npmjs.com/package/@jankhoj/matnava" className="cta-button" target="_blank" rel="noopener noreferrer">
                    Install from NPM
                </a>
                <a href="https://github.com/jafarisimran/matnava" className="cta-button" target="_blank" rel="noopener noreferrer">
                    View on GitHub
                </a>
            </section>
        </div>
    )
}

export default App 