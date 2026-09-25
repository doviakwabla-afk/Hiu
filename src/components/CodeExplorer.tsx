import React, { useState } from 'react';
import { FLUTTER_CODEBASE, CodeFile } from '../data/flutterCodebase';
import { Download, Copy, Check, FileCode, Folder, Shield, MessageSquare, Users, Cpu, FileText } from 'lucide-react';
import JSZip from 'jszip';

export const CodeExplorer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<CodeFile>(FLUTTER_CODEBASE[0]);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const filteredFiles = FLUTTER_CODEBASE.filter(f => {
    if (filterCategory === 'all') return true;
    return f.category === filterCategory;
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();

      // Add each codebase file
      FLUTTER_CODEBASE.forEach(file => {
        zip.file(file.path, file.code);
      });

      // Add a comprehensive README.md
      const readmeContent = `# WhisperText - Pure Text Flutter Messenger

Production-ready Flutter architecture for a text-only messaging application backed by Firebase Firestore and Custom Username Authentication.

## Key Features
1. **Strict Username & Password Auth**: No emails, no phone numbers, no OTPs.
2. **12-Word BIP-39 Recovery Phrase**: Generated on registration with salted SHA-256 validation.
3. **Exact Handle Discovery**: \`/usernames/{username}\` direct key lookup. No user scraping.
4. **Text-Only Protocol**: Max 2000 characters, zero file/media attachments, high-performance real-time Firestore listeners.
5. **State Management**: Built with Riverpod 2.x (\`flutter_riverpod\`).

## Getting Started
\`\`\`bash
# 1. Install dependencies
flutter pub get

# 2. Configure Firebase
flutterfire configure

# 3. Deploy security rules
firebase deploy --only firestore:rules

# 4. Run application
flutter run
\`\`\`
`;
      zip.file('README.md', readmeContent);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whisper_text_flutter_project.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to generate ZIP', e);
    } finally {
      setDownloading(false);
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'auth': return <Cpu className="w-3.5 h-3.5 text-amber-400" />;
      case 'friends': return <Users className="w-3.5 h-3.5 text-blue-400" />;
      case 'chat': return <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />;
      case 'backend': return <Shield className="w-3.5 h-3.5 text-rose-400" />;
      default: return <FileCode className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0F1115] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl font-mono">
      {/* Top Action Bar */}
      <div className="px-5 py-3.5 bg-[#181B22] border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <FileCode className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <span>Flutter & Riverpod Source Tree</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-normal">
                {FLUTTER_CODEBASE.length} files • Production Ready
              </span>
            </div>
            <div className="text-[11px] text-zinc-400">
              Clean modular Dart code with zero placeholders
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadZip}
            disabled={downloading}
            className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/10"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading ? 'PACKAGING ZIP...' : 'DOWNLOAD FLUTTER PROJECT (.ZIP)'}</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Sidebar + Code Editor */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[580px]">
        {/* Left Sidebar: File Tree */}
        <div className="w-full md:w-80 bg-[#12151B] border-r border-zinc-800 flex flex-col">
          {/* Category Tabs */}
          <div className="p-2 border-b border-zinc-800/80 flex gap-1 overflow-x-auto text-[11px]">
            {['all', 'core', 'auth', 'friends', 'chat', 'backend', 'config'].map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                  filterCategory === cat
                    ? 'bg-zinc-800 text-emerald-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* File List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredFiles.map(file => {
              const isSelected = selectedFile.path === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-start gap-2.5 text-xs transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'hover:bg-zinc-800/60 text-zinc-300 border border-transparent'
                  }`}
                >
                  <span className="mt-0.5">{getCategoryIcon(file.category)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-[11.5px]">{file.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{file.path}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Code Viewer */}
        <div className="flex-1 flex flex-col bg-[#0A0C0F] overflow-hidden">
          {/* File Header */}
          <div className="px-4 py-2.5 bg-[#141820] border-b border-zinc-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-zinc-300">
              <Folder className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-400">{selectedFile.path}</span>
            </div>

            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1.5 transition-colors border border-zinc-700"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-zinc-400" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          {/* Description banner */}
          <div className="px-4 py-2 bg-zinc-900/60 border-b border-zinc-800/60 text-[11px] text-zinc-400 flex items-center gap-2">
            <span className="text-emerald-400 font-bold">INFO:</span>
            <span>{selectedFile.description}</span>
          </div>

          {/* Code Viewer with Line Numbers */}
          <div className="flex-1 overflow-auto p-4 text-[12px] leading-relaxed text-zinc-200 font-mono">
            <pre className="flex">
              {/* Line numbers column */}
              <div className="select-none pr-4 text-right text-zinc-600 border-r border-zinc-800 mr-4">
                {selectedFile.code.split('\n').map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              {/* Code content column */}
              <code className="flex-1 overflow-x-auto whitespace-pre">
                {selectedFile.code}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
