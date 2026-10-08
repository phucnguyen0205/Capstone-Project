import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers/auth_controller.dart';
import 'core/providers/core_providers.dart';
import 'core/routing/app_router.dart';
import 'core/services/api_service.dart';
import 'core/services/auth_service.dart';
import 'core/services/presence_service.dart';
import 'core/theme/app_theme.dart';
import 'features/calls/presentation/widgets/video_call_modal.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Pre-load persisted auth state so the global ApiService already has
  // the Bearer token by the first frame.
  final auth = AuthService();
  await auth.init();
  if (auth.token != null) {
    ApiService.sharedToken = auth.token;
  }
  runApp(const ProviderScope(child: DatingApp()));
}

class DatingApp extends ConsumerStatefulWidget {
  const DatingApp({super.key});

  @override
  ConsumerState<DatingApp> createState() => _DatingAppState();
}

class _DatingAppState extends ConsumerState<DatingApp> {
  late final PresenceService _presence = PresenceService();
  bool _bootDone = false;

  @override
  void initState() {
    super.initState();
    _presence.start();
    // Touch authControllerProvider so the controller wires up
    // `onAuthStateChanged` on the shared AuthService instance — this is
    // what makes GoRouter re-evaluate redirects after login.
    ref.read(authControllerProvider);
    _waitForBoot();
  }

  /// Wait for the persisted-auth future to settle exactly once. Subsequent
  /// invalidations (e.g. on logout) must NOT swap the router out, because
  /// tearing down MaterialApp.router mid-flight triggers the
  /// `_effectiveObservers.isEmpty` assertion in widgets/navigator.dart
  /// when the old Navigator is disposed while observers are still
  /// attached. The router's own redirect handles navigation in that case.
  Future<void> _waitForBoot() async {
    final authAsync = ref.read(authServiceProvider);
    if (!authAsync.isLoading) {
      setState(() => _bootDone = true);
      return;
    }
    try {
      await ref.read(authServiceProvider.future);
    } catch (_) {}
    if (mounted) setState(() => _bootDone = true);
  }

  @override
  void dispose() {
    _presence.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Only block the first frame while the persisted-auth future settles
    // so that the very first redirect has a real value to read. After
    // that, the app must NEVER unmount MaterialApp.router — invalidating
    // `authServiceProvider` (e.g. on logout) would otherwise dispose the
    // Navigator while observers are still attached and trigger the
    // `_effectiveObservers.isEmpty` assertion in
    // widgets/navigator.dart:4064.
    if (!_bootDone) {
      return const _AuthBootSplash();
    }
    final router = ref.watch(goRouterProvider);
    return MaterialApp.router(
      title: 'NameApp',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.backgroundDark,
        primaryColor: AppColors.primaryPink,
        colorScheme: const ColorScheme.dark(
          primary: AppColors.primaryPink,
          secondary: AppColors.secondaryCyan,
          surface: AppColors.backgroundCard,
        ),
        fontFamily: 'Inter',
        useMaterial3: true,
      ),
      routerConfig: router,
      builder: (context, child) =>
          _CallOverlayWrapper(child: child ?? const SizedBox.shrink()),
    );
  }
}

class _CallOverlayWrapper extends StatelessWidget {
  final Widget child;
  const _CallOverlayWrapper({required this.child});

  @override
  Widget build(BuildContext context) {
    return CallOverlay(child: child);
  }
}

class _AuthBootSplash extends StatelessWidget {
  const _AuthBootSplash();

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: AppColors.backgroundDark,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.primaryPink),
        ),
      ),
    );
  }
}
