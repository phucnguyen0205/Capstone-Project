import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

/// Quiz sub-page — MBTI / chòm sao style mini-quiz (client-side only,
/// no backend persistence).
///
/// Mirrors `QuizPage` in web.
class QuizPage extends StatefulWidget {
  const QuizPage({super.key});

  @override
  State<QuizPage> createState() => _QuizPageState();
}

class _QuizPageState extends State<QuizPage> {
  int _step = 0;
  final List<int> _answers = [];

  static const _questions = <_Question>[
    _Question(
      prompt: 'Khi gặp người mới, bạn thường...',
      options: [
        _Option(label: 'Bắt chuyện trước', value: 0, weight: {0: 2, 3: 1}),
        _Option(label: 'Chờ họ nói trước', value: 1, weight: {1: 2, 2: 1}),
      ],
    ),
    _Question(
      prompt: 'Bạn nghĩ gì về việc lên kế hoạch?',
      options: [
        _Option(
            label: 'Rất thích — chi tiết là sức mạnh',
            value: 0,
            weight: {1: 2, 4: 1}),
        _Option(
            label: 'Tùy hứng cảm hứng',
            value: 1,
            weight: {3: 2, 0: 1}),
      ],
    ),
    _Question(
      prompt: 'Khi bạn bè tâm sự buồn, bạn sẽ...',
      options: [
        _Option(
            label: 'Đưa ra lời khuyên thực tế',
            value: 0,
            weight: {2: 2, 4: 1}),
        _Option(
            label: 'Lắng nghe và thấu hiểu cảm xúc',
            value: 1,
            weight: {3: 2, 1: 1}),
      ],
    ),
    _Question(
      prompt: 'Bạn tiếp cận vấn đề mới như thế nào?',
      options: [
        _Option(
            label: 'Phân tích logic trước',
            value: 0,
            weight: {1: 2, 4: 1}),
        _Option(
            label: 'Tin vào trực giác',
            value: 1,
            weight: {3: 2, 0: 1}),
      ],
    ),
    _Question(
      prompt: 'Cuối tuần lý tưởng của bạn?',
      options: [
        _Option(
            label: 'Gặp gỡ nhiều người, khám phá địa điểm mới',
            value: 0,
            weight: {0: 2, 3: 1}),
        _Option(
            label: 'Ở nhà, đọc sách / xem phim một mình',
            value: 1,
            weight: {1: 2, 2: 1}),
      ],
    ),
  ];

  void _answer(_Option o) {
    setState(() {
      _answers.add(o.value);
      if (_step < _questions.length - 1) {
        _step++;
      } else {
        _step = -1; // done
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0C14),
      appBar: AppBar(
        title: const Text('Trắc nghiệm tính cách',
            style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0C0C14),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SafeArea(
        child: _step < 0
            ? _resultView()
            : _step >= 0 && _step < _questions.length
                ? _questionView(_questions[_step])
                : const SizedBox.shrink(),
      ),
    );
  }

  Widget _questionView(_Question q) {
    final progress = (_step + 1) / _questions.length;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LinearProgressIndicator(
            value: progress,
            backgroundColor: const Color(0xFF171920),
            valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFFF2E93)),
            minHeight: 4,
          ),
          const SizedBox(height: 4),
          Text(
            'Câu ${_step + 1}/${_questions.length}',
            style: const TextStyle(color: Color(0xFF626775), fontSize: 11),
          ),
          const SizedBox(height: 16),
          Text(q.prompt,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  height: 1.4)),
          const SizedBox(height: 24),
          ...q.options.map((o) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _OptionButton(
                  label: o.label,
                  onTap: () => _answer(o),
                ),
              )),
        ],
      ),
    );
  }

  Widget _resultView() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const SizedBox(height: 40),
          Container(
            width: 120,
            height: 120,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
              ),
            ),
            child: const Icon(LucideIcons.sparkles,
                color: Colors.white, size: 56),
          ),
          const SizedBox(height: 16),
          const Text(
            'Hồ sơ chòm sao của bạn',
            style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          _TraitBreakdown(answers: _answers),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF171920),
              border: Border.all(color: const Color(0xFF242831)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Tóm tắt',
                    style: TextStyle(
                        color: Color(0xFFA0A5B5),
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
                SizedBox(height: 6),
                Text(
                  'Bạn có xu hướng cân bằng giữa cảm xúc và lý trí, thích khám phá nhưng cũng biết trân trọng những khoảnh khắc riêng tư.',
                  style: TextStyle(
                      color: Colors.white, fontSize: 13, height: 1.4),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
                ),
              ),
              child: TextButton(
                onPressed: () => setState(() {
                  _step = 0;
                  _answers.clear();
                }),
                child: const Text('Làm lại',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.bold)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TraitBreakdown extends StatelessWidget {
  final List<int> answers;
  const _TraitBreakdown({required this.answers});

  static const _traits = [
    ('Hướng ngoại', 0, Color(0xFFFBBF24)),
    ('Trực giác', 1, Color(0xFF34D399)),
    ('Lý trí', 2, Color(0xFF06B6D4)),
    ('Cảm xúc', 3, Color(0xFFF472B6)),
    ('Nguyên tắc', 4, Color(0xFF8B5CF6)),
  ];

  @override
  Widget build(BuildContext context) {
    final scores = List<int>.filled(_traits.length, 0);
    for (final v in answers) {
      scores[v % scores.length] += 1;
    }
    return Column(
      children: List.generate(_traits.length, (i) {
        final t = _traits[i];
        final score = scores[i] + 1; // base 1
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              SizedBox(
                width: 80,
                child: Text(t.$1,
                    style: const TextStyle(
                        color: Color(0xFFA0A5B5),
                        fontSize: 12,
                        fontWeight: FontWeight.w600)),
              ),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: score / 6,
                    backgroundColor: const Color(0xFF242831),
                    valueColor: AlwaysStoppedAnimation<Color>(t.$3),
                    minHeight: 8,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Text(score.toString(),
                  style: const TextStyle(
                      color: Color(0xFF626775),
                      fontSize: 11,
                      fontWeight: FontWeight.w600)),
            ],
          ),
        );
      }),
    );
  }
}

class _Question {
  final String prompt;
  final List<_Option> options;
  const _Question({required this.prompt, required this.options});
}

class _Option {
  final String label;
  final int value;
  final Map<int, int> weight;
  const _Option({
    required this.label,
    required this.value,
    required this.weight,
  });
}

class _OptionButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _OptionButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF171920),
          border: Border.all(color: const Color(0xFF242831)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w500)),
            ),
            const Icon(LucideIcons.arrowRight,
                color: Color(0xFF626775), size: 16),
          ],
        ),
      ),
    );
  }
}
