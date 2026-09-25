import { AUTH_FLOW_FILES } from './authFlowFiles';
import { USER_DISCOVERY_FILES } from './userDiscoveryFiles';
import { CHAT_ENGINE_FILES } from './chatEngineFiles';
import { ADVANCED_SYSTEM_FILES } from './advancedSystemFiles';

export interface CodeFile {
  path: string;
  name: string;
  language: string;
  category: 'core' | 'auth' | 'friends' | 'chat' | 'config' | 'backend';
  description: string;
  code: string;
}

const BASE_PROJECT_FILES: CodeFile[] = [
  {
    path: 'pubspec.yaml',
    name: 'pubspec.yaml',
    language: 'yaml',
    category: 'config',
    description: 'Project dependencies including Flutter Riverpod, Firebase Core, Cloud Firestore, Firebase Auth, Firebase Messaging, Firebase Database (RTDB), sqflite, and connectivity_plus.',
    code: `name: whisper_text
description: "Text-only messaging app with offline SQLite caching, FCM background push notifications, and RTDB presence."
publish_to: "none"
version: 1.0.0+1

environment:
  sdk: ">=3.2.0 <4.0.0"
  flutter: ">=3.16.0"

dependencies:
  flutter:
    sdk: flutter
  
  # State Management
  flutter_riverpod: ^2.5.1
  riverpod_annotation: ^2.3.5

  # Firebase Suite
  firebase_core: ^2.30.0
  cloud_firestore: ^4.17.2
  firebase_auth: ^4.19.4
  firebase_messaging: ^14.9.2
  firebase_database: ^10.5.2

  # Offline Storage & Networking
  sqflite: ^2.3.3+1
  path: ^1.9.0
  connectivity_plus: ^6.0.3

  # Security & BIP-39 Recovery
  bip39: ^1.0.6
  crypto: ^3.0.3

  # Utilities & UI
  intl: ^0.19.0
  uuid: ^4.4.0
  cupertino_icons: ^1.0.6

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.2

flutter:
  uses-material-design: true
`
  },
  {
    path: 'firestore.rules',
    name: 'firestore.rules',
    language: 'javascript',
    category: 'backend',
    description: 'Production Firebase security rules strictly enforcing atomic username uniqueness, exact discovery, and text-only payload validation.',
    code: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return isAuthenticated() && request.auth.uid == uid;
    }

    // Username reservation registry
    // Strictly enforces lowercase exact mapping and atomicity
    match /usernames/{username} {
      allow get: if isAuthenticated();
      allow list: if false; // Deny full collection scan/scraping
      allow create: if isAuthenticated() 
        && request.resource.data.uid == request.auth.uid
        && username == username.lower()
        && request.resource.data.username == username
        && !exists(/databases/$(database)/documents/usernames/$(username));
      allow update, delete: if false; // Usernames are permanent
    }

    // Public user profiles
    match /users/{userId} {
      allow get: if isAuthenticated();
      allow list: if false;
      allow create: if isOwner(userId);
      allow update: if isOwner(userId) 
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['statusMessage', 'updatedAt']);

      // Private security document storing recovery hash & salt
      match /security/recovery {
        allow read: if isOwner(userId);
        allow create, update: if isOwner(userId) 
          && request.resource.data.keys().hasAll(['recoveryPhraseHash', 'salt', 'updatedAt']);
      }

      // Friends subcollection
      match /friends/{friendId} {
        allow read, write: if isOwner(userId);
      }
    }

    // Friend requests
    match /friend_requests/{requestId} {
      allow read: if isAuthenticated() && (
        resource.data.senderId == request.auth.uid || 
        resource.data.receiverId == request.auth.uid
      );
      
      allow create: if isAuthenticated()
        && request.resource.data.senderId == request.auth.uid
        && request.resource.data.senderId != request.resource.data.receiverId
        && request.resource.data.status == 'pending'
        && request.resource.data.keys().hasAll(['senderId', 'senderUsername', 'receiverId', 'receiverUsername', 'status', 'createdAt']);

      allow update: if isAuthenticated() 
        && resource.data.receiverId == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'respondedAt'])
        && request.resource.data.status in ['accepted', 'declined'];

      allow delete: if isAuthenticated() && (
        resource.data.senderId == request.auth.uid || 
        resource.data.receiverId == request.auth.uid
      );
    }

    // Chats and text-only messages
    match /chats/{chatId} {
      allow read: if isAuthenticated() && request.auth.uid in resource.data.participants;
      allow create: if isAuthenticated() && request.auth.uid in request.resource.data.participants;
      allow update: if isAuthenticated() && request.auth.uid in resource.data.participants;

      match /messages/{messageId} {
        allow read: if isAuthenticated() && 
          request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants;
        
        // Strict text-only constraint: max 2000 chars, no file attachments
        allow create: if isAuthenticated() 
          && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants
          && request.resource.data.senderId == request.auth.uid
          && request.resource.data.text is string
          && request.resource.data.text.size() > 0
          && request.resource.data.text.size() <= 2000
          && !('attachments' in request.resource.data)
          && !('mediaUrl' in request.resource.data);

        allow update: if isAuthenticated() 
          && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['readAt', 'deliveryStatus']);

        allow delete: if false; // Messages are immutable
      }
    }
  }
}
`
  },
  {
    path: 'lib/main.dart',
    name: 'main.dart',
    language: 'dart',
    category: 'core',
    description: 'Application entry point initializing Firebase, setting up top-level FCM background handler, configuring RTDB presence, and launching ProviderScope.',
    code: `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:whisper_text/core/theme/app_theme.dart';
