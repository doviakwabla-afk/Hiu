import React from 'react';
import { Shield, Key, Search, MessageSquare, Database, ArrowRight, Lock, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 font-mono text-zinc-200">
      
      {/* Top Banner */}
      <div className="bg-[#181B22] border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wider">SYSTEM ARCHITECTURE SPECIFICATION</h2>
            <p className="text-xs text-zinc-400">
              High-Privacy Text Messaging on Flutter (Dart) + Firebase Firestore
            </p>
          </div>
        </div>
      </div>

      {/* Grid of 4 Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Pillar 1: Username & Password Auth */}
        <div className="bg-[#14171F] border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold mb-3">
              <Key className="w-4 h-4" />
              <span>1. STRICT USERNAME AUTHENTICATION</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Eliminates all personal identity vectors (No emails, No phone numbers, No SMS OTPs).
            </p>
            <div className="space-y-2 text-xs bg-[#0F1115] p-3 rounded-lg border border-zinc-800/80">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">A.</span>
                <span><strong>Atomic Reservation:</strong> A document at <code className="text-amber-300">/usernames/{'{username}'}</code> is written in a Firestore transaction lock.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">B.</span>
                <span><strong>Firebase Custom Auth / Scoped Mapping:</strong> User credentials authenticate via custom token or scoped internal identifier <code className="text-amber-300">username@whisper.internal</code>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">C.</span>
                <span><strong>No Collisions:</strong> Firestore Security Rules reject any create request if document ID already exists.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pillar 2: 12-Word BIP-39 Recovery */}
        <div className="bg-[#14171F] border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-sm font-bold mb-3">
              <Shield className="w-4 h-4" />
              <span>2. 12-WORD MNEMONIC RECOVERY</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Cryptographically secure account restoration standard borrowed from blockchain wallets (BIP-39).
            </p>
            <div className="space-y-2 text-xs bg-[#0F1115] p-3 rounded-lg border border-zinc-800/80">
              <div className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">A.</span>
                <span><strong>Entropy Generation:</strong> 128-bit secure entropy generates 12 deterministic words from the 2,048 BIP-39 dictionary.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">B.</span>
                <span><strong>Salted SHA-256:</strong> Server never stores the phrase. Only stores <code className="text-amber-300">SHA256(phrase + salt)</code> under <code className="text-zinc-300">/users/{'{uid}'}/security/recovery</code>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">C.</span>
                <span><strong>Zero-Knowledge Reset:</strong> User presents username + 12 words; system validates the salted hash and resets credentials.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pillar 3: Exact Username Discovery */}
        <div className="bg-[#14171F] border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-400 text-sm font-bold mb-3">
              <Search className="w-4 h-4" />
              <span>3. EXACT DISCOVERY & FRIEND REQUESTS</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Prevents enumeration attacks, automated contact scraping, and unwanted unsolicited spam.
            </p>
            <div className="space-y-2 text-xs bg-[#0F1115] p-3 rounded-lg border border-zinc-800/80">
              <div className="flex items-start gap-2">
                <span className="text-blue-400 font-bold">A.</span>
                <span><strong>Zero Directory Browsing:</strong> No listing, prefix search, or wildcard matching in Firestore queries.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 font-bold">B.</span>
                <span><strong>Point Lookup:</strong> <code className="text-amber-300">db.collection('usernames').doc(exactName).get()</code> returns only the target UID.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 font-bold">C.</span>
                <span><strong>Mutual Handshake:</strong> Users must send a Friend Request before a conversation channel is established.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pillar 4: Pure Text-Only Engine */}
        <div className="bg-[#14171F] border border-zinc-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-rose-400 text-sm font-bold mb-3">
              <MessageSquare className="w-4 h-4" />
              <span>4. TEXT-ONLY PAYLOAD PROTOCOL</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Eliminates media vulnerabilities, zero-click image exploits, and heavy bandwidth footprints.
            </p>
            <div className="space-y-2 text-xs bg-[#0F1115] p-3 rounded-lg border border-zinc-800/80">
              <div className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">A.</span>
                <span><strong>Max Length:</strong> 2,000 characters per message strictly validated by Firestore rules.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">B.</span>
                <span><strong>Rules Enforcement:</strong> Documents containing <code className="text-rose-300">attachments</code> or <code className="text-rose-300">mediaUrl</code> are rejected on write.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-rose-400 font-bold">C.</span>
                <span><strong>Real-time Snapshot:</strong> High-frequency snapshot listeners with instant read status synchronization.</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Sequence Diagram Visualizer */}
      <div className="bg-[#14171F] border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400" />
          <span>REGISTRATION & ATOMIC RESERVATION SEQUENCE</span>
        </h3>

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs bg-[#0F1115] p-4 rounded-xl border border-zinc-800">
          <div className="p-3 bg-[#181B22] rounded-lg border border-zinc-700 text-center w-full md:w-44">
            <div className="text-emerald-400 font-bold">1. User Client</div>
            <div className="text-[10px] text-zinc-400 mt-1">Enters username & password</div>
          </div>
          <ArrowRight className="text-zinc-600 hidden md:block w-4 h-4" />
          <div className="p-3 bg-[#181B22] rounded-lg border border-zinc-700 text-center w-full md:w-44">
            <div className="text-amber-400 font-bold">2. BIP-39 Engine</div>
            <div className="text-[10px] text-zinc-400 mt-1">Generates 12 words & random salt</div>
          </div>
          <ArrowRight className="text-zinc-600 hidden md:block w-4 h-4" />
          <div className="p-3 bg-[#181B22] rounded-lg border border-zinc-700 text-center w-full md:w-44">
            <div className="text-blue-400 font-bold">3. Firestore Batch</div>
            <div className="text-[10px] text-zinc-400 mt-1">Locks /usernames/{'{name}'} & writes /users/{'{uid}'}</div>
          </div>
          <ArrowRight className="text-zinc-600 hidden md:block w-4 h-4" />
          <div className="p-3 bg-[#181B22] rounded-lg border border-emerald-500/40 text-center w-full md:w-44 bg-emerald-500/5">
            <div className="text-emerald-300 font-bold">4. Account Active</div>
            <div className="text-[10px] text-zinc-400 mt-1">12 words backed up to offline storage</div>
          </div>
        </div>
      </div>

      {/* Firestore Schema Summary Table */}
      <div className="bg-[#14171F] border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-bold text-white mb-4">FIRESTORE DATA COLLECTIONS</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#181B22] text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="p-2.5">Collection Path</th>
                <th className="p-2.5">Document ID</th>
                <th className="p-2.5">Key Fields</th>
                <th className="p-2.5">Security Rule Constraint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              <tr>
                <td className="p-2.5 font-bold text-amber-300">/usernames</td>
                <td className="p-2.5 font-mono text-zinc-400">{'{username}'}</td>
                <td className="p-2.5">uid, username, createdAt</td>
                <td className="p-2.5 text-emerald-400">Created once, immutable, unique key</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-amber-300">/users</td>
                <td className="p-2.5 font-mono text-zinc-400">{'{uid}'}</td>
                <td className="p-2.5">uid, username, statusMessage, createdAt</td>
                <td className="p-2.5 text-emerald-400">Owner write only</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-amber-300">/users/{'{uid}'}/security</td>
                <td className="p-2.5 font-mono text-zinc-400">recovery</td>
                <td className="p-2.5">recoveryPhraseHash, salt, updatedAt</td>
                <td className="p-2.5 text-emerald-400">Owner read/write only. Phrase never stored.</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-amber-300">/friend_requests</td>
                <td className="p-2.5 font-mono text-zinc-400">{'{requestId}'}</td>
                <td className="p-2.5">senderId, receiverId, status, createdAt</td>
                <td className="p-2.5 text-emerald-400">Only sender and receiver can read/update</td>
              </tr>
              <tr>
                <td className="p-2.5 font-bold text-amber-300">/chats/{'{chatId}'}/messages</td>
                <td className="p-2.5 font-mono text-zinc-400">{'{messageId}'}</td>
                <td className="p-2.5">senderId, text, timestamp, isRead</td>
                <td className="p-2.5 text-emerald-400">Only room participants; strictly text size ≤ 2000</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
