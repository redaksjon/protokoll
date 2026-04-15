import React from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'

function Deploy() {
    return (
        <Layout>
            <header className="page-header">
                <div className="container">
                    <nav className="breadcrumb">
                        <Link to="/">Home</Link>
                        <span className="breadcrumb-sep">/</span>
                        <span>Deployment</span>
                    </nav>
                    <h1>Deployment</h1>
                    <p className="page-desc">
                        Run Protokoll locally or deploy it to the cloud. Access from anywhere.
                    </p>
                </div>
            </header>

            <section className="page-section">
                <div className="container">
                    <h2>Local Development</h2>
                    <p>The simplest option for single-machine use:</p>
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
                                <span className="terminal-input">protokoll-mcp-http</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">[Protokoll MCP HTTP Server]</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">Server running at http://localhost:3000</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-dim">MCP endpoint: http://localhost:3000/mcp</span>
                            </div>
                        </div>
                    </div>
                    <p>AI assistants running on the same machine can connect to <code>http://localhost:3000</code>.</p>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Docker</h2>
                    <p>Run Protokoll in a container for easy deployment:</p>
                    
                    <h3>Dockerfile</h3>
                    <div className="code-block">
                        <div className="code-line">FROM node:24-alpine</div>
                        <div className="code-line"></div>
                        <div className="code-line">RUN npm install -g @redaksjon/protokoll</div>
                        <div className="code-line"></div>
                        <div className="code-line">WORKDIR /app</div>
                        <div className="code-line"></div>
                        <div className="code-line">EXPOSE 3000</div>
                        <div className="code-line"></div>
                        <div className="code-line">CMD ["protokoll-mcp-http", "--host", "0.0.0.0"]</div>
                    </div>

                    <h3>Build and Run</h3>
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
                                <span className="terminal-input">docker build -t protokoll .</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">docker run -p 3000:3000 \</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-input">  -e OPENAI_API_KEY=sk-... \</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-input">  -e PROTOKOLL_OUTPUT_DIRECTORY=/data/notes \</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-input">  -v protokoll-data:/data \</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-input">  protokoll</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Cloud Run (GCP)</h2>
                    <p>Deploy to Google Cloud Run for a managed, scalable solution:</p>
                    
                    <h3>cloudbuild.yaml</h3>
                    <div className="code-block">
                        <div className="code-line">steps:</div>
                        <div className="code-line">  - name: 'gcr.io/cloud-builders/docker'</div>
                        <div className="code-line">    args: ['build', '-t', 'gcr.io/$PROJECT_ID/protokoll', '.']</div>
                        <div className="code-line"></div>
                        <div className="code-line">  - name: 'gcr.io/cloud-builders/docker'</div>
                        <div className="code-line">    args: ['push', 'gcr.io/$PROJECT_ID/protokoll']</div>
                        <div className="code-line"></div>
                        <div className="code-line">  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'</div>
                        <div className="code-line">    args:</div>
                        <div className="code-line">      - 'run'</div>
                        <div className="code-line">      - 'deploy'</div>
                        <div className="code-line">      - 'protokoll'</div>
                        <div className="code-line">      - '--image=gcr.io/$PROJECT_ID/protokoll'</div>
                        <div className="code-line">      - '--platform=managed'</div>
                        <div className="code-line">      - '--region=us-central1'</div>
                        <div className="code-line">      - '--allow-unauthenticated'</div>
                        <div className="code-line">      - '--set-env-vars=OPENAI_API_KEY=$_OPENAI_API_KEY'</div>
                    </div>

                    <h3>Deploy with Cloud Build</h3>
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
                                <span className="terminal-input">gcloud builds submit --config=cloudbuild.yaml \</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-input">  --substitutions=_OPENAI_API_KEY=$OPENAI_API_KEY</span>
                            </div>
                        </div>
                    </div>

                    <div className="callout callout-warning">
                        <h4>Security Note</h4>
                        <p>When deploying to cloud, use authentication and consider restricting access to your AI assistants. See the security section below.</p>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>VPS / Dedicated Server</h2>
                    <p>Deploy to a VPS for full control and lower costs:</p>
                    
                    <h3>1. Install Prerequisites</h3>
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">SSH</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">ssh user@your-server</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">sudo apt install -y nodejs ffmpeg</span>
                            </div>
                        </div>
                    </div>

                    <h3>2. Install Protokoll</h3>
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">SSH</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">sudo npm install -g @redaksjon/protokoll</span>
                            </div>
                        </div>
                    </div>

                    <h3>3. Configure and Run</h3>
                    <div className="terminal-demo">
                        <div className="terminal-header">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">SSH</span>
                        </div>
                        <div className="terminal-body">
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">mkdir -p ~/.protokoll</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">echo 'OPENAI_API_KEY=sk-...' &gt; ~/.protokoll/.env</span>
                            </div>
                            <div className="terminal-line">
                                <span className="terminal-prompt">$</span>
                                <span className="terminal-input">protokoll-mcp-http --host 0.0.0.0 --cwd ~/.protokoll &</span>
                            </div>
                        </div>
                    </div>

                    <div className="callout callout-info">
                        <h4>Host Binding</h4>
                        <p>By default, Protokoll binds to <code>127.0.0.1</code> (localhost only). Use <code>--host 0.0.0.0</code> to accept external connections. For production, always use a reverse proxy with TLS.</p>
                    </div>

                    <h3>4. Set Up a Reverse Proxy (Optional)</h3>
                    <p>Use nginx with TLS for secure remote access:</p>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># /etc/nginx/sites-available/protokoll</span></div>
                        <div className="code-line">server {`{`}</div>
                        <div className="code-line">    listen 443 ssl;</div>
                        <div className="code-line">    server_name protokoll.yourdomain.com;</div>
                        <div className="code-line"></div>
                        <div className="code-line">    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;</div>
                        <div className="code-line">    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;</div>
                        <div className="code-line"></div>
                        <div className="code-line">    location / {`{`}</div>
                        <div className="code-line">        proxy_pass http://localhost:3000;</div>
                        <div className="code-line">        proxy_http_version 1.1;</div>
                        <div className="code-line">        proxy_set_header Upgrade $http_upgrade;</div>
                        <div className="code-line">        proxy_set_header Connection 'upgrade';</div>
                        <div className="code-line">        proxy_set_header Host $host;</div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Railway / Render / Fly.io</h2>
                    <p>Deploy to platform-as-a-service for easy scaling:</p>
                    
                    <div className="platform-cards">
                        <div className="platform-card">
                            <h3>Railway</h3>
                            <div className="code-block">
                                <div className="code-line"><span className="code-comment"># railway.json</span></div>
                                <div className="code-line">{`{`}</div>
                                <div className="code-line">  "build": {`{`}</div>
                                <div className="code-line">    "builder": "NIXPACKS"</div>
                                <div className="code-line">  {`}`},</div>
                                <div className="code-line">  "deploy": {`{`}</div>
                                <div className="code-line">    "healthCheckPath": "/health"</div>
                                <div className="code-line">  {`}`}</div>
                                <div className="code-line">{`}`}</div>
                            </div>
                            <p>Set <code>OPENAI_API_KEY</code> in Railway's environment variables.</p>
                        </div>
                        
                        <div className="platform-card">
                            <h3>Render</h3>
                            <div className="code-block">
                                <div className="code-line"><span className="code-comment"># render.yaml</span></div>
                                <div className="code-line">services:</div>
                                <div className="code-line">  - type: web</div>
                                <div className="code-line">    name: protokoll</div>
                                <div className="code-line">    env: node</div>
                                <div className="code-line">    buildCommand: npm install -g @redaksjon/protokoll</div>
                                <div className="code-line">    startCommand: protokoll-mcp-http-mcp-http</div>
                            </div>
                            <p>Add <code>OPENAI_API_KEY</code> as an environment variable in Render dashboard.</p>
                        </div>
                        
                        <div className="platform-card">
                            <h3>Fly.io</h3>
                            <div className="code-block">
                                <div className="code-line"><span className="code-comment"># fly.toml</span></div>
                                <div className="code-line">app = "protokoll"</div>
                                <div className="code-line">primary_region = "iad"</div>
                                <div className="code-line"></div>
                                <div className="code-line">[build]</div>
                                <div className="code-line">  builder = "heroku/buildpacks:20"</div>
                                <div className="code-line"></div>
                                <div className="code-line">[deploy]</div>
                                <div className="code-line">  release_command = "npm install -g @redaksjon/protokoll"</div>
                            </div>
                            <div className="terminal-demo">
                                <div className="terminal-body">
                                    <div className="terminal-line">
                                        <span className="terminal-prompt">$</span>
                                        <span className="terminal-input">fly secrets set OPENAI_API_KEY=sk-...</span>
                                    </div>
                                    <div className="terminal-line">
                                        <span className="terminal-prompt">$</span>
                                        <span className="terminal-input">fly launch && fly deploy</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <h2>Connecting Remotely</h2>
                    <p>Once deployed, configure your AI assistant to connect to your server:</p>
                    <div className="code-block">
                        <div className="code-line"><span className="code-comment"># Claude Desktop - Remote server</span></div>
                        <div className="code-line">{`{`}</div>
                        <div className="code-line">  <span className="code-string">"mcpServers"</span>: {`{`}</div>
                        <div className="code-line">    <span className="code-string">"protokoll"</span>: {`{`}</div>
                        <div className="code-line">      <span className="code-string">"url"</span>: <span className="code-string">"https://protokoll.yourdomain.com/mcp"</span></div>
                        <div className="code-line">    {`}`}</div>
                        <div className="code-line">  {`}`}</div>
                        <div className="code-line">{`}`}</div>
                    </div>

                    <div className="callout callout-info">
                        <h4>MCP HTTP Transport</h4>
                        <p>Protokoll uses MCP over HTTP. The endpoint URL format is <code>{`{server}`}/mcp</code>. Make sure your deployment exposes this path.</p>
                    </div>
                </div>
            </section>

            <section className="page-section">
                <div className="container">
                    <div className="next-steps-grid">
                        <Link to="/ai-assistants" className="next-step-card">
                            <h4>Configure AI Assistants</h4>
                            <p>Set up Claude Desktop, Cursor, or other clients to use your server.</p>
                            <span className="next-step-link">AI Assistants →</span>
                        </Link>
                        <Link to="/context" className="next-step-card">
                            <h4>Set Up Context</h4>
                            <p>Configure people, projects, and terms for your server.</p>
                            <span className="next-step-link">Context →</span>
                        </Link>
                    </div>
                </div>
            </section>
        </Layout>
    )
}

export default Deploy
