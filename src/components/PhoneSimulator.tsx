import React, { useState, useEffect, useRef } from 'react';
import {
  StorageService,
  StoredUser,
  StoredFriend,
  StoredFriendRequest,
  StoredTextMessage
} from '../services/storageService';
import { validateMnemonicPhrase } from '../utils/bip39';
import {
  Lock,
  UserCheck,
  Send,
  Search,
  UserPlus,
  ShieldCheck,
  Copy,
  Check,
  LogOut,
  ChevronLeft,
  X,
  Smartphone,
  Eye,
  EyeOff,
  Clock,
  CheckCheck
} from 'lucide-react';

interface PhoneSimulatorProps {
  initialUsername?: string;
  phoneLabel?: string;
  onUserChanged?: (user: StoredUser | null) => void;
}

type Screen = 'login' | 'register' | 'mnemonic' | 'recovery' | 'chat_list' | 'search' | 'requests' | 'chat_room';

export const PhoneSimulator: React.FC<PhoneSimulatorProps> = ({
  initialUsername = 'alice',
  phoneLabel = 'Device A',
  onUserChanged,
}) => {
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [screen, setScreen] = useState<Screen>('login');
  
  // Auth Form State
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Registration Mnemonic State
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string>('');
  const [hasSavedMnemonic, setHasSavedMnemonic] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);

  // Recovery State
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Discovery / Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<StoredUser | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  // Chat Room State
  const [activeFriend, setActiveFriend] = useState<StoredFriend | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live Data State
  const [friends, setFriends] = useState<StoredFriend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<StoredFriendRequest[]>([]);
  const [messages, setMessages] = useState<StoredTextMessage[]>([]);
  const [activeChatMessages, setActiveChatMessages] = useState<StoredTextMessage[]>([]);

  // Load and subscribe to storage changes
  const refreshData = async () => {
    const data = await StorageService.getInitialData();
    if (currentUser) {
      const updatedUser = data.users[currentUser.uid];
      if (updatedUser) setCurrentUser(updatedUser);

      const myFriends = data.friends[currentUser.uid] || [];
      setFriends(myFriends);

      const requests = data.friendRequests.filter(
        r => r.receiverId === currentUser.uid && r.status === 'pending'
      );
      setPendingRequests(requests);

      setMessages(data.messages);

      if (activeFriend) {
        const chatId = StorageService.getChatId(currentUser.uid, activeFriend.uid);
        const chatMsgs = data.messages
          .filter(m => m.chatId === chatId)
          .sort((a, b) => a.timestamp - b.timestamp);
        setActiveChatMessages(chatMsgs);
        StorageService.markMessagesAsRead(chatId, currentUser.uid);
      }
    }
  };

  useEffect(() => {
    refreshData();
    const handleStorageUpdate = () => refreshData();
    window.addEventListener('whisper_storage_updated', handleStorageUpdate);
    return () => window.removeEventListener('whisper_storage_updated', handleStorageUpdate);
  }, [currentUser?.uid, activeFriend?.uid]);

  // Initial auto login if initialUsername is provided
  useEffect(() => {
    if (initialUsername) {
      StorageService.getInitialData().then(data => {
        const uid = data.usernames[initialUsername];
        if (uid && data.users[uid]) {
          setCurrentUser(data.users[uid]);
          setScreen('chat_list');
          if (onUserChanged) onUserChanged(data.users[uid]);
        }
      });
    }
  }, [initialUsername]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChatMessages]);

  // Auth Handlers
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    try {
      const user = await StorageService.loginUser(usernameInput, passwordInput);
      setCurrentUser(user);
      setScreen('chat_list');
      setUsernameInput('');
      setPasswordInput('');
      if (onUserChanged) onUserChanged(user);
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Passwords do not match');
      return;
    }
    try {
      const { user, recoveryPhrase } = await StorageService.registerUser(usernameInput, passwordInput);
      setCurrentUser(user);
      setGeneratedMnemonic(recoveryPhrase);
      setScreen('mnemonic');
      setUsernameInput('');
      setPasswordInput('');
      setConfirmPasswordInput('');
      if (onUserChanged) onUserChanged(user);
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed');
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    const valid = validateMnemonicPhrase(recoveryPhrase);
    if (!valid.isValid) {
      setRecoveryError(valid.error || 'Invalid 12-word phrase.');
      return;
    }
    try {
      await StorageService.recoverPassword(recoveryUsername, recoveryPhrase, recoveryNewPassword);
      setRecoverySuccess(true);
    } catch (err: any) {
      setRecoveryError(err.message || 'Recovery failed');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setHasSearched(true);
    setSearchMessage(null);
    const result = await StorageService.searchExactUsername(searchQuery);
    setSearchResult(result);
  };

  const handleSendFriendRequest = async () => {
    if (!currentUser || !searchResult) return;
    try {
      await StorageService.sendFriendRequest(currentUser, searchResult.username);
      setSearchMessage(`Friend request sent to @${searchResult.username}!`);
      refreshData();
    } catch (err: any) {
      setSearchMessage(err.message);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      await StorageService.respondFriendRequest(requestId, currentUser.uid, 'accepted');
      refreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      await StorageService.respondFriendRequest(requestId, currentUser.uid, 'declined');
      refreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeFriend || !messageInput.trim()) return;
    const textToSend = messageInput.trim();
    setMessageInput('');
    try {
      await StorageService.sendTextMessage(currentUser, activeFriend.uid, textToSend);
      refreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setScreen('login');
    setActiveFriend(null);
    if (onUserChanged) onUserChanged(null);
  };

  return (
    <div className="flex flex-col items-center">
      {/* Phone Hardware Mockup Frame */}
      <div className="w-[360px] h-[720px] bg-[#0c0e12] rounded-[44px] p-3 shadow-2xl border-4 border-[#222834] relative flex flex-col overflow-hidden select-none">
        
        {/* Dynamic Island / Speaker Notch */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-[#181B22] rounded-full z-50 flex items-center justify-between px-3 border border-white/5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]/80 animate-pulse"></div>
          <div className="text-[10px] font-mono text-zinc-400">whisper</div>
          <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
        </div>

        {/* Screen Bezel Content */}
        <div className="w-full h-full bg-[#0F1115] rounded-[34px] overflow-hidden flex flex-col font-mono text-zinc-100 text-sm border border-zinc-800/80 pt-6">
          
          {/* Top Status Bar */}
          <div className="px-5 py-1.5 flex justify-between items-center text-[10px] text-zinc-400 border-b border-zinc-800/50">
            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="text-[9px] uppercase tracking-wider">{phoneLabel}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            </div>
          </div>

          {/* SCREEN ROUTING */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            
            {/* 1. LOGIN SCREEN */}
            {screen === 'login' && (
              <div className="flex-1 p-6 flex flex-col justify-between">
                <div>
                  <div className="mt-4 flex flex-col items-center text-center">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-inner">
                      <Lock className="w-7 h-7" />
                    </div>
                    <h1 className="text-lg font-bold tracking-widest text-zinc-100">WHISPER_TEXT</h1>
                    <p className="text-[11px] text-zinc-400 mt-1 max-w-[240px]">
                      Zero email. Zero phone numbers. Strict username auth & BIP-39 recovery.
                    </p>
                  </div>

                  {authError && (
                    <div className="mt-4 p-2.5 bg-rose-500/15 border border-rose-500/40 rounded-lg text-[11px] text-rose-300">
                      {authError}
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="mt-6 space-y-3.5">
                    <div>
                      <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. alice"
                        value={usernameInput}
                        onChange={e => setUsernameInput(e.target.value)}
                        className="w-full bg-[#181B22] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Password (min 8 chars)"
                          value={passwordInput}
                          onChange={e => setPasswordInput(e.target.value)}
                          className="w-full bg-[#181B22] border border-zinc-700/80 rounded-lg px-3 py-2 pr-9 text-xs text-white focus:outline-none focus:border-emerald-500"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setRecoveryError(null);
                          setRecoverySuccess(false);
                          setScreen('recovery');
                        }}
                        className="text-[11px] text-emerald-400 hover:underline"
                      >
                        Forgot password? (12-Word Phrase)
                      </button>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2.5 rounded-lg text-xs tracking-wider transition-colors shadow-lg shadow-emerald-500/20"
                    >
                      SIGN IN
                    </button>
                  </form>
                </div>

                <div className="pt-4 border-t border-zinc-800 text-center">
                  <span className="text-[11px] text-zinc-400">Need a new identity? </span>
                  <button
                    onClick={() => {
                      setAuthError(null);
                      setScreen('register');
                    }}
                    className="text-[11px] text-emerald-400 font-bold hover:underline"
                  >
                    Register
                  </button>

                  {/* Fast Seed Switcher */}
                  <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-zinc-500">
                    <span>Quick:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setUsernameInput('alice');
                        setPasswordInput('password123');
                      }}
                      className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:text-emerald-400 hover:bg-zinc-700"
                    >
                      @alice
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUsernameInput('bob');
                        setPasswordInput('password123');
                      }}
                      className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:text-emerald-400 hover:bg-zinc-700"
                    >
                      @bob
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. REGISTER SCREEN */}
            {screen === 'register' && (
              <div className="flex-1 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => setScreen('login')}
                      className="text-zinc-400 hover:text-white p-1"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-sm font-bold tracking-wider text-zinc-100">CREATE IDENTITY</h2>
                  </div>

                  <p className="text-[11px] text-zinc-400 mb-4 leading-relaxed">
                    Zero personal data required. A 12-word cryptographic seed phrase will be generated to back up your account.
                  </p>

                  {authError && (
                    <div className="mb-4 p-2 bg-rose-500/15 border border-rose-500/40 rounded text-[11px] text-rose-300">
                      {authError}
                    </div>
                  )}

                  <form onSubmit={handleRegister} className="space-y-3">
                    <div>
                      <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                        Choose Handle
                      </label>
                      <input
                        type="text"
                        placeholder="3-20 letters/numbers (e.g. charlie)"
                        value={usernameInput}
                        onChange={e => setUsernameInput(e.target.value)}
                        className="w-full bg-[#181B22] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        placeholder="Min 8 characters"
                        value={passwordInput}
                        onChange={e => setPasswordInput(e.target.value)}
                        className="w-full bg-[#181B22] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        placeholder="Re-enter password"
                        value={confirmPasswordInput}
                        onChange={e => setConfirmPasswordInput(e.target.value)}
                        className="w-full bg-[#181B22] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2.5 rounded-lg text-xs tracking-wider transition-colors mt-4"
                    >
                      GENERATE 12-WORD PHRASE
                    </button>
                  </form>
                </div>

                <div className="text-center text-[10px] text-zinc-500">
                  Secured by SHA-256 salted recovery hash & Firebase Firestore
                </div>
              </div>
            )}

            {/* 3. MNEMONIC RECOVERY DISPLAY SCREEN */}
            {screen === 'mnemonic' && (
              <div className="flex-1 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-xs font-bold tracking-widest text-zinc-100 uppercase">
                      BIP-39 Recovery Phrase
                    </h2>
                  </div>

                  <p className="text-[10.5px] text-zinc-400 leading-normal mb-3">
                    Write down these 12 words in order. This phrase is the <strong className="text-emerald-300">ONLY</strong> way to restore access. It cannot be recovered if lost.
                  </p>

                  {/* 12-Word Grid */}
                  <div className="grid grid-cols-2 gap-1.5 bg-[#181B22] p-2.5 rounded-xl border border-zinc-800">
                    {generatedMnemonic.split(' ').map((word, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-[#0F1115] px-2.5 py-1.5 rounded-md border border-zinc-800 text-[11px]"
                      >
                        <span className="text-emerald-400 font-bold w-4 text-[10px]">{idx + 1}.</span>
                        <span className="text-zinc-200 font-medium">{word}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedMnemonic);
                      setMnemonicCopied(true);
                      setTimeout(() => setMnemonicCopied(false), 2000);
                    }}
                    className="w-full mt-2.5 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] flex items-center justify-center gap-2 border border-zinc-700"
                  >
                    {mnemonicCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied to Clipboard</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Recovery Phrase</span>
                      </>
                    )}
                  </button>

                  <label className="flex items-start gap-2.5 mt-4 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasSavedMnemonic}
                      onChange={e => setHasSavedMnemonic(e.target.checked)}
                      className="mt-0.5 accent-emerald-500 rounded"
                    />
                    <span className="text-[10px] text-zinc-300 leading-tight">
                      I have written down or stored these 12 words in a safe, secure offline location.
                    </span>
                  </label>
                </div>

                <button
                  disabled={!hasSavedMnemonic}
                  onClick={() => setScreen('chat_list')}
                  className="w-full bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-emerald-400 text-black font-bold py-2.5 rounded-lg text-xs tracking-wider transition-colors"
                >
                  ENTER MESSENGER
                </button>
              </div>
            )}

            {/* 4. RECOVERY SCREEN */}
            {screen === 'recovery' && (
              <div className="flex-1 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setScreen('login')}
                      className="text-zinc-400 hover:text-white p-1"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-xs font-bold tracking-widest text-zinc-100">ACCOUNT RECOVERY</h2>
                  </div>

                  {recoverySuccess ? (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 mx-auto flex items-center justify-center mb-3">
                        <Check className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-white">Password Reset!</h3>
                      <p className="text-[11px] text-zinc-400 mt-2">
                        Your account has been recovered using your 12-word cryptographic seed.
                      </p>
                      <button
                        onClick={() => {
                          setRecoverySuccess(false);
                          setScreen('login');
                        }}
                        className="mt-6 w-full bg-emerald-500 text-black font-bold py-2 rounded-lg text-xs"
                      >
                        BACK TO LOGIN
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] text-zinc-400 mb-4">
                        Restore access by providing your exact username and your 12-word recovery phrase.
                      </p>

                      {recoveryError && (
                        <div className="mb-4 p-2 bg-rose-500/15 border border-rose-500/40 rounded text-[11px] text-rose-300">
                          {recoveryError}
                        </div>
                      )}

                      <form onSubmit={handleRecovery} className="space-y-3">
                        <div>
                          <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                            Exact Username
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. alice"
                            value={recoveryUsername}
                            onChange={e => setRecoveryUsername(e.target.value)}
                            className="w-full bg-[#181B22] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                            12-Word Recovery Phrase
                          </label>
                          <textarea
                            rows={3}
                            placeholder="word1 word2 word3 ... word12"
                            value={recoveryPhrase}
                            onChange={e => setRecoveryPhrase(e.target.value)}
                            className="w-full bg-[#181B22] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed resize-none"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-1">
                            New Password
                          </label>
                          <input
                            type="password"
                            placeholder="At least 8 characters"
                            value={recoveryNewPassword}
                            onChange={e => setRecoveryNewPassword(e.target.value)}
                            className="w-full bg-[#181B22] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                            required
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2.5 rounded-lg text-xs tracking-wider transition-colors mt-4"
                        >
                          VERIFY & RESET
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 5. MAIN CHAT LIST SCREEN */}
            {screen === 'chat_list' && currentUser && (
              <div className="flex-1 flex flex-col justify-between">
                {/* Header */}
                <div className="p-3.5 border-b border-zinc-800 bg-[#181B22]/50 flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-bold tracking-wider text-white">WHISPER</div>
                    <div className="text-[10.5px] text-emerald-400">@{currentUser.username}</div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Friend Requests Badge */}
                    <button
                      onClick={() => setScreen('requests')}
                      className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 relative"
                      title="Friend Requests"
                    >
                      <UserCheck className="w-4 h-4" />
                      {pendingRequests.length > 0 && (
                        <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-emerald-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                          {pendingRequests.length}
                        </span>
                      )}
                    </button>

                    {/* Find User */}
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResult(null);
                        setHasSearched(false);
                        setSearchMessage(null);
                        setScreen('search');
                      }}
                      className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
                      title="Exact User Search"
                    >
                      <Search className="w-4 h-4" />
                    </button>

                    {/* Sign Out */}
                    <button
                      onClick={handleSignOut}
                      className="p-1.5 text-zinc-400 hover:text-rose-400 rounded-lg hover:bg-zinc-800"
                      title="Sign Out"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Friends / Conversations List */}
                <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
                  {friends.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 flex flex-col items-center justify-center h-full">
                      <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-3 text-zinc-600">
                        <Lock className="w-5 h-5" />
                      </div>
                      <p className="text-xs text-zinc-400 font-bold">No active conversations</p>
                      <p className="text-[11px] text-zinc-500 mt-1 max-w-[200px]">
                        Find a friend by typing their exact username to send a request.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResult(null);
                          setHasSearched(false);
                          setSearchMessage(null);
                          setScreen('search');
                        }}
                        className="mt-4 px-3.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold hover:bg-emerald-500/20"
                      >
                        Search Exact Handle
                      </button>
                    </div>
                  ) : (
                    friends.map(friend => {
                      const chatId = StorageService.getChatId(currentUser.uid, friend.uid);
                      const roomMsgs = messages.filter(m => m.chatId === chatId);
                      const lastMsg = roomMsgs[roomMsgs.length - 1];
                      const unreadCount = roomMsgs.filter(m => m.senderId !== currentUser.uid && !m.isRead).length;

                      return (
                        <div
                          key={friend.uid}
                          onClick={() => {
                            setActiveFriend(friend);
                            setScreen('chat_room');
                          }}
                          className="p-3 hover:bg-zinc-800/40 cursor-pointer flex items-center gap-3 transition-colors"
                        >
                          <div className="w-9 h-9 rounded-full bg-zinc-800 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs uppercase">
                            {friend.username.slice(0, 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline">
                              <span className="text-xs font-bold text-zinc-200 truncate">
                                @{friend.username}
                              </span>
                              {lastMsg && (
                                <span className="text-[9px] text-zinc-500">
                                  {new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                              {lastMsg ? lastMsg.text : 'Encrypted text channel'}
                            </p>
                          </div>
                          {unreadCount > 0 && (
                            <span className="w-4 h-4 bg-emerald-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Bottom Quick Search Fab */}
                <div className="p-3 border-t border-zinc-800/80 bg-[#0F1115]">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResult(null);
                      setHasSearched(false);
                      setSearchMessage(null);
                      setScreen('search');
                    }}
                    className="w-full py-2 px-3 bg-[#181B22] hover:bg-zinc-800 border border-zinc-700/60 rounded-xl text-zinc-400 text-xs flex items-center justify-center gap-2"
                  >
                    <Search className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Search Exact Username...</span>
                  </button>
                </div>
              </div>
            )}

            {/* 6. EXACT USER DISCOVERY SCREEN */}
            {screen === 'search' && currentUser && (
              <div className="flex-1 p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setScreen('chat_list')}
                    className="text-zinc-400 hover:text-white p-1"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-xs font-bold tracking-widest text-zinc-100 uppercase">
                    Exact Discovery
                  </h2>
                </div>

                <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[10.5px] text-zinc-400 mb-3">
                  Privacy-first: No directory browsing or partial matching. Type the exact username to connect.
                </div>

                <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Enter exact handle (e.g. bob)"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 bg-[#181B22] border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg text-xs font-bold"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </form>

                {searchMessage && (
                  <div className="mb-3 p-2 bg-emerald-500/15 border border-emerald-500/40 rounded text-[11px] text-emerald-300">
                    {searchMessage}
                  </div>
                )}

                <div className="flex-1 flex flex-col justify-center">
                  {!hasSearched ? (
                    <div className="text-center text-zinc-500 text-xs">
                      Enter a full handle to lookup its Firestore record
                    </div>
                  ) : searchResult ? (
                    <div className="bg-[#181B22] border border-zinc-700/80 rounded-xl p-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 mx-auto flex items-center justify-center font-bold text-base mb-2">
                        {searchResult.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="text-sm font-bold text-white">@{searchResult.username}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        {searchResult.statusMessage || 'Available'}
                      </div>

                      {searchResult.uid === currentUser.uid ? (
                        <div className="mt-4 text-[11px] text-zinc-500 italic">
                          This is your own handle
                        </div>
                      ) : (
                        <button
                          onClick={handleSendFriendRequest}
                          className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>SEND FRIEND REQUEST</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-zinc-500 text-xs">
                      No user found with exact handle "@<span className="text-zinc-300">{searchQuery}</span>"
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 7. FRIEND REQUESTS SCREEN */}
            {screen === 'requests' && currentUser && (
              <div className="flex-1 p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setScreen('chat_list')}
                    className="text-zinc-400 hover:text-white p-1"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-xs font-bold tracking-widest text-zinc-100 uppercase">
                    Pending Requests
                  </h2>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {pendingRequests.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      No pending connection requests
                    </div>
                  ) : (
                    pendingRequests.map(req => (
                      <div
                        key={req.id}
                        className="bg-[#181B22] border border-zinc-800 rounded-xl p-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 text-emerald-400 font-bold text-xs flex items-center justify-center border border-zinc-700">
                            {req.senderUsername.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">@{req.senderUsername}</div>
                            <div className="text-[9.5px] text-zinc-500">Wants to message</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleDeclineRequest(req.id)}
                            className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg"
                            title="Decline"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleAcceptRequest(req.id)}
                            className="p-1.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg font-bold"
                            title="Accept"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 8. CHAT ROOM (STRICTLY TEXT-ONLY) */}
            {screen === 'chat_room' && currentUser && activeFriend && (
              <div className="flex-1 flex flex-col justify-between">
                {/* Room Topbar */}
                <div className="p-3 border-b border-zinc-800 bg-[#181B22]/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setScreen('chat_list')}
                      className="text-zinc-400 hover:text-white p-0.5"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="w-7 h-7 rounded-full bg-zinc-800 text-emerald-400 text-xs font-bold flex items-center justify-center border border-emerald-500/40">
                      {activeFriend.username.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">@{activeFriend.username}</div>
                      <div className="text-[9px] text-emerald-400/80 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Text-only • Real-time
                      </div>
                    </div>
                  </div>
                </div>

                {/* Text Policy Banner */}
                <div className="py-1 px-3 bg-zinc-900/90 text-center text-[9px] text-zinc-500 border-b border-zinc-800 tracking-wider">
                  TEXT ONLY • ZERO ATTACHMENTS • ZERO PROFILING
                </div>

                {/* Messages Feed */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {activeChatMessages.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      Send your first text message to @{activeFriend.username}
                    </div>
                  ) : (
                    activeChatMessages.map(msg => {
                      const isMe = msg.senderId === currentUser.uid;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[82%] px-3 py-2 rounded-2xl text-xs break-words leading-relaxed ${
                              isMe
                                ? 'bg-emerald-600/90 text-white rounded-br-xs border border-emerald-400/30'
                                : 'bg-[#181B22] text-zinc-200 rounded-bl-xs border border-zinc-800'
                            }`}
                          >
                            {msg.text}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 px-1 text-[9px] text-zinc-500">
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {isMe && (
                              <CheckCheck
                                className={`w-3 h-3 ${msg.isRead ? 'text-emerald-400' : 'text-zinc-500'}`}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Strict Text Input Area */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-2.5 border-t border-zinc-800 bg-[#0F1115] flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder="Type a text message..."
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    maxLength={2000}
                    className="flex-1 bg-[#181B22] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!messageInput.trim()}
                    className="w-8 h-8 rounded-xl bg-emerald-500 disabled:opacity-40 hover:bg-emerald-400 text-black flex items-center justify-center transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}

          </div>

          {/* Android / iOS Home Indicator Pill */}
          <div className="py-2 flex justify-center bg-[#0F1115]">
            <div className="w-28 h-1 bg-zinc-700/60 rounded-full"></div>
          </div>

        </div>
      </div>
    </div>
  );
};
