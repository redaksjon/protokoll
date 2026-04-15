import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Install from './pages/Install.jsx'
import AIAssistants from './pages/AIAssistants.jsx'
import Deploy from './pages/Deploy.jsx'
import Context from './pages/Context.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/install" element={<Install />} />
                <Route path="/ai-assistants" element={<AIAssistants />} />
                <Route path="/deploy" element={<Deploy />} />
                <Route path="/context" element={<Context />} />
            </Routes>
        </BrowserRouter>
    </React.StrictMode>,
)
