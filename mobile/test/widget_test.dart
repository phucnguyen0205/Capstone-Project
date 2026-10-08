// Smoke test for the dating app.
//
// The legacy "counter" test was removed when the app was rewritten with
// Riverpod + GoRouter. We keep a minimal widget test that simply boots
// the app to ensure the DI / routing graph wires up without crashing.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:pulo/main.dart';

void main() {
  testWidgets('App boots without errors', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: DatingApp()));
    // Pump a single frame; we don't wait for the SSE / presence timers.
    await tester.pump(const Duration(milliseconds: 16));
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