import 'package:whisper_text/core/notifications/push_notification_service.dart';
import 'package:whisper_text/core/presence/presence_service.dart';
import 'package:whisper_text/features/auth/providers/auth_provider.dart';
import 'package:whisper_text/features/auth/presentation/login_screen.dart';
import 'package:whisper_text/features/chat/presentation/chat_list_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  // Register top-level background FCM notification handler
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  runApp(
    const ProviderScope(
      child: WhisperTextApp(),
    ),
  );
}

class WhisperTextApp extends ConsumerStatefulWidget {
  const WhisperTextApp({super.key});

  @override
  ConsumerState<WhisperTextApp> createState() => _WhisperTextAppState();
}

class _WhisperTextAppState extends ConsumerState<WhisperTextApp> {
  final _pushNotificationService = PushNotificationService();
  final _presenceService = PresenceService();

  @override
  void initState() {
    super.initState();
    _setupNotifications();
  }

  Future<void> _setupNotifications() async {
    await _pushNotificationService.requestPermissions();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authNotifierProvider);

    // Initialize foreground notifications once context is available
    _pushNotificationService.initializeForegroundListeners(context);

    // When authenticated user changes, sync FCM token & configure RTDB presence
    ref.listen<AsyncValue<dynamic>>(authNotifierProvider, (previous, next) {
      final user = next.valueOrNull;
      if (user != null) {
        _pushNotificationService.syncFCMTokenToFirestore(user.uid);
        _presenceService.configureUserPresence(user.uid);
      }
    });

    return MaterialApp(
      title: 'WhisperText',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: authState.when(
        data: (user) => user == null ? const LoginScreen() : const ChatListScreen(),
        loading: () => const Scaffold(
          body: Center(
            child: CircularProgressIndicator(color: AppTheme.accentGreen),
          ),
        ),
        error: (error, _) => const LoginScreen(),
      ),
    );
  }
}
`
  },
  {
    path: 'lib/core/theme/app_theme.dart',
    name: 'app_theme.dart',
    language: 'dart',
    category: 'core',
    description: 'Minimalist high-contrast dark theme optimized for distraction-free text-only communication.',
    code: `import 'package:flutter/material.dart';

class AppTheme {
  static const Color background = Color(0xFF0F1115);
  static const Color surface = Color(0xFF181B22);
  static const Color surfaceBorder = Color(0xFF262C38);
  static const Color accentGreen = Color(0xFF10B981);
  static const Color accentGreenDim = Color(0xFF065F46);
  static const Color textPrimary = Color(0xFFF3F4F6);
  static const Color textSecondary = Color(0xFF9CA3AF);
  static const Color textMuted = Color(0xFF6B7280);
  static const Color errorRed = Color(0xFFEF4444);

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: background,
      colorScheme: const ColorScheme.dark(
        primary: accentGreen,
        surface: surface,
        error: errorRed,
      ),
      fontFamily: 'monospace',
      appBarTheme: const AppBarTheme(
        backgroundColor: background,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 18,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
        iconTheme: IconThemeData(color: textPrimary),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: const TextStyle(color: textMuted, fontSize: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: surfaceBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: surfaceBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: accentGreen, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: errorRed),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accentGreen,
          foregroundColor: Colors.black,
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }
}
`
  },
  {
    path: 'lib/core/utils/mnemonic_helper.dart',
    name: 'mnemonic_helper.dart',
    language: 'dart',
    category: 'core',
    description: 'Cryptographic engine for BIP-39 12-word mnemonic phrase generation, validation, normalization, and salted SHA-256 hashing.',
    code: `import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:bip39/bip39.dart' as bip39;

