import { useState, ChangeEvent } from 'react'
import './App.css'

interface StagedFile {
  claimId: string
  docCode: string
  fileObject: File
}

interface FileMetadata {
  claimId: string
  clmDocCd: string
  userId: string
  docSbmttdDt: string
  fileName: string
}

function App() {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [claimId, setClaimId] = useState<string>('')
  const [docCode, setDocCode] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)

  const handleAddFile = (): void => {
    if (!claimId || !docCode || !selectedFile) {
      alert("Please fill in all fields and select a file.")
      return
    }

    const fileEntry: StagedFile = {
      claimId: claimId,
      docCode: docCode,
      fileObject: selectedFile
    }

    setStagedFiles([...stagedFiles, fileEntry])
    
    // Clear inputs
    setClaimId('')
    setDocCode('')
    setSelectedFile(null)
    // Reset file input
    const fileInput = document.getElementById('fileInput') as HTMLInputElement
    if (fileInput) fileInput.value = ''
  }

  const handleRemoveItem = (index: number): void => {
    setStagedFiles(stagedFiles.filter((_, i) => i !== index))
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setSelectedFile(e.target.files?.[0] || null)
  }

  const handleUploadAll = async (): Promise<void> => {
    if (stagedFiles.length === 0) return

    setIsUploading(true)
    const formData = new FormData()

    // Create metadata array
    const metadata: FileMetadata[] = stagedFiles.map(item => ({
      claimId: item.claimId,
      clmDocCd: item.docCode,
      userId: "CPI",
      docSbmttdDt: "01-09-2026",
      fileName: item.fileObject.name
    }))

    // Append metadata as JSON string
    formData.append('metadata', JSON.stringify(metadata))

    // Append files
    stagedFiles.forEach((item) => {
      formData.append('files', item.fileObject)
    })

    try {
      const response = await fetch('http://localhost:3000/files/upload', {
        method: 'POST',
        body: formData
      })
      
      if (response.ok) {
        alert("Upload successful!")
        setStagedFiles([])
      } else {
        const errorData = await response.json().catch(() => ({})) as { message?: string }
        alert(`Upload failed: ${errorData.message || response.statusText}`)
      }
    } catch (error) {
      console.error("Upload error:", error)
      alert("Upload failed. Please check your console for details.")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="app-container">
      <div className="box">
        <h3>1. Add a File</h3>
        <input
          type="text"
          id="claimId"
          placeholder="Claim ID"
          value={claimId}
          onChange={(e) => setClaimId(e.target.value)}
        />
        <input
          type="text"
          id="docCode"
          placeholder="Document Code"
          value={docCode}
          onChange={(e) => setDocCode(e.target.value)}
        />
        <input
          type="file"
          id="fileInput"
          onChange={handleFileChange}
        />
        <button id="addFileBtn" onClick={handleAddFile}>
          Add to List
        </button>
      </div>

      <div className="box">
        <h3>2. Staged Files</h3>
        <div id="fileList">
          {stagedFiles.length === 0 ? (
            <i>No files added yet...</i>
          ) : (
            stagedFiles.map((item, index) => (
              <div key={index} className="staged-item">
                <span>
                  <strong>{item.claimId}</strong> ({item.docCode}) - {item.fileObject.name}
                </span>
                <button
                  onClick={() => handleRemoveItem(index)}
                  className="remove-btn"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
        {stagedFiles.length > 0 && (
          <button
            id="uploadAllBtn"
            onClick={handleUploadAll}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : 'Upload All Staged Files'}
          </button>
        )}
      </div>
    </div>
  )
}

export default App
