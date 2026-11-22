import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TileLibraryProvider } from './tiles'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TileLibraryProvider>
      <App />
    </TileLibraryProvider>
  </StrictMode>,
)