class MnemonicHelper {
  static String generate12WordPhrase() {
    return bip39.generateMnemonic(strength: 128);
  }

  static bool validateMnemonic(String phrase) {
    final clean = phrase.trim().replaceAll(RegExp(r'\\s+'), ' ');
    final words = clean.split(' ');
    if (words.length != 12) return false;
    return bip39.validateMnemonic(clean);
  }

  static String generateRandomSalt([int length = 32]) {
    final rand = Random.secure();
    final values = List<int>.generate(length, (i) => rand.nextInt(256));
    return base64Url.encode(values);
  }

  static String hashMnemonic(String mnemonicPhrase, String salt) {
    final normalized = mnemonicPhrase.trim().toLowerCase().replaceAll(RegExp(r'\\s+'), ' ');
    final bytes = utf8.encode('\$normalized:\$salt');
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  static String normalizeUsername(String username) {
    return username.trim().toLowerCase();
  }

  static bool isValidUsername(String username) {
    final regExp = RegExp(r'^[a-zA-Z0-9_]{3,20}\$');
    return regExp.hasMatch(username.trim());
  }
}
`
  },
  {
    path: 'lib/features/auth/models/user_model.dart',
    name: 'user_model.dart',
    language: 'dart',
    category: 'auth',
    description: 'Data model representing an authenticated user profile with username, UID, and creation timestamp.',
    code: `import 'package:cloud_firestore/cloud_firestore.dart';

class UserModel {
  final String uid;
  final String username;
  final DateTime createdAt;
  final String? statusMessage;

  const UserModel({
    required this.uid,
    required this.username,
    required this.createdAt,
    this.statusMessage,
  });

  Map<String, dynamic> toMap() {
    return {
      'uid': uid,
      'username': username,
      'createdAt': Timestamp.fromDate(createdAt),
      'statusMessage': statusMessage ?? '',
    };
  }

  factory UserModel.fromMap(Map<String, dynamic> map, String id) {
    return UserModel(
      uid: id,
      username: map['username'] as String? ?? '',
      createdAt: (map['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      statusMessage: map['statusMessage'] as String?,
    );
  }

  factory UserModel.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return UserModel.fromMap(data, doc.id);
  }
}
`
  },
  {
    path: 'lib/features/auth/providers/auth_provider.dart',
    name: 'auth_provider.dart',
    language: 'dart',
    category: 'auth',
    description: 'Riverpod 2.x AsyncNotifier for authentication state, managing session lifecycle and user credentials.',
    code: `import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:whisper_text/features/auth/models/user_model.dart';
import 'package:whisper_text/core/services/auth_service.dart';

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService();
});

class AuthNotifier extends AsyncNotifier<UserModel?> {
  late final AuthService _service;
  StreamSubscription? _sub;

  @override
  Future<UserModel?> build() async {
    _service = ref.watch(authServiceProvider);

    _sub?.cancel();
    _sub = _service.authStateChanges.listen((user) async {
      if (user == null) {
        state = const AsyncValue.data(null);
      } else {
        final profile = await _service.getCurrentUserProfile();
        state = AsyncValue.data(profile);
      }
    });

    ref.onDispose(() {
      _sub?.cancel();
    });

    return _service.getCurrentUserProfile();
  }

