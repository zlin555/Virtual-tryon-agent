import { createContext, useContext, useState } from 'react'

const SavedLooksContext = createContext(null)

export function SavedLooksProvider({ children }) {
  const [looks, setLooks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('savedLooks') || '[]')
    } catch {
      return []
    }
  })

  const saveLook = (url) => {
    if (!url || looks.includes(url)) return
    const next = [url, ...looks]
    setLooks(next)
    localStorage.setItem('savedLooks', JSON.stringify(next))
  }

  const removeLook = (url) => {
    const next = looks.filter((l) => l !== url)
    setLooks(next)
    localStorage.setItem('savedLooks', JSON.stringify(next))
  }

  return (
    <SavedLooksContext.Provider value={{ looks, saveLook, removeLook }}>
      {children}
    </SavedLooksContext.Provider>
  )
}

export function useSavedLooks() {
  return useContext(SavedLooksContext)
}
