import { CodeFile } from '../data/flutterCodebase';

export const CHAT_ENGINE_FILES: CodeFile[] = [
  {
    path: 'lib/features/chat/models/message_model.dart',
    name: 'message_model.dart',
    language: 'dart',
    category: 'chat',
    description: 'Data model for a pure text message with senderId, receiverId, text, timestamp, and deliveryStatus (sent, delivered, read).',
    code: `import 'package:cloud_firestore/cloud_firestore.dart';

enum DeliveryStatus {
  sent,
  delivered,
  read;

  static DeliveryStatus fromString(String? val) {
    switch (val) {
      case 'read':
        return DeliveryStatus.read;
      case 'delivered':
        return DeliveryStatus.delivered;
      case 'sent':
      default:
        return DeliveryStatus.sent;
    }
  }
}

class Message {
  final String id;
  final String senderId;
  final String receiverId;
  final String text;
  final DateTime timestamp;
  final DeliveryStatus deliveryStatus;

  const Message({
    required this.id,
    required this.senderId,
    required this.receiverId,
    required this.text,
    required this.timestamp,
    this.deliveryStatus = DeliveryStatus.sent,
  });

  Map<String, dynamic> toMap() {
    return {
      'senderId': senderId,
      'receiverId': receiverId,
      'text': text,
      'timestamp': Timestamp.fromDate(timestamp),
      'deliveryStatus': deliveryStatus.name,
    };
  }

  factory Message.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return Message(
      id: doc.id,
      senderId: data['senderId'] as String? ?? '',
      receiverId: data['receiverId'] as String? ?? '',
      text: data['text'] as String? ?? '',
      timestamp: (data['timestamp'] as Timestamp?)?.toDate() ?? DateTime.now(),
      deliveryStatus: DeliveryStatus.fromString(data['deliveryStatus'] as String?),
    );
  }
}
`
  },
  {
    path: 'lib/features/chat/services/chat_service.dart',
    name: 'chat_service.dart',
    language: 'dart',
    category: 'chat',
    description: 'ChatService managing Firestore real-time message streams, deterministic chat room keys, and automated deliveryStatus progression (sent -> delivered -> read).',
    code: `import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:whisper_text/features/chat/models/message_model.dart';

class ChatService {
  final FirebaseFirestore _firestore;

  ChatService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  /// Generates a deterministic chat ID by sorting participant UIDs alphabetically.
  static String getChatId(String uid1, String uid2) {
    final sorted = [uid1, uid2]..sort();
    return sorted.join('_');
  }

  /// Sends a pure text message to the target friend.
  /// Strictly verifies that the message has non-empty text, ≤ 2000 characters,
  /// and zero attachments or multimedia metadata.
  Future<void> sendTextMessage({
    required String senderId,
    required String receiverId,
    required String text,
  }) async {
    final cleanText = text.trim();
    if (cleanText.isEmpty) {
      throw ArgumentError('Cannot send an empty message.');
    }
    if (cleanText.length > 2000) {
      throw ArgumentError('Message exceeds maximum limit of 2000 characters.');
    }

    final chatId = getChatId(senderId, receiverId);
    final chatDocRef = _firestore.collection('chats').doc(chatId);
    final messageDocRef = chatDocRef.collection('messages').doc();

    final batch = _firestore.batch();

    // 1. Create message document with initial 'sent' status
    batch.set(messageDocRef, {
      'senderId': senderId,
      'receiverId': receiverId,
      'text': cleanText,
      'timestamp': FieldValue.serverTimestamp(),
      'deliveryStatus': DeliveryStatus.sent.name,
    });

    // 2. Update conversation summary metadata
    batch.set(
      chatDocRef,
      {
        'chatId': chatId,
        'participants': [senderId, receiverId]..sort(),
        'lastMessage': cleanText,
        'lastMessageTime': FieldValue.serverTimestamp(),
        'lastSenderId': senderId,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );

    await batch.commit();
  }

  /// Real-time stream of messages ordered by timestamp ascending for the ChatScreen.
  /// Automatically listens to Firestore collection snapshots.
  Stream<List<Message>> streamMessages(String currentUserId, String friendId) {
    final chatId = getChatId(currentUserId, friendId);

    return _firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', descending: false)
        .limitToLast(100)
        .snapshots()
        .map((snapshot) {
          final messages = snapshot.docs.map((doc) => Message.fromDocument(doc)).toList();

          // Trigger automatic delivery status progression on recipient side
          _markIncomingMessagesDeliveredOrRead(
            chatId: chatId,
            messages: messages,
            currentUserId: currentUserId,
          );

          return messages;
        });
  }

  /// Updates deliveryStatus from "sent" to "delivered" when recipient's client receives them,
  /// and marks them "read" if the recipient actively has the ChatScreen open.
  Future<void> _markIncomingMessagesDeliveredOrRead({
    required String chatId,
    required List<Message> messages,
    required String currentUserId,
  }) async {
    // Find unread/undelivered messages where current user is the recipient
    final undelivered = messages.where(
      (m) => m.receiverId == currentUserId && m.deliveryStatus != DeliveryStatus.read,
    ).toList();

    if (undelivered.isEmpty) return;

    final batch = _firestore.batch();
    for (final msg in undelivered) {
      final docRef = _firestore
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .doc(msg.id);

      // Once received inside the active ChatScreen, upgrade status to 'read' (or 'delivered')
      batch.update(docRef, {
        'deliveryStatus': DeliveryStatus.read.name,
        'readAt': FieldValue.serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (_) {
      // Ignore background race conditions
    }
  }

  /// Background delivery hook: Updates status from "sent" to "delivered" when app receives
  /// notification/background message before user opens chat screen.
  Future<void> markMessagesAsDelivered({
    required String currentUserId,
    required String senderId,
  }) async {
    final chatId = getChatId(currentUserId, senderId);

    final snapshot = await _firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .where('receiverId', isEqualTo: currentUserId)
        .where('deliveryStatus', isEqualTo: DeliveryStatus.sent.name)
        .get();

    if (snapshot.docs.isEmpty) return;

    final batch = _firestore.batch();
    for (final doc in snapshot.docs) {
      batch.update(doc.reference, {
        'deliveryStatus': DeliveryStatus.delivered.name,
        'deliveredAt': FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }
}
`
  },
  {
    path: 'lib/features/chat/presentation/chat_screen.dart',
    name: 'chat_screen.dart',
    language: 'dart',
    category: 'chat',
    description: 'Production ChatScreen UI featuring real-time chat bubbles, timestamp formatting, deliveryStatus checkmarks (sent, delivered, read), auto-scroll, and text-only composer.',
    code: `import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:whisper_text/core/theme/app_theme.dart';
import 'package:whisper_text/features/auth/providers/auth_provider.dart';
import 'package:whisper_text/features/chat/models/message_model.dart';
import 'package:whisper_text/features/chat/services/chat_service.dart';

class ChatScreen extends ConsumerStatefulWidget {
  final String friendId;
  final String friendUsername;

  const ChatScreen({
    super.key,
    required this.friendId,
    required this.friendUsername,
  });

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _chatService = ChatService();
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  bool _isComposing = false;

  @override
  void initState() {
    super.initState();
    _textController.addListener(() {
      final isComposing = _textController.text.trim().isNotEmpty;
      if (isComposing != _isComposing) {
        setState(() => _isComposing = isComposing);
      }
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _handleSendMessage() async {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    final currentUser = ref.read(authNotifierProvider).valueOrNull;
    if (currentUser == null) return;

    _textController.clear();
    setState(() => _isComposing = false);

    try {
      await _chatService.sendTextMessage(
        senderId: currentUser.uid,
        receiverId: widget.friendId,
        text: text,
      );
      // Ensure view stays scrolled to the newest message
      Future.delayed(const Duration(milliseconds: 100), _scrollToBottom);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to send: \${e.toString()}'),
            backgroundColor: AppTheme.errorRed,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = ref.watch(authNotifierProvider).valueOrNull;

    if (currentUser == null) {
      return const Scaffold(
        body: Center(child: Text('Session expired. Please sign in again.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppTheme.surface,
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.accentGreen.withOpacity(0.4)),
              ),
              child: Center(
                child: Text(
                  widget.friendUsername.isNotEmpty
                      ? widget.friendUsername[0].toUpperCase()
                      : '?',
                  style: const TextStyle(
                    color: AppTheme.accentGreen,
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '@\${widget.friendUsername}',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: const [
                      SizedBox(
                        width: 6,
                        height: 6,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: AppTheme.accentGreen,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                      SizedBox(width: 5),
                      Text(
                        'Direct Text Channel',
                        style: TextStyle(color: AppTheme.textSecondary, fontSize: 11),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Text-Only Privacy Banner
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
              color: AppTheme.surface,
              child: const Text(
                'TEXT ONLY • ZERO ATTACHMENTS • REAL-TIME FIRESTORE STREAM',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppTheme.textMuted,
                  fontSize: 10,
                  letterSpacing: 0.5,
                ),
              ),
            ),

            // Message Stream Area
            Expanded(
              child: StreamBuilder<List<Message>>(
                stream: _chatService.streamMessages(currentUser.uid, widget.friendId),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
                    return const Center(
                      child: CircularProgressIndicator(color: AppTheme.accentGreen),
                    );
                  }

                  if (snapshot.hasError) {
                    return Center(
                      child: Text(
                        'Error connecting to stream: \${snapshot.error}',
                        style: const TextStyle(color: AppTheme.errorRed),
                      ),
                    );
                  }

                  final messages = snapshot.data ?? [];

                  if (messages.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.chat_bubble_outline, size: 48, color: AppTheme.textMuted),
                          const SizedBox(height: 12),
                          Text(
                            'No messages with @\${widget.friendUsername} yet.',
                            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Send a text message below to start.',
                            style: TextStyle(color: AppTheme.textMuted, fontSize: 11),
                          ),
                        ],
                      ),
                    );
                  }

                  // Auto scroll when messages update
                  WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());

                  return ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    itemCount: messages.length,
                    itemBuilder: (context, index) {
                      final message = messages[index];
                      final isMe = message.senderId == currentUser.uid;
                      return _buildMessageBubble(message, isMe);
                    },
                  );
                },
              ),
            ),

            // Composer Text Input Bar
            _buildInputBar(),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageBubble(Message message, bool isMe) {
    final timeStr = DateFormat('h:mm a').format(message.timestamp);

    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isMe ? AppTheme.accentGreenDim : AppTheme.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(isMe ? 14 : 2),
            bottomRight: Radius.circular(isMe ? 2 : 14),
          ),
          border: Border.all(
            color: isMe ? AppTheme.accentGreen.withOpacity(0.3) : AppTheme.surfaceBorder,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            // Message Content
            Text(
              message.text,
              style: TextStyle(
                color: isMe ? Colors.white : AppTheme.textPrimary,
                fontSize: 14,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 4),

            // Timestamp and DeliveryStatus Indicator
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  timeStr,
                  style: TextStyle(
                    color: isMe ? Colors.white70 : AppTheme.textMuted,
                    fontSize: 10,
                  ),
                ),
                if (isMe) ...[
                  const SizedBox(width: 4),
                  _buildDeliveryStatusIcon(message.deliveryStatus),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeliveryStatusIcon(DeliveryStatus status) {
    switch (status) {
      case DeliveryStatus.sent:
        // Single checkmark: Message written to Firestore
        return const Icon(Icons.check, size: 13, color: Colors.white70);
      case DeliveryStatus.delivered:
        // Double checkmark: Recipient client received the message stream
        return const Icon(Icons.done_all, size: 14, color: Colors.white70);
      case DeliveryStatus.read:
        // Double green checkmark: Recipient opened and viewed the message
        return const Icon(Icons.done_all, size: 14, color: AppTheme.accentGreen);
    }
  }

  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: const BoxDecoration(
        color: AppTheme.surface,
        border: Border(top: BorderSide(color: AppTheme.surfaceBorder)),
      ),
      child: Row(
        children: [
          // Plain Text Input (Strictly text, no media attachments)
          Expanded(
            child: TextField(
              controller: _textController,
              maxLines: 4,
              minLines: 1,
              maxLength: 2000,
              buildCounter: (context, {required currentLength, required isFocused, maxLength}) => null,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'Type a message...',
                fillColor: AppTheme.background,
                filled: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppTheme.surfaceBorder),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppTheme.surfaceBorder),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppTheme.accentGreen, width: 1.5),
                ),
              ),
              onSubmitted: (_) => _handleSendMessage(),
            ),
          ),
          const SizedBox(width: 8),

          // Send Action Button
          Container(
            decoration: BoxDecoration(
              color: _isComposing ? AppTheme.accentGreen : AppTheme.surfaceBorder,
              shape: BoxShape.circle,
            ),
            child: IconButton(
              icon: const Icon(Icons.send_rounded, size: 18),
              color: _isComposing ? Colors.black : AppTheme.textMuted,
              onPressed: _isComposing ? _handleSendMessage : null,
            ),
          ),
        ],
      ),
    );
  }
}
`
  }
];
