import { CodeFile } from '../data/flutterCodebase';

export const USER_DISCOVERY_FILES: CodeFile[] = [
  {
    path: 'lib/features/friends/models/friend_request_model.dart',
    name: 'friend_request_model.dart',
    language: 'dart',
    category: 'friends',
    description: 'Strongly typed model representing pending, accepted, and declined friend requests.',
    code: `import 'package:cloud_firestore/cloud_firestore.dart';

enum FriendRequestStatus {
  pending,
  accepted,
  declined;

  static FriendRequestStatus fromString(String val) {
    switch (val) {
      case 'accepted':
        return FriendRequestStatus.accepted;
      case 'declined':
        return FriendRequestStatus.declined;
      case 'pending':
      default:
        return FriendRequestStatus.pending;
    }
  }
}

class FriendRequest {
  final String id;
  final String senderId;
  final String senderUsername;
  final String receiverId;
  final String receiverUsername;
  final FriendRequestStatus status;
  final DateTime createdAt;
  final DateTime? respondedAt;

  const FriendRequest({
    required this.id,
    required this.senderId,
    required this.senderUsername,
    required this.receiverId,
    required this.receiverUsername,
    required this.status,
    required this.createdAt,
    this.respondedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'senderId': senderId,
      'senderUsername': senderUsername,
      'receiverId': receiverId,
      'receiverUsername': receiverUsername,
      'status': status.name,
      'createdAt': Timestamp.fromDate(createdAt),
      if (respondedAt != null) 'respondedAt': Timestamp.fromDate(respondedAt!),
    };
  }

  factory FriendRequest.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return FriendRequest(
      id: doc.id,
      senderId: data['senderId'] as String? ?? '',
      senderUsername: data['senderUsername'] as String? ?? '',
      receiverId: data['receiverId'] as String? ?? '',
      receiverUsername: data['receiverUsername'] as String? ?? '',
      status: FriendRequestStatus.fromString(data['status'] as String? ?? 'pending'),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      respondedAt: (data['respondedAt'] as Timestamp?)?.toDate(),
    );
  }
}
`
  },
  {
    path: 'lib/features/friends/services/friend_service.dart',
    name: 'friend_service.dart',
    language: 'dart',
    category: 'friends',
    description: 'Exact discovery service implementing O(1) username lookups, mutual request handling, and atomic batch acceptance.',
    code: `import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:whisper_text/features/auth/models/user_model.dart';
import 'package:whisper_text/features/friends/models/friend_request_model.dart';

class FriendService {
  final FirebaseFirestore _firestore;

  FriendService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Exact Handle Lookup:
  /// Direct O(1) point query on /usernames/{username}.
  /// NEVER does substring or prefix queries, ensuring complete scraping protection.
  Future<UserModel?> findUserByExactUsername(String rawUsername) async {
    final clean = rawUsername.trim().toLowerCase();
    if (clean.isEmpty) return null;

    final doc = await _firestore.collection('usernames').doc(clean).get();
    if (!doc.exists) return null;

    final uid = doc.data()!['uid'] as String;
    final userDoc = await _firestore.collection('users').doc(uid).get();
    if (!userDoc.exists) return null;

    return UserModel.fromDocument(userDoc);
  }

  /// Sends a friend request to a target user
  Future<void> sendFriendRequest({
    required UserModel currentUser,
    required UserModel targetUser,
  }) async {
    if (currentUser.uid == targetUser.uid) {
      throw ArgumentError('You cannot send a friend request to yourself.');
    }

    // 1. Check if already friends
    final isAlreadyFriend = await _firestore
        .collection('users')
        .doc(currentUser.uid)
        .collection('friends')
        .doc(targetUser.uid)
        .get();

    if (isAlreadyFriend.exists) {
      throw StateError('You are already friends with @\${targetUser.username}.');
    }

    // 2. Check if outbound pending request already exists
    final existingOutbound = await _firestore
        .collection('friend_requests')
        .where('senderId', isEqualTo: currentUser.uid)
        .where('receiverId', isEqualTo: targetUser.uid)
        .where('status', isEqualTo: 'pending')
        .limit(1)
        .get();

    if (existingOutbound.docs.isNotEmpty) {
      throw StateError('A friend request is already pending for @\${targetUser.username}.');
    }

    // 3. Check if target user has ALREADY sent an inbound pending request
    final existingInbound = await _firestore
        .collection('friend_requests')
        .where('senderId', isEqualTo: targetUser.uid)
        .where('receiverId', isEqualTo: currentUser.uid)
        .where('status', isEqualTo: 'pending')
        .limit(1)
        .get();

    if (existingInbound.docs.isNotEmpty) {
      // Auto-accept mutual request
      final existingReq = FriendRequest.fromDocument(existingInbound.docs.first);
      await acceptFriendRequest(existingReq, currentUser);
      return;
    }

    // 4. Create new pending friend request
    final newDoc = _firestore.collection('friend_requests').doc();
    await newDoc.set({
      'senderId': currentUser.uid,
      'senderUsername': currentUser.username,
      'receiverId': targetUser.uid,
      'receiverUsername': targetUser.username,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  /// Real-time stream of inbound pending requests for the authenticated user
  Stream<List<FriendRequest>> streamPendingInboundRequests(String currentUserId) {
    return _firestore
        .collection('friend_requests')
        .where('receiverId', isEqualTo: currentUserId)
        .where('status', isEqualTo: 'pending')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map((doc) => FriendRequest.fromDocument(doc)).toList());
  }

  /// Accepts a friend request and atomically writes bidirectional friendship + chat room
  Future<void> acceptFriendRequest(
    FriendRequest request,
    UserModel currentUser,
  ) async {
    final batch = _firestore.batch();

    // 1. Update friend request status to accepted
    final reqRef = _firestore.collection('friend_requests').doc(request.id);
    batch.update(reqRef, {
      'status': 'accepted',
      'respondedAt': FieldValue.serverTimestamp(),
    });

    // 2. Add to current user's friends list
    final myFriendRef = _firestore
        .collection('users')
        .doc(currentUser.uid)
        .collection('friends')
        .doc(request.senderId);

    batch.set(myFriendRef, {
      'uid': request.senderId,
      'username': request.senderUsername,
      'addedAt': FieldValue.serverTimestamp(),
    });

    // 3. Add to sender's friends list
    final senderFriendRef = _firestore
        .collection('users')
        .doc(request.senderId)
        .collection('friends')
        .doc(currentUser.uid);

    batch.set(senderFriendRef, {
      'uid': currentUser.uid,
      'username': currentUser.username,
      'addedAt': FieldValue.serverTimestamp(),
    });

    // 4. Ensure deterministic 1-on-1 direct text chat room exists
    final participants = [currentUser.uid, request.senderId]..sort();
    final chatId = participants.join('_');
    final chatRef = _firestore.collection('chats').doc(chatId);

    batch.set(
      chatRef,
      {
        'chatId': chatId,
        'participants': participants,
        'participantUsernames': {
          currentUser.uid: currentUser.username,
          request.senderId: request.senderUsername,
        },
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );

    await batch.commit();
  }

  /// Declines an inbound friend request
  Future<void> declineFriendRequest(String requestId) async {
    await _firestore.collection('friend_requests').doc(requestId).update({
      'status': 'declined',
      'respondedAt': FieldValue.serverTimestamp(),
    });
  }
}
`
  },
  {
    path: 'lib/features/friends/presentation/search_user_screen.dart',
    name: 'search_user_screen.dart',
    language: 'dart',
    category: 'friends',
    description: 'Exact user search UI querying Firestore by exact lowercase username and displaying a Send Friend Request button.',
    code: `import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:whisper_text/core/theme/app_theme.dart';
import 'package:whisper_text/features/auth/models/user_model.dart';
import 'package:whisper_text/features/auth/providers/auth_provider.dart';
import 'package:whisper_text/features/friends/services/friend_service.dart';

class SearchUserScreen extends ConsumerStatefulWidget {
  const SearchUserScreen({super.key});

  @override
  ConsumerState<SearchUserScreen> createState() => _SearchUserScreenState();
}

class _SearchUserScreenState extends ConsumerState<SearchUserScreen> {
  final _searchController = TextEditingController();
  final _friendService = FriendService();

  bool _isSearching = false;
  bool _isSending = false;
  bool _hasSearched = false;
  UserModel? _foundUser;
  String? _statusMessage;
  bool _isSuccessMessage = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _handleSearch() async {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) return;

    FocusScope.of(context).unfocus();
    setState(() {
      _isSearching = true;
      _hasSearched = true;
      _statusMessage = null;
      _foundUser = null;
    });

    try {
      final user = await _friendService.findUserByExactUsername(query);
      setState(() {
        _foundUser = user;
      });
    } catch (e) {
      setState(() {
        _statusMessage = 'Search error: \${e.toString()}';
        _isSuccessMessage = false;
      });
    } finally {
      if (mounted) setState(() => _isSearching = false);
    }
  }

  Future<void> _handleSendRequest(UserModel targetUser) async {
    final currentUser = ref.read(authNotifierProvider).valueOrNull;
    if (currentUser == null) return;

    setState(() {
      _isSending = true;
      _statusMessage = null;
    });

    try {
      await _friendService.sendFriendRequest(
        currentUser: currentUser,
        targetUser: targetUser,
      );

      setState(() {
        _isSuccessMessage = true;
        _statusMessage = 'Friend request sent to @\${targetUser.username}!';
      });
    } catch (e) {
      setState(() {
        _isSuccessMessage = false;
        _statusMessage = e.toString().replaceAll('Exception: ', '').replaceAll('StateError: ', '');
      });
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = ref.watch(authNotifierProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('DISCOVER USER'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Privacy Info Callout
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.surfaceBorder),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.shield_outlined, color: AppTheme.accentGreen, size: 20),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Exact Matching Only: Enter the exact username. No public directories or contact scraping.',
                        style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.3),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Search Bar
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      inputFormatters: [
                        FilteringTextInputFormatter.deny(RegExp(r'\\s')),
                        FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9_]')),
                      ],
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _handleSearch(),
                      decoration: const InputDecoration(
                        labelText: 'Exact Username',
                        hintText: 'e.g. bob',
                        prefixIcon: Icon(Icons.alternate_email, size: 20),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  SizedBox(
                    height: 50,
                    width: 54,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        backgroundColor: AppTheme.accentGreen,
                        foregroundColor: Colors.black,
                      ),
                      onPressed: _isSearching ? null : _handleSearch,
                      child: _isSearching
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                            )
                          : const Icon(Icons.search, size: 22),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Status message (Success or Error)
              if (_statusMessage != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _isSuccessMessage
                        ? AppTheme.accentGreen.withOpacity(0.12)
                        : AppTheme.errorRed.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _isSuccessMessage ? AppTheme.accentGreen : AppTheme.errorRed,
                    ),
                  ),
                  child: Text(
                    _statusMessage!,
                    style: TextStyle(
                      color: _isSuccessMessage ? AppTheme.accentGreen : AppTheme.errorRed,
                      fontSize: 13,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Result View
              Expanded(
                child: Center(
                  child: _buildResultView(currentUser),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildResultView(UserModel? currentUser) {
    if (_isSearching) {
      return const CircularProgressIndicator(color: AppTheme.accentGreen);
    }

    if (!_hasSearched) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: const [
          Icon(Icons.person_search_outlined, size: 54, color: AppTheme.textMuted),
          SizedBox(height: 12),
          Text(
            'Search for an exact handle',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
          ),
        ],
      );
    }

    if (_foundUser == null) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.search_off, size: 48, color: AppTheme.textMuted),
          const SizedBox(height: 12),
          Text(
            'No user found with exact handle "@\${_searchController.text.trim().toLowerCase()}"',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
          ),
        ],
      );
    }

    final isMe = currentUser != null && currentUser.uid == _foundUser!.uid;

    return Container(
      constraints: const BoxConstraints(maxWidth: 380),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.surfaceBorder),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppTheme.accentGreen.withOpacity(0.15),
              shape: BoxShape.circle,
              border: Border.all(color: AppTheme.accentGreen, width: 1.5),
            ),
            child: Center(
              child: Text(
                _foundUser!.username.isNotEmpty
                    ? _foundUser!.username[0].toUpperCase()
                    : '?',
                style: const TextStyle(
                  color: AppTheme.accentGreen,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            '@\${_foundUser!.username}',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            _foundUser!.statusMessage ?? 'Available',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 20),

          if (isMe) ...[
            const Text(
              'This is your own handle',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 12, fontStyle: FontStyle.italic),
            ),
          ] else ...[
            ElevatedButton.icon(
              onPressed: _isSending ? null : () => _handleSendRequest(_foundUser!),
              icon: _isSending
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                    )
                  : const Icon(Icons.person_add, size: 18),
              label: Text(_isSending ? 'SENDING...' : 'SEND FRIEND REQUEST'),
            ),
          ],
        ],
      ),
    );
  }
}
`
  },
  {
    path: 'lib/features/friends/presentation/friend_requests_screen.dart',
    name: 'friend_requests_screen.dart',
    language: 'dart',
    category: 'friends',
    description: 'FriendRequestsScreen displaying pending inbound connection requests with real-time Firestore stream, Accept, and Decline actions.',
    code: `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:whisper_text/core/theme/app_theme.dart';
import 'package:whisper_text/features/auth/providers/auth_provider.dart';
import 'package:whisper_text/features/friends/models/friend_request_model.dart';
import 'package:whisper_text/features/friends/services/friend_service.dart';

class FriendRequestsScreen extends ConsumerStatefulWidget {
  const FriendRequestsScreen({super.key});

  @override
  ConsumerState<FriendRequestsScreen> createState() => _FriendRequestsScreenState();
}

class _FriendRequestsScreenState extends ConsumerState<FriendRequestsScreen> {
  final _friendService = FriendService();
  final Set<String> _processingIds = {};

  Future<void> _handleAccept(FriendRequest req) async {
    final currentUser = ref.read(authNotifierProvider).valueOrNull;
    if (currentUser == null) return;

    setState(() => _processingIds.add(req.id));
    try {
      await _friendService.acceptFriendRequest(req, currentUser);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Accepted @\${req.senderUsername}\\'s friend request!'),
            backgroundColor: AppTheme.accentGreenDim,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: \${e.toString()}'),
            backgroundColor: AppTheme.errorRed,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _processingIds.remove(req.id));
    }
  }

  Future<void> _handleDecline(FriendRequest req) async {
    setState(() => _processingIds.add(req.id));
    try {
      await _friendService.declineFriendRequest(req.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Declined @\${req.senderUsername}\\'s request.'),
            backgroundColor: AppTheme.surface,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: \${e.toString()}'),
            backgroundColor: AppTheme.errorRed,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _processingIds.remove(req.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = ref.watch(authNotifierProvider).valueOrNull;

    if (currentUser == null) {
      return const Scaffold(
        body: Center(child: Text('Please sign in to view friend requests.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('FRIEND REQUESTS'),
      ),
      body: StreamBuilder<List<FriendRequest>>(
        stream: _friendService.streamPendingInboundRequests(currentUser.uid),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(color: AppTheme.accentGreen),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Text(
                'Error loading requests: \${snapshot.error}',
                style: const TextStyle(color: AppTheme.errorRed),
              ),
            );
          }

          final requests = snapshot.data ?? [];

          if (requests.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: const [
                  Icon(Icons.mark_email_read_outlined, size: 52, color: AppTheme.textMuted),
                  SizedBox(height: 14),
                  Text(
                    'No pending friend requests',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'When someone adds your exact username, it will show up here.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                  ),
                ],
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            itemCount: requests.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final req = requests[index];
              final isBusy = _processingIds.contains(req.id);

              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.surfaceBorder),
                ),
                child: Row(
                  children: [
                    // Avatar Circle
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppTheme.background,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppTheme.accentGreen.withOpacity(0.5)),
                      ),
                      child: Center(
                        child: Text(
                          req.senderUsername.isNotEmpty
                              ? req.senderUsername[0].toUpperCase()
                              : '?',
                          style: const TextStyle(
                            color: AppTheme.accentGreen,
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),

                    // User Info
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '@\${req.senderUsername}',
                            style: const TextStyle(
                              color: AppTheme.textPrimary,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'Wants to connect',
                            style: TextStyle(color: AppTheme.textSecondary, fontSize: 11),
                          ),
                        ],
                      ),
                    ),

                    // Accept / Decline Actions
                    if (isBusy) ...[
                      const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.accentGreen),
                      ),
                    ] else ...[
                      // Decline Button
                      IconButton(
                        onPressed: () => _handleDecline(req),
                        tooltip: 'Decline',
                        icon: const Icon(Icons.close, color: AppTheme.errorRed, size: 20),
                        style: IconButton.styleFrom(
                          backgroundColor: AppTheme.errorRed.withOpacity(0.12),
                        ),
                      ),
                      const SizedBox(width: 8),

                      // Accept Button
                      IconButton(
                        onPressed: () => _handleAccept(req),
                        tooltip: 'Accept',
                        icon: const Icon(Icons.check, color: Colors.black, size: 20),
                        style: IconButton.styleFrom(
                          backgroundColor: AppTheme.accentGreen,
                        ),
                      ),
                    ],
                  ],
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
