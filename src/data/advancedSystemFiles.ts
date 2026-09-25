import { CodeFile } from '../data/flutterCodebase';

export const ADVANCED_SYSTEM_FILES: CodeFile[] = [
  // 1. Local Database Service with SQLite (sqflite)
  {
    path: 'lib/core/database/local_database_service.dart',
    name: 'local_database_service.dart',
    language: 'dart',
    category: 'core',
    description: 'SQLite (sqflite) persistent local caching service supporting offline message queuing and pending sync status.',
    code: `import 'dart:async';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:whisper_text/features/chat/models/message_model.dart';

enum SyncStatus {
  synced,
  pendingSync,
  failed;

  static SyncStatus fromString(String? val) {
    switch (val) {
      case 'synced':
        return SyncStatus.synced;
      case 'failed':
        return SyncStatus.failed;
      case 'pendingSync':
      default:
        return SyncStatus.pendingSync;
    }
  }
}

class LocalMessage {
  final String id;
  final String chatId;
  final String senderId;
  final String receiverId;
  final String text;
  final int timestampMs;
  final String deliveryStatus;
  final SyncStatus syncStatus;

  LocalMessage({
    required this.id,
    required this.chatId,
    required this.senderId,
    required this.receiverId,
    required this.text,
    required this.timestampMs,
    required this.deliveryStatus,
    this.syncStatus = SyncStatus.synced,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'chatId': chatId,
      'senderId': senderId,
      'receiverId': receiverId,
      'text': text,
      'timestampMs': timestampMs,
      'deliveryStatus': deliveryStatus,
      'syncStatus': syncStatus.name,
    };
  }

  factory LocalMessage.fromMap(Map<String, dynamic> map) {
    return LocalMessage(
      id: map['id'] as String,
      chatId: map['chatId'] as String,
      senderId: map['senderId'] as String,
      receiverId: map['receiverId'] as String,
      text: map['text'] as String,
      timestampMs: map['timestampMs'] as int,
      deliveryStatus: map['deliveryStatus'] as String? ?? 'sent',
      syncStatus: SyncStatus.fromString(map['syncStatus'] as String?),
    );
  }

  Message toMessage() {
    return Message(
      id: id,
      senderId: senderId,
      receiverId: receiverId,
      text: text,
      timestamp: DateTime.fromMillisecondsSinceEpoch(timestampMs),
      deliveryStatus: DeliveryStatus.fromString(deliveryStatus),
    );
  }
}

class LocalDatabaseService {
  static final LocalDatabaseService _instance = LocalDatabaseService._internal();
  factory LocalDatabaseService() => _instance;
  LocalDatabaseService._internal();

  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _initDatabase();
    return _db!;
  }

  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'whisper_messages_v1.db');

    return await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE local_messages (
            id TEXT PRIMARY KEY,
            chatId TEXT NOT NULL,
            senderId TEXT NOT NULL,
            receiverId TEXT NOT NULL,
            text TEXT NOT NULL,
            timestampMs INTEGER NOT NULL,
            deliveryStatus TEXT NOT NULL,
            syncStatus TEXT NOT NULL
          )
        ''');
        await db.execute('CREATE INDEX idx_chatId ON local_messages(chatId)');
        await db.execute('CREATE INDEX idx_syncStatus ON local_messages(syncStatus)');
      },
    );
  }

  /// Inserts or replaces a cached message
  Future<void> saveMessage(LocalMessage message) async {
    final db = await database;
    await db.insert(
      'local_messages',
      message.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Batch cache inbound or synced messages from Firestore
  Future<void> saveBatchMessages(List<LocalMessage> messages) async {
    final db = await database;
    final batch = db.batch();
    for (final m in messages) {
      batch.insert('local_messages', m.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  /// Retrieves cached messages for a specific conversation
  Future<List<LocalMessage>> getMessagesForChat(String chatId) async {
    final db = await database;
    final maps = await db.query(
      'local_messages',
      where: 'chatId = ?',
      whereArgs: [chatId],
      orderBy: 'timestampMs ASC',
    );
    return maps.map((m) => LocalMessage.fromMap(m)).toList();
  }

  /// Retrieves all messages waiting to be pushed to Firestore
  Future<List<LocalMessage>> getPendingSyncMessages() async {
    final db = await database;
    final maps = await db.query(
      'local_messages',
      where: 'syncStatus = ?',
      whereArgs: ['pendingSync'],
      orderBy: 'timestampMs ASC',
    );
    return maps.map((m) => LocalMessage.fromMap(m)).toList();
  }

  /// Updates status once synced with Firestore
  Future<void> markMessageSynced(String messageId) async {
    final db = await database;
    await db.update(
      'local_messages',
      {'syncStatus': 'synced'},
      where: 'id = ?',
      whereArgs: [messageId],
    );
  }
}
`
  },

  // 2. Updated Offline-Capable Chat Service with Connectivity Sync
  {
    path: 'lib/features/chat/services/offline_chat_service.dart',
    name: 'offline_chat_service.dart',
    language: 'dart',
    category: 'chat',
    description: 'Offline-first Chat Service writing immediately to SQLite and auto-syncing pending messages when internet connectivity resumes.',
    code: `import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:uuid/uuid.dart';
import 'package:whisper_text/core/database/local_database_service.dart';
import 'package:whisper_text/features/chat/models/message_model.dart';

class OfflineChatService {
  final FirebaseFirestore _firestore;
  final LocalDatabaseService _localDb;
  final Connectivity _connectivity;
  final _uuid = const Uuid();

  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  bool _isSyncing = false;

  OfflineChatService({
    FirebaseFirestore? firestore,
    LocalDatabaseService? localDb,
    Connectivity? connectivity,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _localDb = localDb ?? LocalDatabaseService(),
        _connectivity = connectivity ?? Connectivity() {
    _startConnectivitySyncListener();
  }

  void dispose() {
    _connectivitySubscription?.cancel();
  }

  void _startConnectivitySyncListener() {
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((results) {
      final isConnected = results.any((r) => r != ConnectivityResult.none);
      if (isConnected) {
        syncPendingMessages();
      }
    });
  }

  static String getChatId(String uid1, String uid2) {
    final sorted = [uid1, uid2]..sort();
    return sorted.join('_');
  }

  /// Sends a text message with SQLite immediate write and offline pending status.
  Future<Message> sendMessage({
    required String senderId,
    required String receiverId,
    required String text,
  }) async {
    final cleanText = text.trim();
    if (cleanText.isEmpty) throw ArgumentError('Message text cannot be empty');
    if (cleanText.length > 2000) throw ArgumentError('Message exceeds 2000 characters');

    final chatId = getChatId(senderId, receiverId);
    final messageId = _uuid.v4();
    final now = DateTime.now();

    // 1. Write immediately to local SQLite database with 'pendingSync'
    final localMsg = LocalMessage(
      id: messageId,
      chatId: chatId,
      senderId: senderId,
      receiverId: receiverId,
      text: cleanText,
      timestampMs: now.millisecondsSinceEpoch,
      deliveryStatus: DeliveryStatus.sent.name,
      syncStatus: SyncStatus.pendingSync,
    );

    await _localDb.saveMessage(localMsg);

    // 2. Attempt push to Firestore if online
    try {
      final connectivityResult = await _connectivity.checkConnectivity();
      final isOnline = connectivityResult.any((r) => r != ConnectivityResult.none);

      if (isOnline) {
        await _pushSingleMessageToFirestore(localMsg);
        await _localDb.markMessageSynced(messageId);
      }
    } catch (_) {
      // Retained in SQLite as pendingSync; will auto-sync when network returns
    }

    return localMsg.toMessage();
  }

  Future<void> _pushSingleMessageToFirestore(LocalMessage msg) async {
    final chatDoc = _firestore.collection('chats').doc(msg.chatId);
    final msgDoc = chatDoc.collection('messages').doc(msg.id);

    final batch = _firestore.batch();
    batch.set(msgDoc, {
      'senderId': msg.senderId,
      'receiverId': msg.receiverId,
      'text': msg.text,
      'timestamp': Timestamp.fromMillisecondsSinceEpoch(msg.timestampMs),
      'deliveryStatus': msg.deliveryStatus,
    });

    batch.set(
      chatDoc,
      {
        'chatId': msg.chatId,
        'participants': [msg.senderId, msg.receiverId]..sort(),
        'lastMessage': msg.text,
        'lastMessageTime': Timestamp.fromMillisecondsSinceEpoch(msg.timestampMs),
        'lastSenderId': msg.senderId,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );

    await batch.commit();
  }

  /// Automatically called whenever internet connectivity is restored
  Future<void> syncPendingMessages() async {
    if (_isSyncing) return;
    _isSyncing = true;

    try {
      final pending = await _localDb.getPendingSyncMessages();
      for (final msg in pending) {
        try {
          await _pushSingleMessageToFirestore(msg);
          await _localDb.markMessageSynced(msg.id);
        } catch (_) {
          break; // Stop iteration if connection drops again
        }
      }
    } finally {
      _isSyncing = false;
    }
  }

  /// Unified stream combining local SQLite cache and real-time Firestore snapshots
  Stream<List<Message>> streamMessages(String currentUserId, String friendId) {
    final chatId = getChatId(currentUserId, friendId);

    return _firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', descending: false)
        .limitToLast(100)
        .snapshots()
        .asyncMap((snapshot) async {
          // 1. Cache remote messages into SQLite
          final remoteMessages = snapshot.docs.map((doc) {
            final data = doc.data();
            final ts = (data['timestamp'] as Timestamp?)?.millisecondsSinceEpoch ??
                DateTime.now().millisecondsSinceEpoch;

            return LocalMessage(
              id: doc.id,
              chatId: chatId,
              senderId: data['senderId'] as String? ?? '',
              receiverId: data['receiverId'] as String? ?? '',
              text: data['text'] as String? ?? '',
              timestampMs: ts,
              deliveryStatus: data['deliveryStatus'] as String? ?? 'sent',
              syncStatus: SyncStatus.synced,
            );
          }).toList();

          await _localDb.saveBatchMessages(remoteMessages);

          // 2. Load all cached + pending messages from SQLite
          final localList = await _localDb.getMessagesForChat(chatId);
          return localList.map((l) => l.toMessage()).toList();
        });
  }
}
`
  },

  // 3. Push Notification Service (firebase_messaging)
  {
    path: 'lib/core/notifications/push_notification_service.dart',
    name: 'push_notification_service.dart',
    language: 'dart',
    category: 'core',
    description: 'Background and foreground FCM Push Notification Service with permission requests and token synchronization.',
    code: `import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

/// Top-level background message handler invoked when app is terminated or in background.
/// Must be declared as a top-level function outside of any class.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Process payload in background (e.g. SQLite offline insertion or local sync)
}

class PushNotificationService {
  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  static final PushNotificationService _instance = PushNotificationService._internal();
  factory PushNotificationService() => _instance;
  PushNotificationService._internal();

  /// Requests notification permissions for iOS and Android 13+
  Future<bool> requestPermissions() async {
    final settings = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  /// Retrieves the unique device FCM token and registers it in Firestore /users/{uid}
  Future<String?> syncFCMTokenToFirestore(String currentUserId) async {
    try {
      final token = await _fcm.getToken();
      if (token != null) {
        await _firestore.collection('users').doc(currentUserId).set({
          'fcmToken': token,
          'fcmPlatform': Platform.isIOS ? 'ios' : 'android',
          'fcmUpdatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      }

      // Listen for FCM token refresh events
      _fcm.onTokenRefresh.listen((newToken) async {
        await _firestore.collection('users').doc(currentUserId).set({
          'fcmToken': newToken,
          'fcmUpdatedAt': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true));
      });

      return token;
    } catch (_) {
      return null;
    }
  }

  /// Initializes foreground and tap listeners
  void initializeForegroundListeners(BuildContext context) {
    // 1. Foreground message handler: display in-app banner/snackbar
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      final notification = message.notification;
      if (notification != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFF181B22),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: const BorderSide(color: Color(0xFF10B981), width: 1),
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  notification.title ?? 'New Message',
                  style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF10B981)),
                ),
                const SizedBox(height: 2),
                Text(notification.body ?? '', style: const TextStyle(color: Colors.white)),
              ],
            ),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    });

    // 2. Notification opened app handler
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      // Navigate to chat if payload contains sender info
    });
  }
}
`
  },

  // 4. Backend Cloud Function in Node.js (functions/src/index.ts)
  {
    path: 'functions/src/index.ts',
    name: 'index.ts',
    language: 'typescript',
    category: 'backend',
    description: 'Firebase Cloud Function listening on /chats/{chatId}/messages/{msgId} to dispatch FCM notifications with expired token pruning.',
    code: `import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

admin.initializeApp();

/**
 * Cloud Function triggered on new message write:
 * Reads receiverId, fetches receiver's FCM token, constructs notification payload,
 * dispatches via firebase-admin, and deletes stale/invalid tokens.
 */
export const onMessageCreated = functions.firestore.onDocumentCreated(
  {
    document: "chats/{chatId}/messages/{messageId}",
    region: "europe-west2",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const messageData = snap.data();
    const senderId = messageData.senderId as string;
    const receiverId = messageData.receiverId as string;
    const messageText = messageData.text as string;

    if (!receiverId || !messageText) return;

    const db = admin.firestore();

    try {
      // 1. Fetch sender username
      const senderDoc = await db.collection("users").doc(senderId).get();
      const senderUsername = senderDoc.exists
        ? senderDoc.data()?.username || "Someone"
        : "Someone";

      // 2. Fetch receiver's FCM token
      const receiverDoc = await db.collection("users").doc(receiverId).get();
      if (!receiverDoc.exists) return;

      const receiverData = receiverDoc.data();
      const fcmToken = receiverData?.fcmToken as string | undefined;

      if (!fcmToken) {
        // Recipient does not have an active registered FCM device
        return;
      }

      // 3. Construct Notification Payload
      const payload: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: \`@\${senderUsername}\`,
          body: messageText.length > 100 ? \`\${messageText.substring(0, 97)}...\` : messageText,
        },
        data: {
          chatId: event.params.chatId,
          senderId: senderId,
          messageId: event.params.messageId,
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channelId: "whisper_chat_channel",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      // 4. Send FCM Push Notification
      await admin.messaging().send(payload);
    } catch (error: any) {
      // 5. Handle expired or invalid FCM tokens
      const errorCode = error.code || error.errorInfo?.code;
      if (
        errorCode === "messaging/invalid-registration-token" ||
        errorCode === "messaging/registration-token-not-registered"
      ) {
        // Prune dead token from receiver's profile
        await db.collection("users").doc(receiverId).update({
          fcmToken: admin.firestore.FieldValue.delete(),
          fcmInvalidatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }
);
`
  },

  // 5. RTDB Presence Service
  {
    path: 'lib/core/presence/presence_service.dart',
    name: 'presence_service.dart',
    language: 'dart',
    category: 'core',
    description: 'Firebase Realtime Database (RTDB) presence service managing online status and automatic onDisconnect() lastSeen triggers.',
    code: `import 'dart:async';
import 'package:firebase_database/firebase_database.dart';

class UserPresence {
  final bool isOnline;
  final DateTime? lastSeen;

  UserPresence({
    required this.isOnline,
    this.lastSeen,
  });

  factory UserPresence.fromMap(Map<dynamic, dynamic>? map) {
    if (map == null) return UserPresence(isOnline: false);
    final isOnline = map['isOnline'] as bool? ?? false;
    final lastSeenMs = map['lastSeen'] as int?;
    return UserPresence(
      isOnline: isOnline,
      lastSeen: lastSeenMs != null ? DateTime.fromMillisecondsSinceEpoch(lastSeenMs) : null,
    );
  }
}

class PresenceService {
  final FirebaseDatabase _rtdb;

  static final PresenceService _instance = PresenceService._internal();
  factory PresenceService({FirebaseDatabase? rtdb}) {
    return _instance;
  }
  PresenceService._internal() : _rtdb = FirebaseDatabase.instance;

  StreamSubscription? _connectedSubscription;

  /// Connects to RTDB, sets isOnline: true, and registers onDisconnect hook
  void configureUserPresence(String currentUserId) {
    final userStatusRef = _rtdb.ref('presence/\$currentUserId');
    final connectedRef = _rtdb.ref('.info/connected');

    _connectedSubscription?.cancel();
    _connectedSubscription = connectedRef.onValue.listen((event) async {
      final isConnected = event.snapshot.value as bool? ?? false;

      if (!isConnected) return;

      // Register disconnect trigger: when app is killed or loses socket, RTDB executes this
      await userStatusRef.onDisconnect().set({
        'isOnline': false,
        'lastSeen': ServerValue.timestamp,
      });

      // User is in foreground and connected
      await userStatusRef.set({
        'isOnline': true,
        'lastSeen': ServerValue.timestamp,
      });
    });
  }

  /// Sets offline status explicitly (e.g. on manual logout)
  Future<void> setOffline(String currentUserId) async {
    final userStatusRef = _rtdb.ref('presence/\$currentUserId');
    await userStatusRef.set({
      'isOnline': false,
      'lastSeen': ServerValue.timestamp,
    });
  }

  /// Streams real-time presence for a specific user ID
  Stream<UserPresence> streamUserPresence(String userId) {
    return _rtdb.ref('presence/\$userId').onValue.map((event) {
      final data = event.snapshot.value as Map<dynamic, dynamic>?;
      return UserPresence.fromMap(data);
    });
  }

  void dispose() {
    _connectedSubscription?.cancel();
  }
}
`
  },

  // 6. Presence Indicator UI Widget
  {
    path: 'lib/features/chat/presentation/widgets/presence_indicator.dart',
    name: 'presence_indicator.dart',
    language: 'dart',
    category: 'chat',
    description: 'Flutter UI widget streaming RTDB presence and displaying green "Online" indicator or formatted "Last seen at [Time]".',
    code: `import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:whisper_text/core/presence/presence_service.dart';

class PresenceIndicator extends StatelessWidget {
  final String userId;
  final TextStyle? textStyle;

  const PresenceIndicator({
    super.key,
    required this.userId,
    this.textStyle,
  });

  String _formatLastSeen(DateTime? lastSeen) {
    if (lastSeen == null) return 'Offline';
    final now = DateTime.now();
    final difference = now.difference(lastSeen);

    if (difference.inMinutes < 1) {
      return 'Last seen just now';
    } else if (difference.inHours < 1) {
      return 'Last seen \${difference.inMinutes}m ago';
    } else if (difference.inDays < 1) {
      return 'Last seen at \${DateFormat('h:mm a').format(lastSeen)}';
    } else {
      return 'Last seen \${DateFormat('MMM d, h:mm a').format(lastSeen)}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final presenceService = PresenceService();

    return StreamBuilder<UserPresence>(
      stream: presenceService.streamUserPresence(userId),
      builder: (context, snapshot) {
        final presence = snapshot.data ?? UserPresence(isOnline: false);

        if (presence.isOnline) {
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                  color: Color(0xFF10B981),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 5),
              Text(
                'Online',
                style: textStyle ??
                    const TextStyle(
                      color: Color(0xFF10B981),
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
              ),
            ],
          );
        }

        return Text(
          _formatLastSeen(presence.lastSeen),
          style: textStyle ??
              const TextStyle(
                color: Color(0xFF9CA3AF),
                fontSize: 11,
              ),
        );
      },
    );
  }
}
`
  }
];