  Future<String> register({
    required String username,
    required String password,
  }) async {
    state = const AsyncValue.loading();
    try {
      final result = await _service.register(
        rawUsername: username,
        password: password,
      );
      state = AsyncValue.data(result.user);
      return result.recoveryPhrase;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> signIn({
    required String username,
    required String password,
  }) async {
    state = const AsyncValue.loading();
    try {
      final user = await _service.login(
        rawUsername: username,
        password: password,
      );
      state = AsyncValue.data(user);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> recoverPassword({
    required String username,
    required String mnemonicPhrase,
    required String newPassword,
  }) async {
    await _service.restoreAccountWithPhrase(
      rawUsername: username,
      recoveryPhrase: mnemonicPhrase,
      newPassword: newPassword,
    );
  }

  Future<void> signOut() async {
    await _service.signOut();
    state = const AsyncValue.data(null);
  }
}

final authNotifierProvider = AsyncNotifierProvider<AuthNotifier, UserModel?>(() {
  return AuthNotifier();
});
`
  },
  {
    path: 'lib/features/friends/models/friend_model.dart',
    name: 'friend_model.dart',
    language: 'dart',
    category: 'friends',
    description: 'Data model for an established friend relationship.',
    code: `import 'package:cloud_firestore/cloud_firestore.dart';

class Friend {
  final String uid;
  final String username;
  final DateTime addedAt;

  const Friend({
    required this.uid,
    required this.username,
    required this.addedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'uid': uid,
      'username': username,
      'addedAt': Timestamp.fromDate(addedAt),
    };
  }

  factory Friend.fromMap(Map<String, dynamic> map, String id) {
    return Friend(
      uid: id,
      username: map['username'] as String? ?? '',
      addedAt: (map['addedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    );
  }
}
`
  },
  {
    path: 'lib/features/chat/presentation/chat_list_screen.dart',
    name: 'chat_list_screen.dart',
    language: 'dart',
    category: 'chat',
    description: 'Main chat list screen displaying active conversations, friend discovery button, and navigation to chat rooms.',
    code: `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:whisper_text/core/theme/app_theme.dart';
import 'package:whisper_text/features/auth/providers/auth_provider.dart';
import 'package:whisper_text/features/friends/presentation/search_user_screen.dart';
import 'package:whisper_text/features/friends/presentation/friend_requests_screen.dart';
import 'package:whisper_text/features/chat/presentation/chat_screen.dart';
import 'package:whisper_text/features/friends/services/friend_service.dart';

class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentUser = ref.watch(authNotifierProvider).valueOrNull;

    if (currentUser == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppTheme.accentGreen)),
      );
    }

    final friendService = FriendService();

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('WHISPER_TEXT', style: TextStyle(letterSpacing: 1.5, fontSize: 16)),
            Text(
              '@\${currentUser.username}',
              style: const TextStyle(color: AppTheme.accentGreen, fontSize: 11),
            ),
          ],
        ),
        actions: [
          // Stream badge for inbound friend requests
          StreamBuilder(
            stream: friendService.streamPendingInboundRequests(currentUser.uid),
            builder: (context, snapshot) {
              final count = snapshot.data?.length ?? 0;
              return Stack(
                alignment: Alignment.center,
                children: [
                  IconButton(
                    icon: const Icon(Icons.person_add_alt_1_outlined),
                    tooltip: 'Friend Requests',
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const FriendRequestsScreen()),
                      );
                    },
                  ),
                  if (count > 0)
                    Positioned(
                      right: 8,
                      top: 8,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(
                          color: AppTheme.accentGreen,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          '\$count',
                          style: const TextStyle(
                            color: Colors.black,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.search),
            tooltip: 'Discover User',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SearchUserScreen()),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign Out',
            onPressed: () => ref.read(authNotifierProvider.notifier).signOut(),
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('users')
            .doc(currentUser.uid)
            .collection('friends')
            .orderBy('addedAt', descending: true)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(color: AppTheme.accentGreen));
          }

          final friends = snapshot.data?.docs ?? [];

          if (friends.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.speaker_notes_off_outlined, size: 54, color: AppTheme.textMuted),
                  const SizedBox(height: 14),
                  const Text(
                    'No active chats',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Find a friend by exact username to connect.',
                    style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(minimumSize: const Size(200, 44)),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const SearchUserScreen()),
                      );
                    },
                    icon: const Icon(Icons.person_search, size: 18),
                    label: const Text('SEARCH USERNAME'),
                  ),
                ],
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            itemCount: friends.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final friendData = friends[index].data() as Map<String, dynamic>;
              final friendUid = friends[index].id;
              final friendUsername = friendData['username'] as String? ?? 'user';

              return Container(
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.surfaceBorder),
                ),
                child: ListTile(
                  leading: Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: AppTheme.background,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppTheme.accentGreen.withOpacity(0.4)),
                    ),
                    child: Center(
                      child: Text(
                        friendUsername.isNotEmpty ? friendUsername[0].toUpperCase() : '?',
                        style: const TextStyle(
                          color: AppTheme.accentGreen,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ),
                  ),
                  title: Text(
                    '@\$friendUsername',
                    style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                  ),
                  subtitle: const Text(
                    'Tap to open encrypted text chat',
                    style: TextStyle(color: AppTheme.textMuted, fontSize: 11),
                  ),
                  trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ChatScreen(
                          friendId: friendUid,
                          friendUsername: friendUsername,
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
`
  }
];

// Combine unique files by their distinct file path
function deduplicateFiles(files: CodeFile[]): CodeFile[] {
  const map = new Map<string, CodeFile>();
  for (const f of files) {
    map.set(f.path, f);
  }
  return Array.from(map.values());
}

export const FLUTTER_CODEBASE: CodeFile[] = deduplicateFiles([
  ...ADVANCED_SYSTEM_FILES,
  ...CHAT_ENGINE_FILES,
  ...USER_DISCOVERY_FILES,
  ...AUTH_FLOW_FILES,
  ...BASE_PROJECT_FILES,
]);
