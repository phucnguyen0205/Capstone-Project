import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:pulo/core/routing/app_router.dart';
import 'package:pulo/core/theme/app_theme.dart';
import 'package:pulo/core/services/api_service.dart';
import 'package:pulo/core/constants/mock_data.dart';

class ExplorePage extends StatefulWidget {
  const ExplorePage({super.key});

  @override
  State<ExplorePage> createState() => _ExplorePageState();
}

class _ExplorePageState extends State<ExplorePage> {
  final ApiService _apiService = ApiService();
  
  List<dynamic> _feed = [];
  List<dynamic> _trending = [];
  bool _isLoadingFeed = true;
  bool _isLoadingTrending = true;
  String? _feedError;
  String? _trendingError;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _apiService.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    await Future.wait([
      _loadFeed(),
      _loadTrending(),
    ]);
  }

  Future<void> _loadFeed() async {
    try {
      final feed = await _apiService.getFeed();
      if (mounted) {
        setState(() {
          _feed = feed;
          _isLoadingFeed = false;
        });
      }
    } catch (e) {
      debugPrint('Feed API Error: $e');
      if (mounted) {
        setState(() {
          _feed = MockData.videoFeed;
          _isLoadingFeed = false;
          _feedError = 'Using mock data';
        });
      }
    }
  }

  Future<void> _loadTrending() async {
    try {
      final trending = await _apiService.getTrending();
      if (mounted) {
        setState(() {
          _trending = trending;
          _isLoadingTrending = false;
        });
      }
    } catch (e) {
      debugPrint('Trending API Error: $e');
      if (mounted) {
        setState(() {
          _trending = MockData.trendingList;
          _isLoadingTrending = false;
          _trendingError = 'Using mock data';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          _buildAppBar(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _loadData,
              color: AppColors.primaryPink,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSearchBar(),
                    const SizedBox(height: 20),
                    _buildCategorySection(),
                    const SizedBox(height: 20),
                    _buildTrendingSection(),
                    const SizedBox(height: 20),
                    _buildNearbySection(),
                    const SizedBox(height: 20),
                    _buildRecentSection(),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: AppColors.backgroundCard,
        border: Border(
          bottom: BorderSide(color: AppColors.borderLight, width: 1),
        ),
      ),
      child: Row(
        children: [
          ShaderMask(
            shaderCallback: (bounds) => AppColors.primaryGradient.createShader(bounds),
            child: const Text(
              'Khám phá',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ),
          const Spacer(),
          // Reels (vertical-feed video player) — opens a dedicated
          // fullscreen surface that consumes video posts authored from
          // the main feed / group reel page.
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: InkWell(
              onTap: () => context.pushNamed(AppRoutes.reelsExplore),
              borderRadius: BorderRadius.circular(20),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  gradient: AppColors.primaryGradient,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.play_circle_outline_rounded,
                        color: Colors.white, size: 16),
                    SizedBox(width: 4),
                    Text(
                      'Reels',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: _loadData,
            icon: const Icon(Icons.refresh_rounded, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.backgroundElevated,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: const Row(
        children: [
          Icon(Icons.search, color: AppColors.textMuted, size: 20),
          SizedBox(width: 8),
          Text(
            'Tìm kiếm người dùng, nhóm, sự kiện...',
            style: TextStyle(fontSize: 14, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _buildCategorySection() {
    final categories = [
      {'icon': Icons.music_note_rounded, 'label': 'Âm nhạc'},
      {'icon': Icons.travel_explore_rounded, 'label': 'Du lịch'},
      {'icon': Icons.palette_rounded, 'label': 'Nghệ thuật'},
      {'icon': Icons.sports_soccer_rounded, 'label': 'Thể thao'},
      {'icon': Icons.restaurant_rounded, 'label': 'Ẩm thực'},
      {'icon': Icons.movie_rounded, 'label': 'Phim ảnh'},
      {'icon': Icons.gamepad_rounded, 'label': 'Game'},
      {'icon': Icons.more_horiz_rounded, 'label': 'Khác'},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Danh mục',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
        ),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4,
            childAspectRatio: 0.9,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
          ),
          itemCount: categories.length,
          itemBuilder: (context, index) {
            final category = categories[index];
            final isActive = index == 0;
            return Column(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: isActive ? AppColors.primaryGradient : null,
                    color: isActive ? null : AppColors.backgroundInput,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(category['icon'] as IconData, color: AppColors.textPrimary, size: 24),
                ),
                const SizedBox(height: 6),
                Text(
                  category['label'] as String,
                  style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                  textAlign: TextAlign.center,
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _buildTrendingSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            ShaderMask(
              shaderCallback: (bounds) => AppColors.primaryGradient.createShader(bounds),
              child: const Text(
                'Xu hướng',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.backgroundInput,
                borderRadius: BorderRadius.circular(100),
              ),
              child: const Row(
                children: [
                  Icon(Icons.trending_up_rounded, size: 14, color: AppColors.primaryPink),
                  SizedBox(width: 4),
                  Text(
                    'Xem thêm',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_isLoadingTrending)
          const Center(child: CircularProgressIndicator(color: AppColors.primaryPink))
        else if (_trending.isEmpty)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Text('Chưa có video xu hướng', style: TextStyle(color: AppColors.textMuted)),
            ),
          )
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _trending.length > 3 ? 3 : _trending.length,
            itemBuilder: (context, index) {
              final item = _trending[index];
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.backgroundElevated,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withOpacity(0.08)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [Colors.grey.shade700, Colors.grey.shade900]),
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item['title']?.toString() ?? 'Video',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              const Icon(Icons.visibility_outlined, size: 12, color: AppColors.textSecondary),
                              const SizedBox(width: 4),
                              Text(
                                item['views']?.toString() ?? '0 views',
                                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: const Text(
                        'Xem',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
      ],
    );
  }

  Widget _buildNearbySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Gần bạn',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 160,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: 5,
            itemBuilder: (context, index) {
              return Container(
                width: 120,
                margin: const EdgeInsets.only(right: 12),
                decoration: BoxDecoration(
                  color: AppColors.backgroundElevated,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withOpacity(0.08)),
                ),
                child: Column(
                  children: [
                    Expanded(
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.grey.shade600, Colors.grey.shade900],
                          ),
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: Column(
                        children: [
                          Text(
                            'User ${index + 1}',
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.location_on, size: 10, color: AppColors.textSecondary),
                              const SizedBox(width: 2),
                              Text(
                                '${(index + 1) * 0.5} km',
                                style: const TextStyle(fontSize: 10, color: AppColors.textSecondary),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildRecentSection() {
    final activities = [
      {'user': 'Minh', 'action': 'đăng video mới', 'time': '5 phút trước'},
      {'user': 'Lan', 'action': 'tham gia nhóm Nhạc Indie', 'time': '15 phút trước'},
      {'user': 'Huy', 'action': 'bình luận về sự kiện', 'time': '30 phút trước'},
      {'user': 'Thảo', 'action': 'theo dõi bạn', 'time': '1 giờ trước'},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Hoạt động gần đây',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
            ),
            TextButton(
              onPressed: () {},
              child: const Text(
                'Xem tất cả',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primaryPink),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_isLoadingFeed)
          const Center(child: CircularProgressIndicator(color: AppColors.primaryPink))
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _feed.isNotEmpty ? 1 : activities.length,
            itemBuilder: (context, index) {
              if (_feed.isNotEmpty) {
                final item = _feed[index];
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.backgroundElevated,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade600,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Icon(Icons.play_arrow, color: Colors.white),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item['username']?.toString() ?? '@user',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              item['title']?.toString() ?? '',
                              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      Column(
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.favorite, size: 12, color: AppColors.primaryPink),
                              const SizedBox(width: 4),
                              Text(
                                _formatNumber(item['likes']),
                                style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            item['tags']?.toString().replaceAll('[', '').replaceAll(']', '').replaceAll('#', '') ?? '',
                            style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              }
              
              final activity = activities[index];
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.backgroundElevated,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade600,
                        borderRadius: BorderRadius.circular(20),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                          children: [
                            TextSpan(
                              text: activity['user'],
                              style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                            ),
                            TextSpan(text: ' ${activity['action']}'),
                          ],
                        ),
                      ),
                    ),
                    Text(
                      activity['time'] as String,
                      style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                    ),
                  ],
                ),
              );
            },
          ),
      ],
    );
  }

  String _formatNumber(dynamic number) {
    if (number is int) {
      if (number >= 1000000) return '${(number / 1000000).toStringAsFixed(1)}M';
      if (number >= 1000) return '${(number / 1000).toStringAsFixed(1)}K';
      return number.toString();
    }
    return number?.toString() ?? '0';
  }
}
