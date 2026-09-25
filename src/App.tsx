import React, { useState } from 'react';
import { PhoneSimulator } from './components/PhoneSimulator';
import { CodeExplorer } from './components/CodeExplorer';
import { ArchitectureView } from './components/ArchitectureView';
import { InternetConnectivityGuide } from './components/InternetConnectivityGuide';
import { ApkBuildGuide } from './components/ApkBuildGuide';
import { StorageService } from './services/storageService';
import {
  Smartphone,
  Code2,
  ShieldAlert,
  Globe,
  PackageCheck,
  RotateCcw,
  Sparkles,
  SplitSquareVertical,
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'architecture' | 'internet' | 'apk'>('simulator');


  const [dualMode, setDualMode] = useState<boolean>(true);
  const [copiedAlice, setCopiedAlice] = useState(false);
  const [copiedBob, setCopiedBob] = useState(false);

  const handleResetData = () => {
    if (confirm('Reset database back to initial seed data (Alice and Bob)?')) {
      StorageService.resetToSeed();
    }
  };

  const copyPhrase = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const alicePhrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
  const bobPhrase = "account accuse achieve acid acoustic acquire across act action actor actress actual";

  return (
    <div className="min-h-screen bg-[#090A0D] text-zinc-100 flex flex-col font-mono selection:bg-emerald-500 selection:text-black">
      
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-800 bg-[#0F1116] px-4 py-3 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shadow-inner">
              W
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-wider text-white">WHISPER_TEXT</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Flutter Architecture
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Text-Only • Strict Username Auth • 12-Word BIP-39 Recovery • Riverpod
              </p>
            </div>
          </div>

          {/* Center Tabs */}
          <div className="flex items-center bg-[#181B22] p-1 rounded-xl border border-zinc-800 text-xs">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'simulator'
                  ? 'bg-emerald-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Live Flutter Simulator</span>
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'code'
                  ? 'bg-emerald-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Dart Source Code (25 Files)</span>
            </button>

            <button
              onClick={() => setActiveTab('architecture')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'architecture'
                  ? 'bg-emerald-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Architecture & Security</span>
            </button>

            <button
              onClick={() => setActiveTab('internet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'internet'
                  ? 'bg-emerald-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Internet Transit & Protocols</span>
            </button>

            <button
              onClick={() => setActiveTab('apk')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'apk'
                  ? 'bg-emerald-500 text-black font-bold shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>Compile APK</span>
            </button>
          </div>



          {/* Quick Controls */}
          <div className="flex items-center gap-2">
            {activeTab === 'simulator' && (
              <button
                onClick={() => setDualMode(!dualMode)}
                className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors ${
                  dualMode
                    ? 'bg-zinc-800 text-emerald-400 border-emerald-500/40'
                    : 'bg-[#181B22] text-zinc-400 border-zinc-700 hover:text-white'
                }`}
                title="Toggle Side-by-Side Dual Device Mode"
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                <span>{dualMode ? 'Dual Devices' : 'Single Device'}</span>
              </button>
            )}

            <button
              onClick={handleResetData}
              className="px-2.5 py-1.5 bg-[#181B22] hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-700 text-xs flex items-center gap-1 transition-colors"
              title="Reset data back to seed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Seed</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col">
        
        {/* SIMULATOR TAB */}
        {activeTab === 'simulator' && (
          <div className="flex-1 flex flex-col">
            
            {/* Quick Helper Banner */}
            <div className="mb-4 bg-[#14171F] border border-zinc-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-zinc-300">
                  {dualMode
                    ? 'Dual Phone Mode active: Send text messages or friend requests between Device A and Device B in real time!'
                    : 'Single Phone Mode active: Test registration with 12-word mnemonic phrases, account recovery, exact discovery, and real-time chat.'}
                </span>
              </div>

              {/* Seed Recovery Phrase helpers for rapid testing */}
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-zinc-500">Demo 12-Word Seeds:</span>
                <button
                  onClick={() => copyPhrase(alicePhrase, setCopiedAlice)}
                  className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 flex items-center gap-1"
                >
                  {copiedAlice ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>Alice Seed</span>
                </button>
                <button
                  onClick={() => copyPhrase(bobPhrase, setCopiedBob)}
                  className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 flex items-center gap-1"
                >
                  {copiedBob ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>Bob Seed</span>
                </button>
              </div>
            </div>

            {/* Phone Frames Container */}
            <div className="flex-1 flex flex-wrap items-center justify-center gap-8 py-4">
              <PhoneSimulator
                initialUsername="alice"
                phoneLabel="Device A (Alice)"
              />

              {dualMode && (
                <PhoneSimulator
                  initialUsername="bob"
                  phoneLabel="Device B (Bob)"
                />
              )}
            </div>

          </div>
        )}

        {/* CODE TAB */}
        {activeTab === 'code' && (
          <div className="flex-1 flex flex-col">
            <CodeExplorer />
          </div>
        )}

        {/* ARCHITECTURE TAB */}
        {activeTab === 'architecture' && (
          <div className="flex-1 flex flex-col">
            <ArchitectureView />
          </div>
        )}

        {/* INTERNET TRANSIT TAB */}
        {activeTab === 'internet' && (
          <div className="flex-1 flex flex-col">
            <InternetConnectivityGuide />
          </div>
        )}

        {/* COMPILE APK TAB */}
        {activeTab === 'apk' && (
          <div className="flex-1 flex flex-col">
            <ApkBuildGuide />
          </div>
        )}

      </main>


      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-[#0A0C0F] px-4 py-3 text-center text-xs text-zinc-500">
        WhisperText Architecture • Flutter (Dart) + Firebase Firestore + Custom Username Authentication + BIP-39 Recovery
      </footer>

    </div>
  );
}
