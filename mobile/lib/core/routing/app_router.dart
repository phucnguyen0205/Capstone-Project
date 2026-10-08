import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/register_page.dart';
import '../../features/calls/presentation/pages/call_page.dart';
import '../../features/explore/presentation/pages/explore_page.dart';
import '../../features/groups/presentation/pages/diary_page.dart';
import '../../features/groups/presentation/pages/groups_page.dart';
import '../../features/groups/presentation/pages/quiz_page.dart';
import '../../features/groups/presentation/pages/radar_page.dart';
import '../../features/groups/presentation/pages/vault_page.dart'
    as groups_vault show VaultPage;
import '../../features/home/presentation/pages/home_page.dart';
import '../../features/messages/presentation/pages/chat_page.dart';
import '../../features/messages/presentation/pages/messages_page.dart';
import '../../features/moments/presentation/pages/moment_camera_page.dart';
import '../../features/moments/presentation/pages/moment_detail_page.dart';
import '../../features/notifications/presentation/pages/notifications_page.dart';
import '../../features/profile/presentation/pages/edit_profile_page.dart';
import '../../features/profile/presentation/pages/other_user_profile_page.dart';
import '../../features/profile/presentation/pages/profile_page.dart';
import '../../features/reels/presentation/pages/reels_explore_page.dart';
import '../../features/search/presentation/pages/search_page.dart';
import '../../features/shell/main_navigation_page.dart';
import '../../features/vault/presentation/pages/vault_page.dart';
import '../models/models.dart';
import '../providers/core_providers.dart';
import '../services/api_service.dart';

/// Centralised route names so we can refer to them by symbol instead
/// of magic strings.
class AppRoutes {
  static const login = 'login';
  static const register = 'register';
  static const home = 'home';
  static const explore = 'explore';
  static const messages = 'messages';
  static const groups = 'groups';
  static const profile = 'profile';
  static const editProfile = 'editProfile';
  static const search = 'search';
  static const notifications = 'notifications';
  static const vault = 'vault';

  // parameterized
  static const chat = 'chat';
  static const call = 'call';
  static const userProfile = 'userProfile';
  static const groupsRadar = 'groupsRadar';
  static const groupsVault = 'groupsVault';
  static const groupsQuiz = 'groupsQuiz';
  static const groupsDiary = 'groupsDiary';
  static const reelsExplore = 'reelsExplore';

  // Moments (Locket-style)
  static const momentsCamera = 'momentsCamera';
  static const momentDetail = 'momentDetail';
}

/// A [Listenable] that fires whenever the auth state changes so
/// GoRouter re-runs its `redirect` callback.
class _GoRouterRefreshNotifier extends ChangeNotifier {
  _GoRouterRefreshNotifier(this._ref) {
    // We listen on currentUserProvider — the canonical signal for
    // login/logout. AuthController invalidates the underlying authService
    // provider whenever state changes, which re-emits through here.
    _ref.listen<UserModel?>(
      currentUserProvider,
      (_, next) {
        final loggedIn = next != null && ApiService.sharedToken != null;
        debugPrint('[GoRouter] auth state changed -> loggedIn=$loggedIn');
        notifyListeners();
      },
    );
  }
  final Ref _ref;
}

final goRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _GoRouterRefreshNotifier(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: true,
    refreshListenable: refresh,
    redirect: (context, state) {
      final isAuthed = ref.read(isAuthenticatedProvider);
      final loc = state.matchedLocation;
      final goingToAuth = loc == '/login' || loc == '/register';
      if (!isAuthed && !goingToAuth) return '/login';
      if (isAuthed && goingToAuth) return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        name: AppRoutes.login,
        builder: (_, __) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
        name: AppRoutes.register,
        builder: (_, __) => const RegisterPage(),
      ),
      ShellRoute(
        builder: (context, state, child) => MainNavigationPage(child: child),
        routes: [
          GoRoute(
            path: '/',
            name: AppRoutes.home,
            builder: (_, __) => const HomePage(),
          ),
          GoRoute(
            path: '/explore',
            name: AppRoutes.explore,
            builder: (_, __) => const ExplorePage(),
          ),
          GoRoute(
            path: '/messages',
            name: AppRoutes.messages,
            builder: (_, __) => const MessagesPage(),
          ),
          GoRoute(
            path: '/groups',
            name: AppRoutes.groups,
            builder: (_, __) => const GroupsPage(),
          ),
          GoRoute(
            path: '/profile',
            name: AppRoutes.profile,
            builder: (_, __) => const ProfilePage(),
          ),
        ],
      ),
      GoRoute(
        path: '/search',
        name: AppRoutes.search,
        builder: (_, __) => const SearchPage(),
      ),
      GoRoute(
        path: '/notifications',
        name: AppRoutes.notifications,
        builder: (_, __) => const NotificationsPage(),
      ),
      GoRoute(
        path: '/vault',
        name: AppRoutes.vault,
        builder: (_, __) => const VaultPage(),
      ),
      GoRoute(
        path: '/profile/edit',
        name: AppRoutes.editProfile,
        builder: (_, __) => const EditProfilePage(),
      ),
      GoRoute(
        path: '/u/:id',
        name: AppRoutes.userProfile,
        builder: (_, state) =>
            OtherUserProfilePage(userId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/chat/:id',
        name: AppRoutes.chat,
        builder: (_, state) =>
            ChatPage(conversationId: state.pathParameters['id']!),
      ),
      // Friendly alias that matches the web route convention
      // (`/messages/:id`). Both paths resolve to the same ChatPage.
      GoRoute(
        path: '/messages/:id',
        name: AppRoutes.messages + 'Detail',
        builder: (_, state) =>
            ChatPage(conversationId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/call/:id',
        name: AppRoutes.call,
        builder: (_, state) =>
            CallPage(callId: state.pathParameters['id']!),
      ),
      // Moments (Locket-style)
      GoRoute(
        path: '/moments/camera',
        name: AppRoutes.momentsCamera,
        builder: (_, __) => const MomentCameraPage(),
      ),
      GoRoute(
        path: '/moments/:id',
        name: AppRoutes.momentDetail,
        builder: (_, state) =>
            MomentDetailPage(momentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/groups/radar',
        name: AppRoutes.groupsRadar,
        builder: (_, __) => const RadarPage(),
      ),
      GoRoute(
        path: '/groups/vault',
        name: AppRoutes.groupsVault,
        builder: (_, __) => groups_vault.VaultPage(),
      ),
      GoRoute(
        path: '/groups/quiz',
        name: AppRoutes.groupsQuiz,
        builder: (_, __) => const QuizPage(),
      ),
      GoRoute(
        path: '/groups/diary',
        name: AppRoutes.groupsDiary,
        builder: (_, __) => const DiaryPage(),
      ),
      // Reels (Locket-style vertical-feed video player that consumes
      // videos already posted by other users). No upload affordance —
      // videos are authored from the main feed / group reel screen so
      // they go through moderation first.
      GoRoute(
        path: '/explore/reels',
        name: AppRoutes.reelsExplore,
        builder: (_, __) => const ReelsExplorePage(),
      ),
    ],
  );
});
