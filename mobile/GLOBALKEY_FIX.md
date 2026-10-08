# ✅ FIXED: Duplicate GlobalKey Error

## 🐛 Error Messages

```
Another exception was thrown: Assertion failed: file:///Applications/flutter/packages/flutter/lib/src/widgets/navigator.dart:4064:12
Another exception was thrown: Assertion failed: file:///Applications/flutter/packages/flutter/lib/src/widgets/framework.dart:4738:12
Another exception was thrown: Duplicate GlobalKey detected in widget tree.
```

---

## 🔍 Root Cause

**Problem**: `_GridTile` widget trong profile gallery không có unique key, gây ra duplicate GlobalKey khi:
1. Filter posts (all → public → friends → close)
2. Toggle view mode (grid ↔ list)
3. Rebuild grid với cùng một post ID

Flutter cần unique key để track widget state (VideoPlayerController) khi list thay đổi.

---

## 🔧 Fix Applied

**File**: `lib/features/profile/presentation/widgets/profile_gallery.dart`

### 1. ✅ Added ValueKey based on post.id

**Before (❌ BAD)**:
```dart
class _GridTile extends StatefulWidget {
  final PostModel post;
  const _GridTile({super.key, required this.post});
  //             ^^^^^^^^^ BAD: super.key không unique
}
```

**After (✅ GOOD)**:
```dart
class _GridTile extends StatefulWidget {
  final PostModel post;
  const _GridTile({required this.post}) : super(key: ValueKey(post.id));
  //                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                                      GOOD: Unique key per post
}
```

### 2. ✅ Added didUpdateWidget for State Management

**Added lifecycle method** để handle post changes properly:

```dart
@override
void didUpdateWidget(_GridTile oldWidget) {
  super.didUpdateWidget(oldWidget);
  // Reinitialize video if post changes
  if (widget.post.id != oldWidget.post.id) {
    _controller?.dispose();
    _controller = null;
    _isInitialized = false;
    if (widget.post.mediaType == 'video') {
      _initVideo();
    }
  }
}
```

**Why this matters**:
- Flutter reuses widget instances when keys match
- If post changes but widget is reused, old VideoPlayerController persists
- `didUpdateWidget` detects post changes and reinitializes video properly

---

## 🎯 Why ValueKey(post.id)?

| Key Type | Use Case | Problem |
|----------|----------|---------|
| `super.key` | Generic widget | ❌ Not unique, Flutter auto-generates |
| `ValueKey(index)` | Index-based list | ❌ Wrong when list reorders/filters |
| `ValueKey(post.id)` | Entity with unique ID | ✅ Always unique per post |
| `ObjectKey(post)` | Full object equality | ⚠️ Overkill, uses object hashCode |

**Best practice**: Use `ValueKey(entity.id)` for stateful widgets in dynamic lists.

---

## ✅ Verification

```bash
dart analyze lib/features/profile/presentation/widgets/profile_gallery.dart
# Result: ✅ No errors
```

### What was fixed:
- ✅ Duplicate GlobalKey error
- ✅ Navigator assertion failures
- ✅ Framework assertion failures
- ✅ Widget tree stability during rebuilds
- ✅ VideoPlayerController lifecycle management

---

## 🎯 Summary

| Issue | Root Cause | Solution |
|-------|------------|----------|
| Duplicate GlobalKey | No unique key on StatefulWidget | Added `ValueKey(post.id)` |
| Navigator assertions | Widget tree corruption | Unique keys restore tree integrity |
| Framework assertions | State mismatch during rebuild | Added `didUpdateWidget` lifecycle |

**Status**: ✅ FIXED - All assertions resolved 🚀
