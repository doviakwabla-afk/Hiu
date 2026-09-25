import { generate12WordMnemonic, hashPhraseWithSalt, generateRandomSalt } from '../utils/bip39';

export interface StoredUser {
  uid: string;
  username: string;
  createdAt: number;
  statusMessage?: string;
  passwordHash: string; // SHA-256 password hash
  recoveryPhraseHash: string;
  recoverySalt: string;
  // Kept in demo storage for easy inspection/recovery verification during testing
  demoRecoveryPhrase?: string;
}

export interface StoredFriendRequest {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  receiverUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export interface StoredFriend {
  uid: string;
  username: string;
  addedAt: number;
}

export interface StoredTextMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderUsername: string;
  text: string;
  timestamp: number;
  isRead: boolean;
}

const STORAGE_KEY = 'whisper_text_firestore_v1';

export class StorageService {
  private static async hashString(input: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  public static async getInitialData(): Promise<{
    users: Record<string, StoredUser>;
    usernames: Record<string, string>; // username -> uid
    friendRequests: StoredFriendRequest[];
    friends: Record<string, StoredFriend[]>; // uid -> friends
    messages: StoredTextMessage[];
  }> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // Fallback to seeding
      }
    }

    // Seed initial users: "alice" and "bob"
    const aliceSalt = generateRandomSalt();
    const alicePhrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
    const aliceRecHash = await hashPhraseWithSalt(alicePhrase, aliceSalt);
    const alicePassHash = await this.hashString("password123");

    const bobSalt = generateRandomSalt();
    const bobPhrase = "account accuse achieve acid acoustic acquire across act action actor actress actual";
    const bobRecHash = await hashPhraseWithSalt(bobPhrase, bobSalt);
    const bobPassHash = await this.hashString("password123");

    const alice: StoredUser = {
      uid: 'user_alice_001',
      username: 'alice',
      createdAt: Date.now() - 86400000 * 2,
      statusMessage: 'Text-only privacy maximalist',
      passwordHash: alicePassHash,
      recoveryPhraseHash: aliceRecHash,
      recoverySalt: aliceSalt,
      demoRecoveryPhrase: alicePhrase,
    };

    const bob: StoredUser = {
      uid: 'user_bob_002',
      username: 'bob',
      createdAt: Date.now() - 86400000,
      statusMessage: 'Signal-free zone. Text only.',
      passwordHash: bobPassHash,
      recoveryPhraseHash: bobRecHash,
      recoverySalt: bobSalt,
      demoRecoveryPhrase: bobPhrase,
    };

    const initial = {
      users: {
        [alice.uid]: alice,
        [bob.uid]: bob,
      },
      usernames: {
        alice: alice.uid,
        bob: bob.uid,
      },
      friendRequests: [
        {
          id: 'req_seed_001',
          senderId: bob.uid,
          senderUsername: 'bob',
          receiverId: alice.uid,
          receiverUsername: 'alice',
          status: 'accepted' as const,
          createdAt: Date.now() - 3600000 * 5,
        }
      ],
      friends: {
        [alice.uid]: [{ uid: bob.uid, username: 'bob', addedAt: Date.now() - 3600000 * 5 }],
        [bob.uid]: [{ uid: alice.uid, username: 'alice', addedAt: Date.now() - 3600000 * 5 }],
      },
      messages: [
        {
          id: 'msg_001',
          chatId: 'user_alice_001_user_bob_002',
          senderId: bob.uid,
          senderUsername: 'bob',
          text: 'Hey Alice! Glad we migrated to text-only whisper app.',
          timestamp: Date.now() - 3600000 * 2,
          isRead: true,
        },
        {
          id: 'msg_002',
          chatId: 'user_alice_001_user_bob_002',
          senderId: alice.uid,
          senderUsername: 'alice',
          text: 'No phone numbers, no emails, no profile scrapers. Pure text architecture.',
          timestamp: Date.now() - 3600000,
          isRead: true,
        },
        {
          id: 'msg_003',
          chatId: 'user_alice_001_user_bob_002',
          senderId: bob.uid,
          senderUsername: 'bob',
          text: 'Did you back up your 12-word recovery phrase?',
          timestamp: Date.now() - 1800000,
          isRead: false,
        }
      ],
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  private static saveData(data: any) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.dispatchEvent(new Event('whisper_storage_updated'));
  }

  public static async registerUser(username: string, password: string): Promise<{
    user: StoredUser;
    recoveryPhrase: string;
  }> {
    const data = await this.getInitialData();
    const normalized = username.trim().toLowerCase();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(normalized)) {
      throw new Error('Username must be 3-20 alphanumeric characters or underscores.');
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    if (data.usernames[normalized]) {
      throw new Error(`The username "@${normalized}" is already taken.`);
    }

    const uid = 'user_' + normalized + '_' + Math.random().toString(36).substring(2, 9);
    const recoveryPhrase = generate12WordMnemonic();
    const salt = generateRandomSalt();
    const recoveryPhraseHash = await hashPhraseWithSalt(recoveryPhrase, salt);
    const passwordHash = await this.hashString(password);

    const newUser: StoredUser = {
      uid,
      username: normalized,
      createdAt: Date.now(),
      statusMessage: 'Encrypted text node',
      passwordHash,
      recoveryPhraseHash,
      recoverySalt: salt,
      demoRecoveryPhrase: recoveryPhrase,
    };

    data.users[uid] = newUser;
    data.usernames[normalized] = uid;
    data.friends[uid] = [];

    this.saveData(data);
    return { user: newUser, recoveryPhrase };
  }

  public static async loginUser(username: string, password: string): Promise<StoredUser> {
    const data = await this.getInitialData();
    const normalized = username.trim().toLowerCase();

    const uid = data.usernames[normalized];
    if (!uid) {
      throw new Error('Incorrect username or password.');
    }

    const user = data.users[uid];
    const passwordHash = await this.hashString(password);
    if (!user || user.passwordHash !== passwordHash) {
      throw new Error('Incorrect username or password.');
    }

    return user;
  }

  public static async recoverPassword(
    username: string,
    phrase: string,
    newPassword: string
  ): Promise<void> {
    const data = await this.getInitialData();
    const normalized = username.trim().toLowerCase();

    const uid = data.usernames[normalized];
    if (!uid) {
      throw new Error(`No account found with username "@${normalized}".`);
    }

    const user = data.users[uid];
    if (!user) {
      throw new Error('User record not found.');
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters.');
    }

    const computedHash = await hashPhraseWithSalt(phrase, user.recoverySalt);
    if (computedHash !== user.recoveryPhraseHash) {
      throw new Error('The 12-word recovery phrase does not match this account.');
    }

    user.passwordHash = await this.hashString(newPassword);
    data.users[uid] = user;
    this.saveData(data);
  }

  public static async searchExactUsername(query: string): Promise<StoredUser | null> {
    const data = await this.getInitialData();
    const normalized = query.trim().toLowerCase();
    const uid = data.usernames[normalized];
    if (!uid) return null;
    return data.users[uid] || null;
  }

  public static async sendFriendRequest(sender: StoredUser, targetUsername: string): Promise<StoredFriendRequest> {
    const data = await this.getInitialData();
    const normalized = targetUsername.trim().toLowerCase();

    const targetUid = data.usernames[normalized];
    if (!targetUid) {
      throw new Error(`User "@${normalized}" not found.`);
    }

    if (targetUid === sender.uid) {
      throw new Error('You cannot add yourself as a friend.');
    }

    const senderFriends = data.friends[sender.uid] || [];
    if (senderFriends.some(f => f.uid === targetUid)) {
      throw new Error(`You are already friends with @${normalized}.`);
    }

    const existingPending = data.friendRequests.find(
      r => r.senderId === sender.uid && r.receiverId === targetUid && r.status === 'pending'
    );
    if (existingPending) {
      throw new Error(`A friend request is already pending for @${normalized}.`);
    }

    const reversePending = data.friendRequests.find(
      r => r.senderId === targetUid && r.receiverId === sender.uid && r.status === 'pending'
    );
    if (reversePending) {
      // Auto accept mutual request
      return this.respondFriendRequest(reversePending.id, sender.uid, 'accepted');
    }

    const req: StoredFriendRequest = {
      id: 'req_' + Math.random().toString(36).substring(2, 9),
      senderId: sender.uid,
      senderUsername: sender.username,
      receiverId: targetUid,
      receiverUsername: normalized,
      status: 'pending',
      createdAt: Date.now(),
    };

    data.friendRequests.push(req);
    this.saveData(data);
    return req;
  }

  public static async respondFriendRequest(
    requestId: string,
    currentUserId: string,
    decision: 'accepted' | 'declined'
  ): Promise<StoredFriendRequest> {
    const data = await this.getInitialData();
    const req = data.friendRequests.find(r => r.id === requestId);
    if (!req) throw new Error('Request not found.');

    if (req.receiverId !== currentUserId) {
      throw new Error('Unauthorized to respond to this request.');
    }

    req.status = decision;

    if (decision === 'accepted') {
      if (!data.friends[req.senderId]) data.friends[req.senderId] = [];
      if (!data.friends[req.receiverId]) data.friends[req.receiverId] = [];

      if (!data.friends[req.senderId].some(f => f.uid === req.receiverId)) {
        data.friends[req.senderId].push({
          uid: req.receiverId,
          username: req.receiverUsername,
          addedAt: Date.now(),
        });
      }

      if (!data.friends[req.receiverId].some(f => f.uid === req.senderId)) {
        data.friends[req.receiverId].push({
          uid: req.senderId,
          username: req.senderUsername,
          addedAt: Date.now(),
        });
      }
    }

    this.saveData(data);
    return req;
  }

  public static getChatId(uid1: string, uid2: string): string {
    return [uid1, uid2].sort().join('_');
  }

  public static async sendTextMessage(
    sender: StoredUser,
    peerUid: string,
    text: string
  ): Promise<StoredTextMessage> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Cannot send empty text message.');
    if (trimmed.length > 2000) throw new Error('Message exceeds 2000 character limit.');

    const data = await this.getInitialData();
    const chatId = this.getChatId(sender.uid, peerUid);

    const msg: StoredTextMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      chatId,
      senderId: sender.uid,
      senderUsername: sender.username,
      text: trimmed,
      timestamp: Date.now(),
      isRead: false,
    };

    data.messages.push(msg);
    this.saveData(data);
    return msg;
  }

  public static async markMessagesAsRead(chatId: string, currentUserId: string): Promise<void> {
    const data = await this.getInitialData();
    let changed = false;
    data.messages.forEach(m => {
      if (m.chatId === chatId && m.senderId !== currentUserId && !m.isRead) {
        m.isRead = true;
        changed = true;
      }
    });
    if (changed) {
      this.saveData(data);
    }
  }

  public static resetToSeed(): void {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('whisper_storage_updated'));
  }
}
