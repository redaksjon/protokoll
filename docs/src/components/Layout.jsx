import React from 'react'
import { Link, useLocation } from 'react-router-dom'

function Layout({ children }) {
    const location = useLocation()
    
    const navLinks = [
        { path: '/', label: 'Home' },
        { path: '/install', label: 'Installation' },
        { path: '/ai-assistants', label: 'AI Assistants' },
        { path: '/deploy', label: 'Deploy' },
        { path: '/context', label: 'Context' },
    ]
    
    const isActive = (path) => location.pathname === path
    
    return (
        <div className="site">
            <nav className="nav">
                <div className="nav-container">
                    <Link to="/" className="nav-logo">
                        <span className="nav-logo-icon">P</span>
                        <span className="nav-logo-text">Protokoll</span>
                    </Link>
                    <div className="nav-links">
                        {navLinks.map(link => (
                            <Link 
                                key={link.path} 
                                to={link.path}
                                className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </nav>
            
            <main className="main">
                {children}
            </main>
            
            <footer className="footer">
                <div className="container">
                    <div className="footer-content">
                        <div className="footer-brand">
                            <span className="footer-logo">P</span>
                            <span>Protokoll — Intelligent Audio Transcription</span>
                        </div>
                        <div className="footer-links">
                            <a href="https://www.npmjs.com/package/@redaksjon/protokoll" target="_blank" rel="noopener noreferrer">npm</a>
                            <a href="https://github.com/redaksjon/protokoll" target="_blank" rel="noopener noreferrer">GitHub</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default Layout
