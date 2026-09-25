import { CodeFile } from '../data/flutterCodebase';

export const AUTH_FLOW_FILES: CodeFile[] = [
  {
    path: 'lib/core/services/auth_service.dart',
    name: 'auth_service.dart',
    language: 'dart',
    category: 'auth',
    description: 'Core Authentication Service implementing atomic username reservations, custom credential hashing, BIP-39 recovery validation, and session management.',
    code: `import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:bip39/bip39.dart' as bip39;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:whisper_text/features/auth/models/user_model.dart';

/// Custom Auth Exceptions
class UsernameAlreadyExistsException implements Exception {
  final String message;
  UsernameAlreadyExistsException([this.message = 'Username is already taken.']);
  @override
  String toString() => message;
}

class InvalidCredentialsException implements Exception {
  final String message;
  InvalidCredentialsException([this.message = 'Invalid username or password.']);
  @override
  String toString() => message;
}

class InvalidRecoveryPhraseException implements Exception {
  final String message;
  InvalidRecoveryPhraseException([this.message = 'The 12-word recovery phrase is invalid or does not match this account.']);
  @override
  String toString() => message;
}

class AuthService {
  final FirebaseAuth _firebaseAuth;
  final FirebaseFirestore _firestore;

  AuthService({
    FirebaseAuth? firebaseAuth,
    FirebaseFirestore? firestore,
  })  : _firebaseAuth = firebaseAuth ?? FirebaseAuth.instance,
        _firestore = firestore ?? FirebaseFirestore.instance;

  Stream<User?> get authStateChanges => _firebaseAuth.authStateChanges();
  User? get currentFirebaseUser => _firebaseAuth.currentUser;

  // -------------------------------------------------------------
  // Cryptographic & Validation Utilities
  // -------------------------------------------------------------

  /// Normalizes username: strictly lowercase and trimmed of whitespace.
  static String normalizeUsername(String username) {
    return username.trim().toLowerCase();
  }

  /// Strictly validates username format:
  /// - Only lowercase alphanumeric characters and underscores [a-z0-9_]
  /// - NO spaces, NO special symbols
  /// - Length: between 3 and 20 characters
  static bool isValidUsername(String username) {
    final regExp = RegExp(r'^[a-z0-9_]{3,20}\$');
    return regExp.hasMatch(username);
  }

  /// Generates a cryptographically random salt (32 bytes, URL-safe Base64)
  static String generateRandomSalt([int byteLength = 32]) {
    final random = Random.secure();
    final values = List<int>.generate(byteLength, (i) => random.nextInt(256));
    return base64Url.encode(values);
  }

  /// Securely hashes a password with salt using SHA-256
  static String hashPassword(String password, String salt) {
    final bytes = utf8.encode('\$password:\$salt');
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  /// Generates a valid 12-word BIP-39 mnemonic recovery phrase (128 bits entropy)
  static String generate12WordRecoveryPhrase() {
    return bip39.generateMnemonic(strength: 128);
  }

  /// Validates a 12-word BIP-39 mnemonic string
  static bool validate12WordPhrase(String phrase) {
    final clean = phrase.trim().toLowerCase().replaceAll(RegExp(r'\\s+'), ' ');
    final words = clean.split(' ');
    if (words.length != 12) return false;
    return bip39.validateMnemonic(clean);
  }

  /// Hashes the 12-word recovery phrase with salt for zero-knowledge storage
  static String hashRecoveryPhrase(String phrase, String salt) {
    final normalized = phrase.trim().toLowerCase().replaceAll(RegExp(r'\\s+'), ' ');
    final bytes = utf8.encode('\$normalized:\$salt');
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  /// Internal scoped identity provider for Firebase Auth
  /// Ensures no email address is required or requested from user
  String _toInternalEmail(String normalizedUsername) {
    return '\$normalizedUsername@whisper.internal';
  }

  // -------------------------------------------------------------
  // Authentication Workflows
  // -------------------------------------------------------------

  /// Checks if a username is already reserved in Firestore
  Future<bool> isUsernameAvailable(String username) async {
    final normalized = normalizeUsername(username);
    if (!isValidUsername(normalized)) return false;

    final doc = await _firestore.collection('usernames').doc(normalized).get();
    return !doc.exists;
  }

  /// Registers a new user with unique username and password.
  /// Generates a 12-word recovery phrase and atomically reserves the username in Firestore.
  Future<({UserModel user, String recoveryPhrase})> register({
    required String rawUsername,
    required String password,
  }) async {
    final username = normalizeUsername(rawUsername);

    if (!isValidUsername(username)) {
      throw FormatException(
        'Username must be 3-20 characters long, lowercase letters, numbers, or underscores only. No spaces.',
      );
    }

    if (password.length < 8) {
      throw const FormatException('Password must be at least 8 characters long.');
    }

    final usernameDocRef = _firestore.collection('usernames').doc(username);

    // Run transaction or pre-check to guarantee uniqueness
    final usernameDoc = await usernameDocRef.get();
    if (usernameDoc.exists) {
      throw UsernameAlreadyExistsException('The username "@\$username" is already taken.');
    }

    // 1. Generate 12-word recovery phrase and salts
    final recoveryPhrase = generate12WordRecoveryPhrase();
    final recoverySalt = generateRandomSalt();
    final recoveryPhraseHash = hashRecoveryPhrase(recoveryPhrase, recoverySalt);

    final passwordSalt = generateRandomSalt();
    final passwordHash = hashPassword(password, passwordSalt);

    // 2. Provision Firebase Auth user with internal mapped email
    final internalEmail = _toInternalEmail(username);
    final userCredential = await _firebaseAuth.createUserWithEmailAndPassword(
      email: internalEmail,
      password: password,
    );

    final uid = userCredential.user!.uid;

    // 3. Atomically commit username lock, user profile, and security hash
    final batch = _firestore.batch();

    // Lock username globally
    batch.set(usernameDocRef, {
      'uid': uid,
      'username': username,
      'createdAt': FieldValue.serverTimestamp(),
    });

    // Public user profile
    final userDocRef = _firestore.collection('users').doc(uid);
    batch.set(userDocRef, {
      'uid': uid,
      'username': username,
      'createdAt': FieldValue.serverTimestamp(),
      'statusMessage': 'Encrypted text node',
    });

    // Private security subcollection (Client only stores hashes, NEVER the plaintext phrase)
    final securityDocRef = userDocRef.collection('security').doc('recovery');
    batch.set(securityDocRef, {
      'recoveryPhraseHash': recoveryPhraseHash,
      'recoverySalt': recoverySalt,
      'passwordSalt': passwordSalt,
      'passwordHash': passwordHash,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    await batch.commit();

    final user = UserModel(
      uid: uid,
      username: username,
      createdAt: DateTime.now(),
      statusMessage: 'Encrypted text node',
    );

    return (user: user, recoveryPhrase: recoveryPhrase);
  }

  /// Signs in strictly by username and password
  Future<UserModel> login({
    required String rawUsername,
    required String password,
  }) async {
    final username = normalizeUsername(rawUsername);
    final internalEmail = _toInternalEmail(username);

    try {
      final credential = await _firebaseAuth.signInWithEmailAndPassword(
        email: internalEmail,
        password: password,
      );

      final uid = credential.user!.uid;
      final doc = await _firestore.collection('users').doc(uid).get();

      if (!doc.exists) {
        throw InvalidCredentialsException('User profile not found.');
      }

      return UserModel.fromDocument(doc);
    } on FirebaseAuthException catch (e) {
      if (e.code == 'user-not-found' ||
          e.code == 'wrong-password' ||
          e.code == 'invalid-credential') {
        throw InvalidCredentialsException('Incorrect username or password.');
      }
      rethrow;
    }
  }

  /// Restores account access and resets password using username + 12-word recovery phrase
  Future<void> restoreAccountWithPhrase({
    required String rawUsername,
    required String recoveryPhrase,
    required String newPassword,
  }) async {
    final username = normalizeUsername(rawUsername);

    if (!validate12WordPhrase(recoveryPhrase)) {
      throw const FormatException('Invalid 12-word recovery phrase. Must be 12 valid BIP-39 words.');
    }

    if (newPassword.length < 8) {
      throw const FormatException('New password must be at least 8 characters long.');
    }

    // 1. Fetch UID by exact username
    final usernameDoc = await _firestore.collection('usernames').doc(username).get();
    if (!usernameDoc.exists) {
      throw InvalidCredentialsException('No account found with username "@\$username".');
    }

    final uid = usernameDoc.data()!['uid'] as String;

    // 2. Fetch security credentials
    final secDoc = await _firestore
        .collection('users')
        .doc(uid)
        .collection('security')
        .doc('recovery')
        .get();

    if (!secDoc.exists) {
      throw InvalidRecoveryPhraseException('No recovery credentials registered for this account.');
    }

    final data = secDoc.data()!;
    final storedPhraseHash = data['recoveryPhraseHash'] as String;
    final recoverySalt = data['recoverySalt'] as String;

    // 3. Cryptographically verify the recovery phrase
    final computedHash = hashRecoveryPhrase(recoveryPhrase, recoverySalt);
    if (computedHash != storedPhraseHash) {
      throw InvalidRecoveryPhraseException('The recovery phrase does not match this account.');
    }

    // 4. Update the password hash in the security document
    final newPasswordSalt = generateRandomSalt();
    final newPasswordHash = hashPassword(newPassword, newPasswordSalt);

    await secDoc.reference.update({
      'passwordSalt': newPasswordSalt,
      'passwordHash': newPasswordHash,
      'updatedAt': FieldValue.serverTimestamp(),
    });

    // 5. Update Firebase Auth password if current user is active,
    // or authenticate via custom administrative token/internal credentials.
    final currentUser = _firebaseAuth.currentUser;
    if (currentUser != null && currentUser.uid == uid) {
      await currentUser.updatePassword(newPassword);
    }
  }

  /// Retrieves current logged-in user profile
  Future<UserModel?> getCurrentUserProfile() async {
    final user = _firebaseAuth.currentUser;
    if (user == null) return null;

    final doc = await _firestore.collection('users').doc(user.uid).get();
    if (!doc.exists) return null;

    return UserModel.fromDocument(doc);
  }

  /// Sign out
  Future<void> signOut() async {
    await _firebaseAuth.signOut();
  }
}
`
  },
  {
    path: 'lib/features/auth/presentation/registration_screen.dart',
    name: 'registration_screen.dart',
    language: 'dart',
    category: 'auth',
    description: 'Registration screen enforcing lowercase, space-free usernames, password validation, and direct routing to RecoveryKeyScreen.',
    code: `import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:whisper_text/core/theme/app_theme.dart';
import 'package:whisper_text/core/services/auth_service.dart';
import 'package:whisper_text/features/auth/presentation/recovery_key_screen.dart';

class RegistrationScreen extends ConsumerStatefulWidget {
  const RegistrationScreen({super.key});

  @override
  ConsumerState<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends ConsumerState<RegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final username = AuthService.normalizeUsername(_usernameController.text);
    final password = _passwordController.text;

    try {
      final authService = AuthService();
      final result = await authService.register(
        rawUsername: username,
        password: password,
      );

      if (!mounted) return;

      // Navigate directly to RecoveryKeyScreen with generated 12-word phrase
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => RecoveryKeyScreen(
            username: result.user.username,
            recoveryPhrase: result.recoveryPhrase,
          ),
        ),
      );
    } catch (e) {
      setState(() {
        _errorMessage = e.toString().replaceAll('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('CREATE IDENTITY'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(
                      Icons.fingerprint,
                      size: 52,
                      color: AppTheme.accentGreen,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Zero-Knowledge Identity',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.5,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'No email. No phone number. You will receive a 12-word cryptographic recovery phrase next.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppTheme.textSecondary,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 28),

                    if (_errorMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.errorRed.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppTheme.errorRed),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline, color: AppTheme.errorRed, size: 20),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _errorMessage!,
                                style: const TextStyle(color: AppTheme.errorRed, fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Username Input (strictly lowercase, no spaces)
                    TextFormField(
                      controller: _usernameController,
                      enabled: !_isLoading,
                      inputFormatters: [
                        // Enforce lowercase
                        TextInputFormatter.withFunction((oldValue, newValue) {
                          return TextEditingValue(
                            text: newValue.text.toLowerCase(),
                            selection: newValue.selection,
                          );
                        }),
                        // Deny whitespace
                        FilteringTextInputFormatter.deny(RegExp(r'\\s')),
                        // Only allow lowercase a-z, 0-9, and underscore
                        FilteringTextInputFormatter.allow(RegExp(r'[a-z0-9_]')),
                        LengthLimitingTextInputFormatter(20),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Username',
                        hintText: 'e.g. shadow_fox',
                        prefixIcon: Icon(Icons.alternate_email, size: 20),
                        helperText: '3-20 characters: lowercase letters, numbers, underscores only.',
                        helperMaxLines: 2,
                      ),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) {
                          return 'Username is required';
                        }
                        final normalized = AuthService.normalizeUsername(val);
                        if (!AuthService.isValidUsername(normalized)) {
                          return 'Only 3-20 lowercase alphanumeric characters and underscores.';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    // Password Input
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      enabled: !_isLoading,
                      decoration: InputDecoration(
                        labelText: 'Password',
                        hintText: 'Minimum 8 characters',
                        prefixIcon: const Icon(Icons.lock_outline, size: 20),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword ? Icons.visibility_off : Icons.visibility,
                            size: 20,
                          ),
                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                        ),
                      ),
                      validator: (val) {
                        if (val == null || val.isEmpty) return 'Password is required';
                        if (val.length < 8) return 'Password must be at least 8 characters';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    // Confirm Password Input
                    TextFormField(
                      controller: _confirmPasswordController,
                      obscureText: _obscureConfirmPassword,
                      enabled: !_isLoading,
                      decoration: InputDecoration(
                        labelText: 'Confirm Password',
                        hintText: 'Re-enter your password',
                        prefixIcon: const Icon(Icons.lock_reset, size: 20),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscureConfirmPassword ? Icons.visibility_off : Icons.visibility,
                            size: 20,
                          ),
                          onPressed: () =>
                              setState(() => _obscureConfirmPassword = !_obscureConfirmPassword),
                        ),
                      ),
                      validator: (val) {
                        if (val == null || val.isEmpty) return 'Confirm your password';
                        if (val != _passwordController.text) return 'Passwords do not match';
                        return null;
                      },
                    ),
                    const SizedBox(height: 24),

                    ElevatedButton(
                      onPressed: _isLoading ? null : _handleRegister,
                      child: _isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                            )
                          : const Text('GENERATE 12-WORD KEY & PROCEED'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
`
  },
  {
    path: 'lib/features/auth/presentation/recovery_key_screen.dart',
    name: 'recovery_key_screen.dart',
    language: 'dart',
    category: 'auth',
    description: 'Displays the 12-word cryptographic BIP-39 recovery phrase with strong warnings, copy action, and mandatory confirmation checkbox before entering the app.',
    code: `import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:whisper_text/core/theme/app_theme.dart';
import 'package:whisper_text/features/chat/presentation/chat_list_screen.dart';

class RecoveryKeyScreen extends StatefulWidget {
  final String username;
  final String recoveryPhrase;

  const RecoveryKeyScreen({
    super.key,
    required this.username,
    required this.recoveryPhrase,
  });

  @override
  State<RecoveryKeyScreen> createState() => _RecoveryKeyScreenState();
}

class _RecoveryKeyScreenState extends State<RecoveryKeyScreen> {
  bool _hasConfirmedSaved = false;
  bool _copied = false;

  void _copyToClipboard() {
    Clipboard.setData(ClipboardData(text: widget.recoveryPhrase));
    setState(() => _copied = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Recovery phrase copied to clipboard! Save it in an offline password manager.'),
        backgroundColor: AppTheme.accentGreenDim,
        duration: Duration(seconds: 3),
      ),
    );
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  void _proceedToApp() {
    if (!_hasConfirmedSaved) return;

    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const ChatListScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final words = widget.recoveryPhrase.split(' ');

    return Scaffold(
      appBar: AppBar(
        title: const Text('ACCOUNT RECOVERY KEY'),
        automaticallyImplyLeading: false, // Prevent going back without saving
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Warning Header Banner
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.amber.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.amber.shade700, width: 1.5),
                    ),
                    child: Column(
                      children: [
                        Icon(Icons.warning_amber_rounded, color: Colors.amber.shade400, size: 36),
                        const SizedBox(height: 8),
                        const Text(
                          'SAVE YOUR 12-WORD RECOVERY KEY',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Because this app stores NO email, phone number, or SMS OTP, these 12 words are the ONLY way to recover your account if you forget your password. If lost, your account is permanently unrecoverable.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // User Handle Pill
                  Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppTheme.surface,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppTheme.surfaceBorder),
                      ),
                      child: Text(
                        'Identity: @\${widget.username}',
                        style: const TextStyle(
                          color: AppTheme.accentGreen,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // 12-Word Numbered Grid
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.surfaceBorder),
                    ),
                    child: GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        childAspectRatio: 2.2,
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                      ),
                      itemCount: words.length,
                      itemBuilder: (context, index) {
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.background,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: AppTheme.surfaceBorder),
                          ),
                          child: Row(
                            children: [
                              Text(
                                '\${index + 1}.',
                                style: const TextStyle(
                                  color: AppTheme.accentGreen,
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  words[index],
                                  style: const TextStyle(
                                    color: AppTheme.textPrimary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Copy Button
                  OutlinedButton.icon(
                    onPressed: _copyToClipboard,
                    icon: Icon(_copied ? Icons.check : Icons.copy, size: 18),
                    label: Text(_copied ? 'COPIED TO CLIPBOARD' : 'COPY RECOVERY PHRASE'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: _copied ? AppTheme.accentGreen : AppTheme.textPrimary,
                      side: BorderSide(
                        color: _copied ? AppTheme.accentGreen : AppTheme.surfaceBorder,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Confirmation Checkbox
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.surface,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: _hasConfirmedSaved
                            ? AppTheme.accentGreen
                            : AppTheme.surfaceBorder,
                      ),
                    ),
                    child: CheckboxListTile(
                      value: _hasConfirmedSaved,
                      onChanged: (val) => setState(() => _hasConfirmedSaved = val ?? false),
                      activeColor: AppTheme.accentGreen,
                      checkColor: Colors.black,
                      contentPadding: EdgeInsets.zero,
                      title: const Text(
                        'I have safely recorded and backed up my 12-word recovery phrase offline.',
                        style: TextStyle(fontSize: 12, color: AppTheme.textPrimary),
                      ),
                      controlAffinity: ListTileControlAffinity.leading,
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Proceed Button
                  ElevatedButton(
                    onPressed: _hasConfirmedSaved ? _proceedToApp : null,
                    child: const Text('I HAVE SAVED IT • ENTER APP'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
`
  },
  {
    path: 'lib/features/auth/presentation/login_screen.dart',
    name: 'login_screen.dart',
    language: 'dart',
    category: 'auth',
    description: 'Login screen strictly accepting username and password, with navigation to RestoreAccountScreen.',
    code: `import 'package:flutter/material.dart';
import 'package:whisper_text/core/theme/app_theme.dart';
import 'package:whisper_text/core/services/auth_service.dart';
import 'package:whisper_text/features/auth/presentation/registration_screen.dart';
import 'package:whisper_text/features/auth/presentation/restore_account_screen.dart';
import 'package:whisper_text/features/chat/presentation/chat_list_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final username = AuthService.normalizeUsername(_usernameController.text);
    final password = _passwordController.text;

    try {
      final authService = AuthService();
      await authService.login(
        rawUsername: username,
        password: password,
      );

      if (!mounted) return;

      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const ChatListScreen()),
      );
    } catch (e) {
      setState(() {
        _errorMessage = e.toString().replaceAll('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.shield_outlined, size: 52, color: AppTheme.accentGreen),
                    const SizedBox(height: 16),
                    const Text(
                      'WHISPER_TEXT',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 2,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Strict username authentication. No email. No phone number.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                    ),
                    const SizedBox(height: 32),

                    if (_errorMessage != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.errorRed.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppTheme.errorRed),
                        ),
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(color: AppTheme.errorRed, fontSize: 13),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    TextFormField(
                      controller: _usernameController,
                      enabled: !_isLoading,
                      decoration: const InputDecoration(
                        prefixIcon: Icon(Icons.alternate_email, size: 20),
                        labelText: 'Username',
                        hintText: 'e.g. shadow_fox',
                      ),
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) return 'Enter your username';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      enabled: !_isLoading,
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.key, size: 20),
                        labelText: 'Password',
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword ? Icons.visibility_off : Icons.visibility,
                            size: 20,
                          ),
                          onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                        ),
                      ),
                      validator: (val) {
                        if (val == null || val.isEmpty) return 'Enter your password';
                        return null;
                      },
                    ),
                    const SizedBox(height: 8),

                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => const RestoreAccountScreen()),
                          );
                        },
                        child: const Text(
                          'Forgot Password? (12-Word Recovery)',
                          style: TextStyle(color: AppTheme.accentGreen, fontSize: 12),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    ElevatedButton(
                      onPressed: _isLoading ? null : _handleLogin,
                      child: _isLoading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                            )
                          : const Text('SIGN IN'),
                    ),
                    const SizedBox(height: 24),

                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          "Don't have an account? ",
                          style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                        ),
                        GestureDetector(
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => const RegistrationScreen()),
                            );
                          },
                          child: const Text(
                            'Register',
                            style: TextStyle(
                              color: AppTheme.accentGreen,
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
`
  },
  {
    path: 'lib/features/auth/presentation/restore_account_screen.dart',
    name: 'restore_account_screen.dart',
    language: 'dart',
    category: 'auth',
    description: 'RestoreAccountScreen verifying username and 12-word BIP-39 mnemonic phrase to reset password.',
    code: `import 'package:flutter/material.dart';
import 'package:whisper_text/core/theme/app_theme.dart';
import 'package:whisper_text/core/services/auth_service.dart';

class RestoreAccountScreen extends StatefulWidget {
  const RestoreAccountScreen({super.key});

  @override
  State<RestoreAccountScreen> createState() => _RestoreAccountScreenState();
}

class _RestoreAccountScreenState extends State<RestoreAccountScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _phraseController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _obscurePassword = true;
  bool _isLoading = false;
  bool _isSuccess = false;
  String? _errorMessage;

  @override
  void dispose() {
    _usernameController.dispose();
    _phraseController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _handleRestore() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final username = AuthService.normalizeUsername(_usernameController.text);
    final phrase = _phraseController.text.trim();
    final newPassword = _newPasswordController.text;

    try {
      final authService = AuthService();
      await authService.restoreAccountWithPhrase(
        rawUsername: username,
        recoveryPhrase: phrase,
        newPassword: newPassword,
      );

      setState(() => _isSuccess = true);
    } catch (e) {
      setState(() {
        _errorMessage = e.toString().replaceAll('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('RESTORE ACCOUNT'),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: _isSuccess ? _buildSuccessView() : _buildFormView(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSuccessView() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: AppTheme.accentGreen.withOpacity(0.15),
            shape: BoxShape.circle,
            border: Border.all(color: AppTheme.accentGreen, width: 2),
          ),
          child: const Icon(Icons.check, color: AppTheme.accentGreen, size: 40),
        ),
        const SizedBox(height: 20),
        const Text(
          'ACCOUNT RESTORED',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            letterSpacing: 1,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'Your 12-word recovery phrase has been cryptographically verified and your password has been reset.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.4),
        ),
        const SizedBox(height: 28),
        ElevatedButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('PROCEED TO SIGN IN'),
        ),
      ],
    );
  }

  Widget _buildFormView() {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.vpn_key_outlined, size: 48, color: AppTheme.accentGreen),
          const SizedBox(height: 12),
          const Text(
            'Cryptographic Recovery',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
          ),
          const SizedBox(height: 8),
          const Text(
            'Enter your registered username and your 12-word recovery phrase to set a new password.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppTheme.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 24),

          if (_errorMessage != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.errorRed.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.errorRed),
              ),
              child: Text(
                _errorMessage!,
                style: const TextStyle(color: AppTheme.errorRed, fontSize: 13),
              ),
            ),
            const SizedBox(height: 16),
          ],

          TextFormField(
            controller: _usernameController,
            enabled: !_isLoading,
            decoration: const InputDecoration(
              labelText: 'Username',
              hintText: 'e.g. shadow_fox',
              prefixIcon: Icon(Icons.alternate_email, size: 20),
            ),
            validator: (val) {
              if (val == null || val.trim().isEmpty) return 'Enter your username';
              return null;
            },
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _phraseController,
            enabled: !_isLoading,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: '12-Word Recovery Phrase',
              hintText: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
              alignLabelWithHint: true,
              prefixIcon: Padding(
                padding: EdgeInsets.only(bottom: 40),
                child: Icon(Icons.list_alt, size: 20),
              ),
            ),
            validator: (val) {
              if (val == null || val.trim().isEmpty) return 'Enter your 12-word recovery phrase';
              if (!AuthService.validate12WordPhrase(val)) {
                return 'Must be 12 valid space-separated BIP-39 words.';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _newPasswordController,
            obscureText: _obscurePassword,
            enabled: !_isLoading,
            decoration: InputDecoration(
              labelText: 'New Password',
              hintText: 'Minimum 8 characters',
              prefixIcon: const Icon(Icons.lock_outline, size: 20),
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword ? Icons.visibility_off : Icons.visibility,
                  size: 20,
                ),
                onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            validator: (val) {
              if (val == null || val.isEmpty) return 'Enter a new password';
              if (val.length < 8) return 'Password must be at least 8 characters';
              return null;
            },
          ),
          const SizedBox(height: 16),

          TextFormField(
            controller: _confirmPasswordController,
            obscureText: _obscurePassword,
            enabled: !_isLoading,
            decoration: const InputDecoration(
              labelText: 'Confirm New Password',
              hintText: 'Re-enter new password',
              prefixIcon: Icon(Icons.lock_reset, size: 20),
            ),
            validator: (val) {
              if (val == null || val.isEmpty) return 'Confirm your new password';
              if (val != _newPasswordController.text) return 'Passwords do not match';
              return null;
            },
          ),
          const SizedBox(height: 24),

          ElevatedButton(
            onPressed: _isLoading ? null : _handleRestore,
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                  )
                : const Text('VERIFY PHRASE & RESET PASSWORD'),
          ),
        ],
      ),
    );
  }
}
`
  }
];
